import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
export declare class DiagnosticsAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private services;
    private lastWarningState;
    private serviceDueOpen;
    private readonly serviceIntervalMonths;
    private readonly serviceIntervalKm;
    private readonly serviceAlertThreshold;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
    private calcServiceLifeLevel;
    private poll;
}
//# sourceMappingURL=diagnosticsAccessory.d.ts.map