import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
export declare class EnergyAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private fuelService;
    private evService;
    private evChargeService;
    private chargerConnectedService;
    private tankRangeService;
    private evRangeService;
    private fuelLevel;
    private chargeLevel;
    private chargerPluggedIn;
    private tankRange;
    private evRange;
    private readonly tankCapacity;
    private readonly evLowThreshold;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
    private poll;
}
//# sourceMappingURL=energyAccessory.d.ts.map