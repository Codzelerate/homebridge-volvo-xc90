import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
type RangeType = 'ev' | 'tank';
declare class RangeAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private readonly type;
    private service;
    private rangeKm;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    }, type: RangeType);
    private poll;
}
export declare class EVRangeAccessory extends RangeAccessory {
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
}
export declare class TankRangeAccessory extends RangeAccessory {
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
}
export {};
//# sourceMappingURL=rangeAccessory.d.ts.map