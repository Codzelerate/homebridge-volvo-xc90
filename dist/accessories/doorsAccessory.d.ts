import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
export declare class DoorsAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private services;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
    private poll;
}
//# sourceMappingURL=doorsAccessory.d.ts.map