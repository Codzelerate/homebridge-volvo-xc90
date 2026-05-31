import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';

export class EngineAccessory {
  private service;
  private isRunning = false;

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
      || accessory.addService(Service.Switch, 'Volvo Engine');

    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => this.isRunning)
      .onSet(async (value: CharacteristicValue) => {
        try {
          if (value as boolean) {
            await platform.api.startEngine(opts.engineDuration);
            platform.log.info(`Engine started for ${opts.engineDuration} min`);
          } else {
            await platform.api.stopEngine();
            platform.log.info('Engine stopped');
          }
          this.isRunning = value as boolean;
        } catch (err) {
          platform.log.error('Engine command failed:', (err as Error).message);
        }
      });
  }
}
