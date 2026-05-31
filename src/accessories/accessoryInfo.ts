import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';

export function setAccessoryInfo(
  platform: VolvoPlatform,
  accessory: PlatformAccessory,
  model: string,
): void {
  const { Service, Characteristic } = platform;

  accessory.getService(Service.AccessoryInformation)!
    .setCharacteristic(Characteristic.Manufacturer, 'Volvo Cars')
    .setCharacteristic(Characteristic.Model, model)
    .setCharacteristic(Characteristic.SerialNumber, platform.config.vin ?? 'unknown')
    .setCharacteristic(Characteristic.FirmwareRevision, platform.pluginVersion)
    .setCharacteristic(Characteristic.HardwareRevision, '2016');
}
