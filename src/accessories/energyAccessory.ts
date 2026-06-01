import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class EnergyAccessory {
  // Fuel level — HumiditySensor (0–100%) so HomeKit shows it alongside the Battery service
  private fuelService: ReturnType<PlatformAccessory['addService']> | null = null;
  // EV battery — Battery service (charge level + charging state)
  private evService: ReturnType<PlatformAccessory['addService']> | null = null;
  // Charge target — HumiditySensor (0–100 %)
  private chargeTargetService: ReturnType<PlatformAccessory['addService']> | null = null;
  // Charger connected — ContactSensor (closed = plugged in, open = unplugged)
  private chargerConnectedService: ReturnType<PlatformAccessory['addService']> | null = null;
  // Range — LightSensor (lux field used to display km, labelled clearly)
  private tankRangeService: ReturnType<PlatformAccessory['addService']> | null = null;
  private evRangeService: ReturnType<PlatformAccessory['addService']> | null = null;

  private fuelLevel = 100;
  private chargeLevel = 100;
  private tankRange = 1;   // km, default 1 (LightSensor minimum)
  private evRange = 1;     // km
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

      // Tank range shown as a LightSensor — lux field repurposed for km value
      // ConfiguredName label makes it clear this is km not lux
      this.tankRangeService = accessory.getService('Tank Range')
        || accessory.addService(Service.LightSensor, 'Tank Range', 'tank-range');
      this.tankRangeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.tankRangeService.setCharacteristic(Characteristic.ConfiguredName, 'Tank Range (km)');
      this.tankRangeService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => this.tankRange);
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

      // EV range
      this.evRangeService = accessory.getService('EV Range')
        || accessory.addService(Service.LightSensor, 'EV Range', 'ev-range');
      this.evRangeService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.evRangeService.setCharacteristic(Characteristic.ConfiguredName, 'EV Range (km)');
      this.evRangeService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => this.evRange);

      // Charge target — shows what % the car is set to charge to
      this.chargeTargetService = accessory.getService('Charge Target')
        || accessory.addService(Service.HumiditySensor, 'Charge Target', 'charge-target');
      this.chargeTargetService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.chargeTargetService.setCharacteristic(Characteristic.ConfiguredName, 'Charge Target (%)');
      this.chargeTargetService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => 100);

      // Charger connected — ContactSensor: closed = plugged in, open = unplugged
      this.chargerConnectedService = accessory.getService('Charger Connected')
        || accessory.addService(Service.ContactSensor, 'Charger Connected', 'charger-connected');
      this.chargerConnectedService.setCharacteristic(Characteristic.ConfiguredName, 'Charger Connected');
      this.chargerConnectedService.getCharacteristic(Characteristic.ContactSensorState)
        .onGet(() => Characteristic.ContactSensorState.CONTACT_DETECTED); // default: plugged in
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

        // Charge target
        if (this.chargeTargetService && data.targetChargeLevel !== undefined) {
          this.chargeTargetService.updateCharacteristic(
            Characteristic.CurrentRelativeHumidity,
            Math.min(100, Math.round(data.targetChargeLevel)),
          );
        }

        // Charger connected
        if (this.chargerConnectedService) {
          const pluggedIn = conn !== 'DISCONNECTED' && conn !== 'UNSPECIFIED' && conn !== '';
          this.chargerConnectedService.updateCharacteristic(
            Characteristic.ContactSensorState,
            pluggedIn
              ? Characteristic.ContactSensorState.CONTACT_DETECTED    // closed = plugged in
              : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED, // open = unplugged
          );
          this.platform.dbg(`Charger: ${pluggedIn ? 'plugged in' : 'unplugged'} (${conn})`);
        }

        this.platform.dbg(
          `EV poll: ${this.chargeLevel}% (target ${data.targetChargeLevel ?? '?'}%)` +
          ` | ${conn} | ${sys}` +
          ` | ${data.chargingType ?? 'n/a'} | power: ${data.powerStatus ?? 'n/a'}` +
          (data.estimatedChargingTime ? ` | ~${data.estimatedChargingTime}min to full` : '') +
          (data.electricRange ? ` | ${data.electricRange}km range` : ''),
        );
      } catch (err) {
        this.platform.log.warn('EV battery poll failed:', (err as Error).message);
      }
    }

    // Range — fetched from statistics endpoint
    if (this.tankRangeService || this.evRangeService) {
      try {
        const stats = await this.platform.api.getStatistics();
        if (this.tankRangeService && stats.distanceToEmptyTank !== undefined) {
          this.tankRange = Math.max(1, stats.distanceToEmptyTank);
          this.tankRangeService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, this.tankRange);
          this.platform.dbg(`Tank range: ${stats.distanceToEmptyTank} km`);
        }
        if (this.evRangeService && stats.distanceToEmptyBattery !== undefined) {
          this.evRange = Math.max(1, stats.distanceToEmptyBattery);
          this.evRangeService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, this.evRange);
          this.platform.dbg(`EV range: ${stats.distanceToEmptyBattery} km`);
        }
      } catch (err) {
        this.platform.log.warn('Range poll failed:', (err as Error).message);
      }
    }
  }
}
