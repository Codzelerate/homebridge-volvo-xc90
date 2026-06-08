import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import * as fs from 'fs';
import * as path from 'path';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { VolvoApiClient, OtpAuthProvider, OAuthAuthProvider, AuthProvider, TokenSet, AuthFlowState, VehicleStatus } from './volvoApi';
import { LockAccessory } from './accessories/lockAccessory';
import { ControlsAccessory } from './accessories/controlsAccessory';
import { DoorsAccessory } from './accessories/doorsAccessory';
import { WindowsAccessory } from './accessories/windowsAccessory';
import { EnergyAccessory } from './accessories/energyAccessory';
import { EVRangeAccessory, TankRangeAccessory } from './accessories/rangeAccessory';
import { DiagnosticsAccessory } from './accessories/diagnosticsAccessory';
import { LocationAccessory } from './accessories/locationAccessory';
import { LeftOpenAccessory } from './accessories/leftOpenAccessory';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: PLUGIN_VERSION } = require('../package.json') as { version: string };

export interface VolvoConfig extends PlatformConfig {
  vccApiKey: string;
  vin: string;
  username?: string;
  password?: string;
  otp?: string;
  engineStartDuration?: number;
  pollInterval?: number;
  debug?: boolean;
  showLock?: boolean;
  showClimate?: boolean;
  showEngine?: boolean;
  showDoors?: boolean;
  showFuel?: boolean;
  showCharging?: boolean;
  showHonk?: boolean;
  showFlash?: boolean;
  showHonkFlash?: boolean;
  showWindows?: boolean;
  showDiagnostics?: boolean;
  showRange?: boolean;
  rangeStandalone?: boolean;
  showLocation?: boolean;
  homeLatitude?: number;
  homeLongitude?: number;
  homeRadiusMeters?: number;
  showRefresh?: boolean;
  showLeftOpen?: boolean;
  showChargingEta?: boolean;
  serviceIntervalMonths?: number;
  serviceIntervalKm?: number;
  serviceAlertThreshold?: number;
  tankCapacityLiters?: number;
  evLowChargeThreshold?: number;
  forceReauth?: boolean;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

interface PersistedState {
  authMethod?: 'otp' | 'oauth';
  tokens?: TokenSet;
  authFlow?: AuthFlowState;
}

export class VolvoPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  public readonly pluginVersion = PLUGIN_VERSION;

  public readonly api: VolvoApiClient;
  public readonly config: VolvoConfig;
  private readonly storageFile: string;
  private readonly provider: AuthProvider;
  private readonly otp: OtpAuthProvider | null;

  // Generic in-cycle cache with in-flight deduplication.
  //
  // Purpose: collapse duplicate API calls that fire within the SAME poll cycle.
  // It must NEVER serve data across poll cycles — each 150s poll, and every manual
  // refresh, gets genuinely fresh data. Two guarantees enforce this:
  //
  //   1. Adaptive TTL — capped at half the poll interval, so the cache is always
  //      expired by the time the next cycle starts (even on a hand-edited low interval).
  //   2. Manual refresh calls invalidateCache() first, clearing everything so the
  //      Refresh switch always fetches fresh and never joins a pre-refresh request.
  //
  // The in-flight map is the primary deduper: accessories poll in the same macrotask
  // batch, so the first to request an endpoint starts the fetch and the rest join the
  // same promise. The TTL store is a secondary safety net for slight timing drift.
  private readonly cacheStore = new Map<string, { data: unknown; ts: number }>();
  private readonly cacheInFlight = new Map<string, Promise<unknown>>();
  // Incremented on every invalidateCache(). A fetch only writes its result to the
  // store if the generation is unchanged since it started — so a request that began
  // before a manual refresh can never overwrite fresher post-refresh data.
  private cacheGeneration = 0;

  private get cacheTtlMs(): number {
    const pollMs = (this.config.pollInterval ?? 1800) * 1000;
    // Scale the dedup window with the poll interval (10%), with a 5s floor for short
    // intervals and a half-interval ceiling so the cache can NEVER survive into the
    // next poll cycle — guaranteeing every regular poll fetches fresh data.
    const tenPercent = Math.floor(pollMs * 0.10);
    const floored    = Math.max(tenPercent, 5_000);
    return Math.min(floored, Math.floor(pollMs / 2));
  }

  getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cacheStore.get(key);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) {
      this.dbg(`cache[${key}]: hit (age ${Math.round((Date.now() - cached.ts) / 1000)}s, ttl ${Math.round(this.cacheTtlMs / 1000)}s)`);
      return Promise.resolve(cached.data as T);
    }
    const inFlight = this.cacheInFlight.get(key);
    if (inFlight) {
      this.dbg(`cache[${key}]: joining in-flight request`);
      return inFlight as Promise<T>;
    }
    this.dbg(`cache[${key}]: miss — fetching (ttl ${Math.round(this.cacheTtlMs / 1000)}s, gen ${this.cacheGeneration})`);
    const generation = this.cacheGeneration;
    const promise = fetcher()
      .then(data => {
        // Only write to the store if no invalidation happened since this fetch began —
        // discards stale data from a request that started before a manual refresh.
        if (generation === this.cacheGeneration) {
          this.cacheStore.set(key, { data, ts: Date.now() });
          this.dbg(`cache[${key}]: stored result (gen ${generation})`);
        } else {
          this.dbg(`cache[${key}]: result discarded — generation changed (was ${generation}, now ${this.cacheGeneration})`);
        }
        // Identity guard: only clear if we are still the owning request for this key.
        if (this.cacheInFlight.get(key) === promise) this.cacheInFlight.delete(key);
        return data;
      })
      .catch(err => {
        if (this.cacheInFlight.get(key) === promise) this.cacheInFlight.delete(key);
        throw err;
      });
    this.cacheInFlight.set(key, promise);
    return promise;
  }

  /** Wipe all cached and in-flight data so the next fetch is guaranteed fresh. */
  invalidateCache(): void {
    this.cacheGeneration++;
    this.dbg(`Cache invalidated — generation bumped to ${this.cacheGeneration}, cleared ${this.cacheStore.size} entries`);
    this.cacheStore.clear();
    this.cacheInFlight.clear();
  }

  // Poll registry — accessories register here so the refresh switch can trigger all at once
  private readonly pollRegistry: Array<() => Promise<void>> = [];

  registerPoll(fn: () => Promise<void>): void {
    this.pollRegistry.push(fn);
  }

  async refreshAll(): Promise<void> {
    this.log.info('Manual refresh triggered — polling all accessories');
    // Clear everything so the manual refresh fetches genuinely fresh data and never
    // joins an in-flight request that started before the user pressed Refresh.
    this.invalidateCache();
    await Promise.allSettled(this.pollRegistry.map(fn => fn()));
    this.log.info('Manual refresh complete');
  }

  getCachedDoorsAndLocks(): Promise<VehicleStatus> {
    return this.getCached('doors', () => this.api.getDoorsAndLocks());
  }

  getCachedWindows(): Promise<Record<string, string>> {
    return this.getCached('windows', () => this.api.getWindows());
  }

  getCachedStatistics(): Promise<{ distanceToEmptyTank?: number; distanceToEmptyBattery?: number }> {
    return this.getCached('statistics', () => this.api.getStatistics());
  }

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly hbApi: API,
  ) {
    this.Service = hbApi.hap.Service;
    this.Characteristic = hbApi.hap.Characteristic;
    this.config = config as VolvoConfig;

    this.storageFile = path.join(hbApi.user.storagePath(), 'homebridge-volvo-xc90.json');

    const debugFn = this.config.debug
      ? (msg: string) => this.log.info(`[DEBUG] ${msg}`)
      : undefined;

    if (this.config.clientId && this.config.clientSecret) {
      this.provider = new OAuthAuthProvider(this.config.clientId, this.config.clientSecret, debugFn);
      this.otp = null;
    } else {
      const otpProvider = new OtpAuthProvider(debugFn);
      this.provider = otpProvider;
      this.otp = otpProvider;
    }
    this.api = new VolvoApiClient(this.config.vccApiKey, this.config.vin, this.provider, debugFn);
    this.api.setOnTokensRefreshed(tokens => {
      this.saveState({ authMethod: this.provider.authMethod, tokens });
    });
    this.dbg(`Plugin v${PLUGIN_VERSION} loaded — VIN: ${this.config.vin}`);

    hbApi.on('didFinishLaunching', async () => {
      const authenticated = await this.authenticate();
      if (authenticated) {
        this.discoverDevices();
      }
    });
  }

  supportsEngine(): boolean { return this.provider.supportsEngine(); }

  dbg(msg: string): void {
    if (this.config.debug) {
      this.log.info(`[DEBUG] ${msg}`);
    }
  }

  // ── Persistent storage ────────────────────────────────────────────────────

  private loadState(): PersistedState {
    this.dbg(`State file: ${this.storageFile}`);
    try {
      if (fs.existsSync(this.storageFile)) {
        const state = JSON.parse(fs.readFileSync(this.storageFile, 'utf-8')) as PersistedState;
        const expiry = state.tokens?.expiresAt;
        const expiryInfo = expiry
          ? (Date.now() >= expiry
            ? `EXPIRED ${Math.round((Date.now() - expiry) / 1000)}s ago`
            : `valid for ${Math.round((expiry - Date.now()) / 1000)}s`)
          : 'n/a';
        this.dbg(
          `Loaded state: authMethod=${state.authMethod ?? 'none'}, hasTokens=${!!state.tokens},` +
          ` hasRefreshToken=${!!state.tokens?.refresh_token}, tokenExpiry=${expiryInfo}`,
        );
        return state;
      }
      this.dbg('No state file found — starting fresh');
    } catch {
      this.dbg('Could not read persisted state');
    }
    return {};
  }

  private saveState(state: PersistedState): void {
    try {
      fs.writeFileSync(this.storageFile, JSON.stringify(state, null, 2));
      const expiry = state.tokens?.expiresAt;
      const expiryInfo = expiry
        ? `valid for ${Math.round((expiry - Date.now()) / 1000)}s`
        : 'n/a';
      this.dbg(
        `State saved: authMethod=${state.authMethod ?? 'none'}, hasTokens=${!!state.tokens},` +
        ` hasRefreshToken=${!!state.tokens?.refresh_token}, tokenExpiry=${expiryInfo}`,
      );
    } catch (err) {
      this.log.warn('Could not save auth state:', (err as Error).message);
    }
  }

  // ── Authentication orchestration ──────────────────────────────────────────

  private async authenticate(): Promise<boolean> {
    if (this.config.forceReauth) {
      this.log.warn('Force re-auth enabled — clearing stored tokens. Add your OTP once the email arrives, then disable this option.');
      this.saveState({});
    }

    let state = this.loadState();

    // Clear stored tokens when the auth method changes so OTP and OAuth tokens never cross-contaminate.
    if (state.authMethod && state.authMethod !== this.provider.authMethod) {
      this.log.info(`Auth method changed (${state.authMethod} → ${this.provider.authMethod}) — clearing stored tokens`);
      this.saveState({});
      state = {};
    }

    // ── OAuth path ────────────────────────────────────────────────────────────

    if (this.provider.authMethod === 'oauth') {
      const tokenSource = state.tokens?.refresh_token ? 'state' : (this.config.refreshToken ? 'config' : 'none');
      const refreshToken = state.tokens?.refresh_token ?? this.config.refreshToken;
      this.dbg(`OAuth token source: ${tokenSource}${refreshToken ? ` (rt prefix: ${refreshToken.slice(0, 8)}…)` : ''}`);
      if (!refreshToken) {
        this.log.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.log.error('OAuth is configured but no refresh token was found.');
        this.log.error('Run the OAuth setup tool to get an initial refresh token');
        this.log.error('and add it as "refreshToken" in your plugin config.');
        this.log.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return false;
      }
      try {
        this.log.info('Authenticating with OAuth refresh token...');
        const tokens = await this.provider.refreshAccessToken(refreshToken);
        this.api.setTokens(tokens);
        this.saveState({ authMethod: 'oauth', tokens });
        this.log.info('Authentication successful (OAuth)');
        await this.logSupportedCommands();
        return true;
      } catch (err) {
        this.log.error('OAuth token refresh failed:', (err as Error).message);
        const errStatus = (err as { response?: { status?: number; data?: unknown } }).response?.status;
        const errBody = JSON.stringify((err as { response?: { data?: unknown } }).response?.data ?? {});
        this.dbg(`OAuth refresh error detail: HTTP ${errStatus ?? 'no-response'} — ${errBody}`);
        // If the state token failed and a different config token is available, try it as fallback.
        // Never clear state on failure — doing so causes the next restart to retry the already-consumed
        // config token, creating an infinite failure loop.
        const configToken = this.config.refreshToken;
        if (tokenSource === 'state' && configToken && configToken !== refreshToken) {
          this.log.warn('Stored token failed — retrying with config refreshToken...');
          this.dbg(`Config refreshToken prefix: ${configToken.slice(0, 8)}…`);
          try {
            const tokens = await this.provider.refreshAccessToken(configToken);
            this.api.setTokens(tokens);
            this.saveState({ authMethod: 'oauth', tokens });
            this.log.info('Authentication successful (OAuth via config token)');
            await this.logSupportedCommands();
            return true;
          } catch (err2) {
            const s2 = (err2 as { response?: { status?: number; data?: unknown } }).response?.status;
            const b2 = JSON.stringify((err2 as { response?: { data?: unknown } }).response?.data ?? {});
            this.dbg(`Config token fallback also failed: HTTP ${s2 ?? 'no-response'} — ${b2}`);
          }
        }
        this.log.error('Your refresh token may have expired. Run the setup tool to get a new one.');
        return false;
      }
    }

    // ── OTP path (deprecated) ─────────────────────────────────────────────────

    this.log.warn('OTP authentication will be removed in v2.0.0.');
    this.log.warn('Migrate: register an app at developer.volvocars.com, then add clientId + clientSecret to your config.');

    // 1. Try stored refresh token first
    if (state.tokens?.refresh_token) {
      try {
        this.log.info('Authenticating with stored refresh token...');
        const tokens = await this.provider.refreshAccessToken(state.tokens.refresh_token);
        this.api.setTokens(tokens);
        this.saveState({ authMethod: 'otp', tokens });
        this.log.info('Authentication successful (refresh token)');
        await this.logSupportedCommands();
        return true;
      } catch {
        this.log.warn('Refresh token expired — need fresh OTP login');
        this.saveState({});
      }
    }

    // 2. OTP in config + stored flow state → complete the flow
    if (this.config.otp && state.authFlow) {
      const ageMs = Date.now() - state.authFlow.timestamp;
      if (ageMs < 8 * 60 * 1000) {
        try {
          this.log.info('Completing OTP verification...');
          const tokens = await this.otp!.completeOtpFlow(this.config.otp, state.authFlow);
          this.api.setTokens(tokens);
          this.saveState({ authMethod: 'otp', tokens });
          this.log.info('Authentication successful (OTP)');
          this.log.info('You can now clear the OTP field in the plugin settings.');
          await this.logSupportedCommands();
          return true;
        } catch (err) {
          this.log.error('OTP verification failed:', (err as Error).message);
          this.saveState({});
        }
      } else {
        this.log.warn('OTP auth flow expired (>8 min). Starting fresh — a new OTP will be sent.');
        this.saveState({});
      }
    }

    // 3. OTP in config but no stored flow → do full fresh flow with provided OTP
    if (this.config.otp && !state.authFlow) {
      if (!this.config.username || !this.config.password) {
        this.log.error('OTP provided but no credentials found. Add your Volvo ID email and password to complete login.');
        return false;
      }
      try {
        this.log.info('Starting fresh OTP auth flow...');
        const flowState = await this.otp!.initiateOtpFlow(this.config.username, this.config.password);
        const tokens = await this.otp!.completeOtpFlow(this.config.otp, flowState);
        this.api.setTokens(tokens);
        this.saveState({ authMethod: 'otp', tokens });
        this.log.info('Authentication successful (fresh OTP flow)');
        this.log.info('You can now clear the OTP field in the plugin settings.');
        await this.logSupportedCommands();
        return true;
      } catch (err) {
        this.log.error('OTP login failed:', (err as Error).message);
        this.saveState({});
      }
    }

    // 4. No tokens, no OTP → need credentials to trigger OTP email
    if (!this.config.username || !this.config.password) {
      this.log.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.log.error('No stored session found and no credentials configured.');
      this.log.error('Add your Volvo ID email and password to the plugin');
      this.log.error('settings, save, and restart Homebridge to begin setup.');
      this.log.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return false;
    }

    try {
      this.log.info('No stored session. Sending OTP to your email...');
      const flowState = await this.otp!.initiateOtpFlow(this.config.username, this.config.password);
      this.saveState({ authMethod: 'otp', authFlow: flowState });
      this.log.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.log.warn('OTP sent to your Volvo ID email address.');
      this.log.warn('1. Check your email for a 6-digit code from Volvo');
      this.log.warn('2. Open Homebridge UI → Plugins → Volvo XC90 → Settings');
      this.log.warn('3. Paste the code into the "One-Time Password (OTP)" field');
      this.log.warn('4. Save and restart Homebridge');
      this.log.warn('After login, you can remove email, password, and OTP from settings.');
      this.log.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (err) {
      this.log.error('Failed to initiate OTP flow:', (err as Error).message);
    }

    return false;
  }

  private async logSupportedCommands(): Promise<void> {
    try {
      const supported = await this.api.getSupportedCommands();
      this.log.info(`Supported commands: ${supported.join(', ')}`);
    } catch {
      this.log.warn('Could not fetch supported commands');
    }
  }

  // ── Homebridge lifecycle ──────────────────────────────────────────────────

  configureAccessory(accessory: PlatformAccessory): void {
    this.dbg(`Restoring cached accessory: ${accessory.displayName}`);
    this.accessories.push(accessory);
  }

  private discoverDevices(): void {
    const pollInterval = (this.config.pollInterval ?? 1800) * 1000;
    const engineDuration = this.config.engineStartDuration ?? 15;
    const vin = this.config.vin;

    // Migrate: unregister legacy single-purpose accessories that were merged into combined tiles
    for (const legacyId of [`${vin}-engine`, `${vin}-charging`, `${vin}-service-due`]) {
      const legacyUuid = this.hbApi.hap.uuid.generate(legacyId);
      const legacy = this.accessories.find(a => a.UUID === legacyUuid);
      if (legacy) {
        this.log.info(`Removing legacy accessory: ${legacy.displayName}`);
        this.hbApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [legacy]);
      }
    }

    const devices = [
      {
        id: `${vin}-lock`,
        name: 'Volvo Lock',
        Class: LockAccessory,
        show: this.config.showLock !== false,
      },
      {
        id: `${vin}-climate`,
        name: 'Volvo Controls',
        Class: ControlsAccessory,
        show: this.config.showClimate !== false || (this.config.showEngine === true && this.provider.supportsEngine()) ||
              this.config.showHonkFlash !== false || this.config.showHonk === true || this.config.showFlash === true,
      },
      {
        id: `${vin}-doors`,
        name: 'Volvo Doors',
        Class: DoorsAccessory,
        show: this.config.showDoors !== false,
      },
      {
        id: `${vin}-windows`,
        name: 'Volvo Windows',
        Class: WindowsAccessory,
        show: this.config.showWindows !== false,
      },
      {
        id: `${vin}-diagnostics`,
        name: 'Volvo Diagnostics',
        Class: DiagnosticsAccessory,
        show: this.config.showDiagnostics !== false,
      },
      {
        id: `${vin}-range-ev`,
        name: 'EV Range km',
        Class: EVRangeAccessory,
        show: this.config.showRange !== false && this.config.showCharging !== false && this.config.rangeStandalone !== false,
      },
      {
        id: `${vin}-range-tank`,
        name: 'Tank Range km',
        Class: TankRangeAccessory,
        show: this.config.showRange !== false && this.config.showFuel !== false && this.config.rangeStandalone !== false,
      },
      {
        id: `${vin}-fuel`,
        name: 'Volvo Energy',
        Class: EnergyAccessory,
        show: this.config.showFuel !== false || this.config.showCharging !== false,
      },
      {
        id: `${vin}-location`,
        name: 'Car at Home',
        Class: LocationAccessory,
        show: this.config.showLocation === true,
      },
      {
        id: `${vin}-left-open`,
        name: 'Left Open',
        Class: LeftOpenAccessory,
        show: this.config.showLeftOpen === true,
      },
    ];

    for (const device of devices) {
      const uuid = this.hbApi.hap.uuid.generate(device.id);
      const existing = this.accessories.find(a => a.UUID === uuid);

      if (!device.show) {
        if (existing) {
          this.log.info(`Removing disabled accessory: ${device.name}`);
          this.hbApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existing]);
        }
        continue;
      }

      if (existing) {
        this.log.info(`Restoring accessory: ${device.name}`);
        new device.Class(this, existing, { pollInterval, engineDuration });
      } else {
        this.log.info(`Registering accessory: ${device.name}`);
        const accessory = new this.hbApi.platformAccessory(device.name, uuid);
        new device.Class(this, accessory, { pollInterval, engineDuration });
        this.hbApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
