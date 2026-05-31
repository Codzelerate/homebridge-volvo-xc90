import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class ChargingAccessory {
  private service;
  private chargeLevel = 100;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — EV Battery');

    this.service = accessory.getService(Service.Battery)
      || accessory.addService(Service.Battery, 'EV Battery');

    this.service.getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => {
        platform.dbg(`EV battery level queried: ${this.chargeLevel}%`);
        return this.chargeLevel;
      });

    this.service.getCharacteristic(Characteristic.ChargingState)
      .onGet(() => Characteristic.ChargingState.NOT_CHARGING);

    this.service.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => {
        const low = this.chargeLevel < 20;
        platform.dbg(`EV battery low: ${low}`);
        return low
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      });

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    try {
      const data = await this.platform.api.getRechargeStatus();
      const { Characteristic } = this.platform;

      if (data.chargeLevel !== undefined) {
        this.chargeLevel = Math.round(data.chargeLevel);
        this.service.updateCharacteristic(Characteristic.BatteryLevel, this.chargeLevel);
        this.service.updateCharacteristic(
          Characteristic.StatusLowBattery,
          this.chargeLevel < 20
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
      this.service.updateCharacteristic(Characteristic.ChargingState, chargingState);

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
