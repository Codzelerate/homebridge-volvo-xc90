import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';

export class FuelAccessory {
  private service;
  private fuelLevel = 100;

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

    this.service = accessory.getService(Service.Battery)
      || accessory.addService(Service.Battery, 'Volvo Fuel');

    this.service.getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => {
        platform.dbg(`Fuel level queried: ${this.fuelLevel}%`);
        return this.fuelLevel;
      });

    this.service.getCharacteristic(Characteristic.ChargingState)
      .onGet(() => Characteristic.ChargingState.NOT_CHARGING);

    this.service.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => {
        const low = this.fuelLevel < 15;
        platform.dbg(`Fuel low status: ${low}`);
        return low
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      });

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    try {
      const data = await this.platform.api.getFuel();
      const { Characteristic } = this.platform;
      if (data.fuelAmountLevel !== undefined) {
        this.fuelLevel = Math.round(data.fuelAmountLevel);
        this.service.updateCharacteristic(Characteristic.BatteryLevel, this.fuelLevel);
        this.service.updateCharacteristic(
          Characteristic.StatusLowBattery,
          this.fuelLevel < 15
            ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
        );
        this.platform.dbg(`Fuel poll: ${this.fuelLevel}% (${data.fuelAmount}L)`);
      }
    } catch (err) {
      this.platform.log.warn('Fuel poll failed:', (err as Error).message);
    }
  }
}
