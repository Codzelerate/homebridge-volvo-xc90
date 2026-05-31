import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class ClimateAccessory {
  private service;
  private isActive = false;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — Climate');

    this.service = accessory.getService(Service.Switch)
      || accessory.addService(Service.Switch, 'Volvo Climate');

    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => {
        platform.dbg(`Climate onGet: ${this.isActive}`);
        return this.isActive;
      })
      .onSet(async (value: CharacteristicValue) => {
        const on = value as boolean;
        platform.dbg(`Climate onSet: ${on ? 'start' : 'stop'}`);
        try {
          if (on) {
            await platform.api.startClimatisation();
            platform.log.info('Climatisation started');
          } else {
            await platform.api.stopClimatisation();
            platform.log.info('Climatisation stopped');
          }
          this.isActive = on;
        } catch (err) {
          platform.log.error('Climate command failed:', (err as Error).message);
        }
      });
  }
}
