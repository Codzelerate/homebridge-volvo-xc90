import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';

export class ClimateAccessory {
  private service;
  private isActive = false;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Volvo')
      .setCharacteristic(Characteristic.Model, 'XC90 2016')
      .setCharacteristic(Characteristic.SerialNumber, platform.config.vin ?? 'unknown');

    this.service = accessory.getService(Service.Switch)
      || accessory.addService(Service.Switch, 'Volvo Climate');

    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => this.isActive)
      .onSet(async (value: CharacteristicValue) => {
        try {
          if (value as boolean) {
            await platform.api.startClimatisation();
            platform.log.info('Climatisation started');
          } else {
            await platform.api.stopClimatisation();
            platform.log.info('Climatisation stopped');
          }
          this.isActive = value as boolean;
        } catch (err) {
          platform.log.error('Climate command failed:', (err as Error).message);
        }
      });
  }
}
