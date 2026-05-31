import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class FuelAccessory {
  private service;
  private fuelLevel = 100;

  private readonly tankCapacity: number;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;
    this.tankCapacity = platform.config.tankCapacityLiters ?? 70;

    setAccessoryInfo(platform, accessory, 'XC90 — Fuel');

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
      const litres = data.fuelAmountLevel !== undefined
        ? (data.fuelAmountLevel / 100) * this.tankCapacity  // use API percentage if present
        : data.fuelAmount;                                    // fall back to litres

      if (litres !== undefined) {
        this.fuelLevel = Math.min(100, Math.round((litres / this.tankCapacity) * 100));
        this.service.updateCharacteristic(Characteristic.BatteryLevel, this.fuelLevel);
        this.service.updateCharacteristic(
          Characteristic.StatusLowBattery,
          this.fuelLevel < 15
            ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
        );
        this.platform.dbg(`Fuel poll: ${this.fuelLevel}% (${data.fuelAmount}L / ${this.tankCapacity}L tank)`);
      }
    } catch (err) {
      this.platform.log.warn('Fuel poll failed:', (err as Error).message);
    }
  }
}
