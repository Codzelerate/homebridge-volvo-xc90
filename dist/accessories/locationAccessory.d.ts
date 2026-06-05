import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
export declare class LocationAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private service;
    private isHome;
    private readonly homeLat;
    private readonly homeLon;
    private readonly radiusMetres;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
    private poll;
}
//# sourceMappingURL=locationAccessory.d.ts.map