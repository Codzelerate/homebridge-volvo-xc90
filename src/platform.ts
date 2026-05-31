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
import { VolvoApiClient, TokenSet, AuthFlowState } from './volvoApi';
import { LockAccessory } from './accessories/lockAccessory';
import { ClimateAccessory } from './accessories/climateAccessory';
import { EngineAccessory } from './accessories/engineAccessory';
import { DoorsAccessory } from './accessories/doorsAccessory';
import { FuelAccessory } from './accessories/fuelAccessory';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: PLUGIN_VERSION } = require('../package.json') as { version: string };

export interface VolvoConfig extends PlatformConfig {
  username: string;
  password: string;
  vccApiKey: string;
  vin: string;
  otp?: string;
  engineStartDuration?: number;
  pollInterval?: number;
  debug?: boolean;
}

interface PersistedState {
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

    this.api = new VolvoApiClient(this.config.vccApiKey, this.config.vin, debugFn);
    this.dbg(`Plugin v${PLUGIN_VERSION} loaded — VIN: ${this.config.vin}`);

    hbApi.on('didFinishLaunching', async () => {
      const authenticated = await this.authenticate();
      if (authenticated) {
        this.discoverDevices();
      }
    });
  }

  dbg(msg: string): void {
    if (this.config.debug) {
      this.log.info(`[DEBUG] ${msg}`);
    }
  }

  // ── Persistent storage ────────────────────────────────────────────────────

  private loadState(): PersistedState {
    try {
      if (fs.existsSync(this.storageFile)) {
        return JSON.parse(fs.readFileSync(this.storageFile, 'utf-8')) as PersistedState;
      }
    } catch {
      this.dbg('Could not read persisted state');
    }
    return {};
  }

  private saveState(state: PersistedState): void {
    try {
      fs.writeFileSync(this.storageFile, JSON.stringify(state, null, 2));
    } catch (err) {
      this.log.warn('Could not save auth state:', (err as Error).message);
    }
  }

  // ── Authentication orchestration ──────────────────────────────────────────

  private async authenticate(): Promise<boolean> {
    const state = this.loadState();

    // 1. Try stored refresh token first
    if (state.tokens?.refresh_token) {
      try {
        this.log.info('Authenticating with stored refresh token...');
        const tokens = await this.api.refreshAccessToken(state.tokens.refresh_token);
        this.api.setTokens(tokens);
        this.saveState({ tokens });
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
          const tokens = await this.api.completeOtpFlow(this.config.otp, state.authFlow);
          this.api.setTokens(tokens);
          this.saveState({ tokens });
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
      try {
        this.log.info('Starting fresh OTP auth flow...');
        const flowState = await this.api.initiateOtpFlow(this.config.username, this.config.password);
        // Submit the OTP immediately in the same flow
        const tokens = await this.api.completeOtpFlow(this.config.otp, flowState);
        this.api.setTokens(tokens);
        this.saveState({ tokens });
        this.log.info('Authentication successful (fresh OTP flow)');
        this.log.info('You can now clear the OTP field in the plugin settings.');
        await this.logSupportedCommands();
        return true;
      } catch (err) {
        this.log.error('OTP login failed:', (err as Error).message);
        this.saveState({});
      }
    }

    // 4. No tokens, no OTP → initiate flow to trigger OTP email, then wait
    try {
      this.log.info('No stored credentials. Sending OTP to your email...');
      const flowState = await this.api.initiateOtpFlow(this.config.username, this.config.password);
      this.saveState({ authFlow: flowState });
      this.log.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.log.warn('OTP sent to your Volvo ID email address.');
      this.log.warn('1. Check your email for a 6-digit code from Volvo');
      this.log.warn('2. Open Homebridge UI → Plugins → Volvo XC90 → Settings');
      this.log.warn('3. Paste the code into the "One-Time Password (OTP)" field');
      this.log.warn('4. Save and restart Homebridge');
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
    const pollInterval = (this.config.pollInterval ?? 30) * 1000;
    const engineDuration = this.config.engineStartDuration ?? 15;
    const vin = this.config.vin;

    const devices = [
      { id: `${vin}-lock`,    name: 'Volvo Lock',    Class: LockAccessory },
      { id: `${vin}-climate`, name: 'Volvo Climate', Class: ClimateAccessory },
      { id: `${vin}-engine`,  name: 'Volvo Engine',  Class: EngineAccessory },
      { id: `${vin}-doors`,   name: 'Volvo Doors',   Class: DoorsAccessory },
      { id: `${vin}-fuel`,    name: 'Volvo Fuel',    Class: FuelAccessory },
    ];

    for (const device of devices) {
      const uuid = this.hbApi.hap.uuid.generate(device.id);
      const existing = this.accessories.find(a => a.UUID === uuid);
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
