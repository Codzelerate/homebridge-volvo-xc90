import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class EnergyAccessory {
  // Fuel level shown as a HumiditySensor (0–100%) — different service type from Battery
  // so HomeKit renders both in the same accessory detail view
  private fuelService: ReturnType<PlatformAccessory['addService']> | null = null;
  private evService: ReturnType<PlatformAccessory['addService']> | null = null;
  private fuelLevel = 100;
  private chargeLevel = 100;
  private readonly tankCapacity: number;
  private readonly evLowThreshold: number;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;
    this.tankCapacity = platform.config.tankCapacityLiters ?? 70;
    this.evLowThreshold = platform.config.evLowChargeThreshold ?? 20;

    setAccessoryInfo(platform, accessory, 'XC90 — Energy');

    // Remove legacy unsubtyped Battery service left by the old FuelAccessory
    const legacyBattery = accessory.getService(Service.Battery);
    if (legacyBattery && !legacyBattery.subtype) accessory.removeService(legacyBattery);

    if (platform.config.showFuel !== false) {
      this.fuelService = accessory.getService(Service.HumiditySensor)
        || accessory.addService(Service.HumiditySensor, 'Fuel Level', 'fuel');
      this.fuelService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.fuelService.setCharacteristic(Characteristic.ConfiguredName, 'Fuel Level');
      this.fuelService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => this.fuelLevel);
    }

    if (platform.config.showCharging !== false) {
      this.evService = accessory.getService('EV Battery')
        || accessory.addService(Service.Battery, 'EV Battery', 'ev');
      this.evService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.evService.setCharacteristic(Characteristic.ConfiguredName, 'EV Battery');
      this.evService.getCharacteristic(Characteristic.BatteryLevel)
        .onGet(() => this.chargeLevel);
      this.evService.getCharacteristic(Characteristic.ChargingState)
        .onGet(() => Characteristic.ChargingState.NOT_CHARGING);
      this.evService.getCharacteristic(Characteristic.StatusLowBattery)
        .onGet(() => this.chargeLevel < this.evLowThreshold
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    }

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    const { Characteristic } = this.platform;

    if (this.fuelService) {
      try {
        const data = await this.platform.api.getFuel();
        const litres = data.fuelAmountLevel !== undefined
          ? (data.fuelAmountLevel / 100) * this.tankCapacity
          : data.fuelAmount;
        if (litres !== undefined) {
          this.fuelLevel = Math.min(100, Math.round((litres / this.tankCapacity) * 100));
          this.fuelService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.fuelLevel);
          this.platform.dbg(`Fuel poll: ${this.fuelLevel}% (${data.fuelAmount}L / ${this.tankCapacity}L tank)`);
        }
      } catch (err) {
        this.platform.log.warn('Fuel poll failed:', (err as Error).message);
      }
    }

    if (this.evService) {
      try {
        const data = await this.platform.api.getRechargeStatus();
        if (data.chargeLevel !== undefined) {
          this.chargeLevel = Math.round(data.chargeLevel);
          this.evService.updateCharacteristic(Characteristic.BatteryLevel, this.chargeLevel);
          this.evService.updateCharacteristic(
            Characteristic.StatusLowBattery,
            this.chargeLevel < this.evLowThreshold
              ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
              : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
          );
        }
        const sys = data.systemStatus ?? '';
        const conn = data.connectionStatus ?? '';
        let chargingState: number;
        if (sys === 'CHARGING') {
          chargingState = Characteristic.ChargingState.CHARGING;
        } else if (conn === 'DISCONNECTED' || conn === 'UNSPECIFIED') {
          chargingState = Characteristic.ChargingState.NOT_CHARGEABLE;
        } else {
          chargingState = Characteristic.ChargingState.NOT_CHARGING;
        }
        this.evService.updateCharacteristic(Characteristic.ChargingState, chargingState);
        this.platform.dbg(
          `EV battery poll: ${this.chargeLevel}% | ${conn} | ${sys}` +
          (data.estimatedChargingTime ? ` | ~${data.estimatedChargingTime}min to full` : '') +
          (data.electricRange ? ` | ${data.electricRange}km range` : ''),
        );
      } catch (err) {
        this.platform.log.warn('EV battery poll failed:', (err as Error).message);
      }
    }
  }
}
