import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
export declare class LeftOpenAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private service;
    private isOpen;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
    private poll;
}
//# sourceMappingURL=leftOpenAccessory.d.ts.map