import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
export declare class LockAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private service;
    private currentState;
    private targetState;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
    private poll;
}
//# sourceMappingURL=lockAccessory.d.ts.map