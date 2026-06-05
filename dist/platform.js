"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VolvoPlatform = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const settings_1 = require("./settings");
const volvoApi_1 = require("./volvoApi");
const lockAccessory_1 = require("./accessories/lockAccessory");
const controlsAccessory_1 = require("./accessories/controlsAccessory");
const doorsAccessory_1 = require("./accessories/doorsAccessory");
const windowsAccessory_1 = require("./accessories/windowsAccessory");
const energyAccessory_1 = require("./accessories/energyAccessory");
const rangeAccessory_1 = require("./accessories/rangeAccessory");
const diagnosticsAccessory_1 = require("./accessories/diagnosticsAccessory");
const locationAccessory_1 = require("./accessories/locationAccessory");
const leftOpenAccessory_1 = require("./accessories/leftOpenAccessory");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: PLUGIN_VERSION } = require('../package.json');
class VolvoPlatform {
    get cacheTtlMs() {
        const pollMs = (this.config.pollInterval ?? 1800) * 1000;
        // Scale the dedup window with the poll interval (10%), with a 5s floor for short
        // intervals and a half-interval ceiling so the cache can NEVER survive into the
        // next poll cycle — guaranteeing every regular poll fetches fresh data.
        const tenPercent = Math.floor(pollMs * 0.10);
        const floored = Math.max(tenPercent, 5000);
        return Math.min(floored, Math.floor(pollMs / 2));
    }
    getCached(key, fetcher) {
        const cached = this.cacheStore.get(key);
        if (cached && Date.now() - cached.ts < this.cacheTtlMs) {
            this.dbg(`cache[${key}]: hit`);
            return Promise.resolve(cached.data);
        }
        const inFlight = this.cacheInFlight.get(key);
        if (inFlight) {
            this.dbg(`cache[${key}]: joining in-flight request`);
            return inFlight;
        }
        const generation = this.cacheGeneration;
        const promise = fetcher()
            .then(data => {
            // Only write to the store if no invalidation happened since this fetch began —
            // discards stale data from a request that started before a manual refresh.
            if (generation === this.cacheGeneration) {
                this.cacheStore.set(key, { data, ts: Date.now() });
            }
            // Identity guard: only clear if we are still the owning request for this key.
            if (this.cacheInFlight.get(key) === promise)
                this.cacheInFlight.delete(key);
            return data;
        })
            .catch(err => {
            if (this.cacheInFlight.get(key) === promise)
                this.cacheInFlight.delete(key);
            throw err;
        });
        this.cacheInFlight.set(key, promise);
        return promise;
    }
    /** Wipe all cached and in-flight data so the next fetch is guaranteed fresh. */
    invalidateCache() {
        this.cacheGeneration++;
        this.cacheStore.clear();
        this.cacheInFlight.clear();
    }
    registerPoll(fn) {
        this.pollRegistry.push(fn);
    }
    async refreshAll() {
        this.log.info('Manual refresh triggered — polling all accessories');
        // Clear everything so the manual refresh fetches genuinely fresh data and never
        // joins an in-flight request that started before the user pressed Refresh.
        this.invalidateCache();
        await Promise.allSettled(this.pollRegistry.map(fn => fn()));
        this.log.info('Manual refresh complete');
    }
    getCachedDoorsAndLocks() {
        return this.getCached('doors', () => this.api.getDoorsAndLocks());
    }
    getCachedWindows() {
        return this.getCached('windows', () => this.api.getWindows());
    }
    getCachedStatistics() {
        return this.getCached('statistics', () => this.api.getStatistics());
    }
    constructor(log, config, hbApi) {
        this.log = log;
        this.hbApi = hbApi;
        this.accessories = [];
        this.pluginVersion = PLUGIN_VERSION;
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
        this.cacheStore = new Map();
        this.cacheInFlight = new Map();
        // Incremented on every invalidateCache(). A fetch only writes its result to the
        // store if the generation is unchanged since it started — so a request that began
        // before a manual refresh can never overwrite fresher post-refresh data.
        this.cacheGeneration = 0;
        // Poll registry — accessories register here so the refresh switch can trigger all at once
        this.pollRegistry = [];
        this.Service = hbApi.hap.Service;
        this.Characteristic = hbApi.hap.Characteristic;
        this.config = config;
        this.storageFile = path.join(hbApi.user.storagePath(), 'homebridge-volvo-xc90.json');
        const debugFn = this.config.debug
            ? (msg) => this.log.info(`[DEBUG] ${msg}`)
            : undefined;
        if (this.config.clientId && this.config.clientSecret) {
            this.provider = new volvoApi_1.OAuthAuthProvider(this.config.clientId, this.config.clientSecret, debugFn);
            this.otp = null;
        }
        else {
            const otpProvider = new volvoApi_1.OtpAuthProvider(debugFn);
            this.provider = otpProvider;
            this.otp = otpProvider;
        }
        this.api = new volvoApi_1.VolvoApiClient(this.config.vccApiKey, this.config.vin, this.provider, debugFn);
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
    supportsEngine() { return this.provider.supportsEngine(); }
    dbg(msg) {
        if (this.config.debug) {
            this.log.info(`[DEBUG] ${msg}`);
        }
    }
    // ── Persistent storage ────────────────────────────────────────────────────
    loadState() {
        this.dbg(`State file: ${this.storageFile}`);
        try {
            if (fs.existsSync(this.storageFile)) {
                const state = JSON.parse(fs.readFileSync(this.storageFile, 'utf-8'));
                this.dbg(`Loaded state: authMethod=${state.authMethod ?? 'none'}, hasTokens=${!!state.tokens}, hasRefreshToken=${!!state.tokens?.refresh_token}`);
                return state;
            }
            this.dbg('No state file found — starting fresh');
        }
        catch {
            this.dbg('Could not read persisted state');
        }
        return {};
    }
    saveState(state) {
        try {
            fs.writeFileSync(this.storageFile, JSON.stringify(state, null, 2));
            this.dbg(`State saved: authMethod=${state.authMethod ?? 'none'}, hasTokens=${!!state.tokens}, hasRefreshToken=${!!state.tokens?.refresh_token}`);
        }
        catch (err) {
            this.log.warn('Could not save auth state:', err.message);
        }
    }
    // ── Authentication orchestration ──────────────────────────────────────────
    async authenticate() {
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
            this.dbg(`OAuth token source: ${tokenSource}`);
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
            }
            catch (err) {
                this.log.error('OAuth token refresh failed:', err.message);
                // If the state token failed and a different config token is available, try it as fallback.
                // Never clear state on failure — doing so causes the next restart to retry the already-consumed
                // config token, creating an infinite failure loop.
                const configToken = this.config.refreshToken;
                if (tokenSource === 'state' && configToken && configToken !== refreshToken) {
                    this.log.warn('Stored token failed — retrying with config refreshToken...');
                    try {
                        const tokens = await this.provider.refreshAccessToken(configToken);
                        this.api.setTokens(tokens);
                        this.saveState({ authMethod: 'oauth', tokens });
                        this.log.info('Authentication successful (OAuth via config token)');
                        await this.logSupportedCommands();
                        return true;
                    }
                    catch {
                        // fall through to error
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
            }
            catch {
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
                    const tokens = await this.otp.completeOtpFlow(this.config.otp, state.authFlow);
                    this.api.setTokens(tokens);
                    this.saveState({ authMethod: 'otp', tokens });
                    this.log.info('Authentication successful (OTP)');
                    this.log.info('You can now clear the OTP field in the plugin settings.');
                    await this.logSupportedCommands();
                    return true;
                }
                catch (err) {
                    this.log.error('OTP verification failed:', err.message);
                    this.saveState({});
                }
            }
            else {
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
                const flowState = await this.otp.initiateOtpFlow(this.config.username, this.config.password);
                const tokens = await this.otp.completeOtpFlow(this.config.otp, flowState);
                this.api.setTokens(tokens);
                this.saveState({ authMethod: 'otp', tokens });
                this.log.info('Authentication successful (fresh OTP flow)');
                this.log.info('You can now clear the OTP field in the plugin settings.');
                await this.logSupportedCommands();
                return true;
            }
            catch (err) {
                this.log.error('OTP login failed:', err.message);
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
            const flowState = await this.otp.initiateOtpFlow(this.config.username, this.config.password);
            this.saveState({ authMethod: 'otp', authFlow: flowState });
            this.log.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.log.warn('OTP sent to your Volvo ID email address.');
            this.log.warn('1. Check your email for a 6-digit code from Volvo');
            this.log.warn('2. Open Homebridge UI → Plugins → Volvo XC90 → Settings');
            this.log.warn('3. Paste the code into the "One-Time Password (OTP)" field');
            this.log.warn('4. Save and restart Homebridge');
            this.log.warn('After login, you can remove email, password, and OTP from settings.');
            this.log.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
        catch (err) {
            this.log.error('Failed to initiate OTP flow:', err.message);
        }
        return false;
    }
    async logSupportedCommands() {
        try {
            const supported = await this.api.getSupportedCommands();
            this.log.info(`Supported commands: ${supported.join(', ')}`);
        }
        catch {
            this.log.warn('Could not fetch supported commands');
        }
    }
    // ── Homebridge lifecycle ──────────────────────────────────────────────────
    configureAccessory(accessory) {
        this.dbg(`Restoring cached accessory: ${accessory.displayName}`);
        this.accessories.push(accessory);
    }
    discoverDevices() {
        const pollInterval = (this.config.pollInterval ?? 1800) * 1000;
        const engineDuration = this.config.engineStartDuration ?? 15;
        const vin = this.config.vin;
        // Migrate: unregister legacy single-purpose accessories that were merged into combined tiles
        for (const legacyId of [`${vin}-engine`, `${vin}-charging`, `${vin}-service-due`]) {
            const legacyUuid = this.hbApi.hap.uuid.generate(legacyId);
            const legacy = this.accessories.find(a => a.UUID === legacyUuid);
            if (legacy) {
                this.log.info(`Removing legacy accessory: ${legacy.displayName}`);
                this.hbApi.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [legacy]);
            }
        }
        const devices = [
            {
                id: `${vin}-lock`,
                name: 'Volvo Lock',
                Class: lockAccessory_1.LockAccessory,
                show: this.config.showLock !== false,
            },
            {
                id: `${vin}-climate`,
                name: 'Volvo Controls',
                Class: controlsAccessory_1.ControlsAccessory,
                show: this.config.showClimate !== false || (this.config.showEngine === true && this.provider.supportsEngine()) ||
                    this.config.showHonkFlash !== false || this.config.showHonk === true || this.config.showFlash === true,
            },
            {
                id: `${vin}-doors`,
                name: 'Volvo Doors',
                Class: doorsAccessory_1.DoorsAccessory,
                show: this.config.showDoors !== false,
            },
            {
                id: `${vin}-windows`,
                name: 'Volvo Windows',
                Class: windowsAccessory_1.WindowsAccessory,
                show: this.config.showWindows !== false,
            },
            {
                id: `${vin}-diagnostics`,
                name: 'Volvo Diagnostics',
                Class: diagnosticsAccessory_1.DiagnosticsAccessory,
                show: this.config.showDiagnostics !== false,
            },
            {
                id: `${vin}-range-ev`,
                name: 'EV Range km',
                Class: rangeAccessory_1.EVRangeAccessory,
                show: this.config.showRange !== false && this.config.showCharging !== false && this.config.rangeStandalone !== false,
            },
            {
                id: `${vin}-range-tank`,
                name: 'Tank Range km',
                Class: rangeAccessory_1.TankRangeAccessory,
                show: this.config.showRange !== false && this.config.showFuel !== false && this.config.rangeStandalone !== false,
            },
            {
                id: `${vin}-fuel`,
                name: 'Volvo Energy',
                Class: energyAccessory_1.EnergyAccessory,
                show: this.config.showFuel !== false || this.config.showCharging !== false,
            },
            {
                id: `${vin}-location`,
                name: 'Car at Home',
                Class: locationAccessory_1.LocationAccessory,
                show: this.config.showLocation === true,
            },
            {
                id: `${vin}-left-open`,
                name: 'Left Open',
                Class: leftOpenAccessory_1.LeftOpenAccessory,
                show: this.config.showLeftOpen === true,
            },
        ];
        for (const device of devices) {
            const uuid = this.hbApi.hap.uuid.generate(device.id);
            const existing = this.accessories.find(a => a.UUID === uuid);
            if (!device.show) {
                if (existing) {
                    this.log.info(`Removing disabled accessory: ${device.name}`);
                    this.hbApi.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [existing]);
                }
                continue;
            }
            if (existing) {
                this.log.info(`Restoring accessory: ${device.name}`);
                new device.Class(this, existing, { pollInterval, engineDuration });
            }
            else {
                this.log.info(`Registering accessory: ${device.name}`);
                const accessory = new this.hbApi.platformAccessory(device.name, uuid);
                new device.Class(this, accessory, { pollInterval, engineDuration });
                this.hbApi.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
            }
        }
    }
}
exports.VolvoPlatform = VolvoPlatform;
//# sourceMappingURL=platform.js.map