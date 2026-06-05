import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { VolvoApiClient, VehicleStatus } from './volvoApi';
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
export declare class VolvoPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly hbApi: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    readonly pluginVersion: string;
    readonly api: VolvoApiClient;
    readonly config: VolvoConfig;
    private readonly storageFile;
    private readonly provider;
    private readonly otp;
    private readonly cacheStore;
    private readonly cacheInFlight;
    private cacheGeneration;
    private get cacheTtlMs();
    getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T>;
    /** Wipe all cached and in-flight data so the next fetch is guaranteed fresh. */
    invalidateCache(): void;
    private readonly pollRegistry;
    registerPoll(fn: () => Promise<void>): void;
    refreshAll(): Promise<void>;
    getCachedDoorsAndLocks(): Promise<VehicleStatus>;
    getCachedWindows(): Promise<Record<string, string>>;
    getCachedStatistics(): Promise<{
        distanceToEmptyTank?: number;
        distanceToEmptyBattery?: number;
    }>;
    constructor(log: Logger, config: PlatformConfig, hbApi: API);
    supportsEngine(): boolean;
    dbg(msg: string): void;
    private loadState;
    private saveState;
    private authenticate;
    private logSupportedCommands;
    configureAccessory(accessory: PlatformAccessory): void;
    private discoverDevices;
}
//# sourceMappingURL=platform.d.ts.map