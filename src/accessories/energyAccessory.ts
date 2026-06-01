import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class EnergyAccessory {
  private fuelService: ReturnType<PlatformAccessory['addService']> | null = null;
  private evService: ReturnType<PlatformAccessory['addService']> | null = null;
  private evChargeService: ReturnType<PlatformAccessory['addService']> | null = null;
  private chargerConnectedService: ReturnType<PlatformAccessory['addService']> | null = null;

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

    // Remove legacy LightSensor range services (now separate accessories)
    for (const subtype of ['tank-range', 'ev-range']) {
      const legacy = accessory.services.find(
        s => s.UUID === Service.LightSensor.UUID && s.subtype === subtype,
      );
      if (legacy) {
        platform.log.info(`Migrating range sensor '${subtype}' to standalone accessory`);
        accessory.removeService(legacy);
      }
    }

    // Remove legacy Charge Limit / Charge Target HumiditySensor (replaced by EV Charge)
    const legacyChargeTarget = accessory.services.find(
      s => s.UUID === Service.HumiditySensor.UUID && s.subtype === 'charge-target',
    );
    if (legacyChargeTarget) accessory.removeService(legacyChargeTarget);

    if (platform.config.showFuel !== false) {
      this.fuelService = accessory.services.find(s => s.subtype === 'fuel' && s.UUID === Service.HumiditySensor.UUID)
        || accessory.addService(Service.HumiditySensor, 'Fuel Level', 'fuel');
      this.fuelService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.fuelService.setCharacteristic(Characteristic.ConfiguredName, 'Fuel Level');
      this.fuelService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => this.fuelLevel);
    }

    if (platform.config.showCharging !== false) {
      // Battery service — shows charging state, low battery alert
      this.evService = accessory.services.find(s => s.subtype === 'ev' && s.UUID === Service.Battery.UUID)
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

      // EV Charge — HumiditySensor showing charge % at a glance, like Fuel Level
      this.evChargeService = accessory.services.find(s => s.subtype === 'ev-charge' && s.UUID === Service.HumiditySensor.UUID)
        || accessory.addService(Service.HumiditySensor, 'EV Charge', 'ev-charge');
      this.evChargeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.evChargeService.setCharacteristic(Characteristic.ConfiguredName, 'EV Charge');
      this.evChargeService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => this.chargeLevel);

      // Charger Connected — ContactSensor: closed = plugged in, open = unplugged
      this.chargerConnectedService = accessory.services.find(s => s.subtype === 'charger-connected' && s.UUID === Service.ContactSensor.UUID)
        || accessory.addService(Service.ContactSensor, 'Charger Connected', 'charger-connected');
      this.chargerConnectedService.setCharacteristic(Characteristic.ConfiguredName, 'Charger Connected');
      this.chargerConnectedService.getCharacteristic(Characteristic.ContactSensorState)
        .onGet(() => Characteristic.ContactSensorState.CONTACT_DETECTED);
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
          if (this.evChargeService) {
            this.evChargeService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.chargeLevel);
          }
        }

        const sys  = data.systemStatus     ?? '';
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

        if (this.chargerConnectedService) {
          const pluggedIn = conn !== 'DISCONNECTED' && conn !== 'UNSPECIFIED' && conn !== '';
          this.chargerConnectedService.updateCharacteristic(
            Characteristic.ContactSensorState,
            pluggedIn
              ? Characteristic.ContactSensorState.CONTACT_DETECTED
              : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
          );
          this.platform.dbg(`Charger: ${pluggedIn ? 'plugged in' : 'unplugged'} (${conn})`);
        }

        this.platform.dbg(
          `EV poll: ${this.chargeLevel}% | ${conn} | ${sys}` +
          ` | ${data.chargingType ?? 'n/a'} | power: ${data.powerStatus ?? 'n/a'}` +
          (data.estimatedChargingTime ? ` | ~${data.estimatedChargingTime}min to full` : '') +
          (data.electricRange ? ` | ${data.electricRange}km range` : ''),
        );
      } catch (err) {
        this.platform.log.warn('EV battery poll failed:', (err as Error).message);
      }
    }
  }
}
