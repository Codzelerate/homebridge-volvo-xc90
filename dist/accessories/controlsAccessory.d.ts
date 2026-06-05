import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
export declare class ControlsAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly opts;
    private climateService;
    private engineService;
    private honkService;
    private flashService;
    private honkFlashService;
    private refreshService;
    private climateActive;
    private engineRunning;
    constructor(platform: VolvoPlatform, accessory: PlatformAccessory, opts: {
        pollInterval: number;
        engineDuration: number;
    });
}
//# sourceMappingURL=controlsAccessory.d.ts.map