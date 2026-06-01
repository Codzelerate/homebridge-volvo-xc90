import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

type RangeType = 'ev' | 'tank';

class RangeAccessory {
  private service: ReturnType<PlatformAccessory['addService']>;
  private rangeKm = 1; // LightSensor minimum is 0.0001

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
    private readonly type: RangeType,
  ) {
    const { Service, Characteristic } = platform;
    const label = type === 'ev' ? 'EV Range km' : 'Tank Range km';

    setAccessoryInfo(platform, accessory, type === 'ev' ? 'XC90 — EV Range' : 'XC90 — Tank Range');

    this.service = accessory.getService(Service.LightSensor)
      || accessory.addService(Service.LightSensor, label, type);
    this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.service.setCharacteristic(Characteristic.ConfiguredName, label);
    this.service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
      .onGet(() => Math.max(0.0001, this.rangeKm));

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    try {
      const stats = await this.platform.api.getStatistics();
      const km = this.type === 'ev'
        ? stats.distanceToEmptyBattery
        : stats.distanceToEmptyTank;

      if (km !== undefined) {
        this.rangeKm = km;
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentAmbientLightLevel,
          Math.max(0.0001, km),
        );
        this.platform.dbg(`${this.type === 'ev' ? 'EV' : 'Tank'} range: ${km} km`);
      }
    } catch (err) {
      this.platform.log.warn(`${this.type === 'ev' ? 'EV' : 'Tank'} range poll failed:`, (err as Error).message);
    }
  }
}

export class EVRangeAccessory extends RangeAccessory {
  constructor(
    platform: VolvoPlatform,
    accessory: PlatformAccessory,
    opts: { pollInterval: number; engineDuration: number },
  ) {
    super(platform, accessory, opts, 'ev');
  }
}

export class TankRangeAccessory extends RangeAccessory {
  constructor(
    platform: VolvoPlatform,
    accessory: PlatformAccessory,
    opts: { pollInterval: number; engineDuration: number },
  ) {
    super(platform, accessory, opts, 'tank');
  }
}
