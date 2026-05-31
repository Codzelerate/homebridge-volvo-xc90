import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class EngineAccessory {
  private service;
  private isRunning = false;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — Engine');

    this.service = accessory.getService(Service.Switch)
      || accessory.addService(Service.Switch, 'Volvo Engine');

    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => {
        platform.dbg(`Engine onGet: running=${this.isRunning}`);
        return this.isRunning;
      })
      .onSet(async (value: CharacteristicValue) => {
        const on = value as boolean;
        platform.dbg(`Engine onSet: ${on ? `start (${opts.engineDuration}min)` : 'stop'}`);
        try {
          if (on) {
            await platform.api.startEngine(opts.engineDuration);
            platform.log.info(`Engine started for ${opts.engineDuration} min`);
          } else {
            await platform.api.stopEngine();
            platform.log.info('Engine stopped');
          }
          this.isRunning = on;
        } catch (err) {
          platform.log.error('Engine command failed:', (err as Error).message);
        }
      });
  }
}
