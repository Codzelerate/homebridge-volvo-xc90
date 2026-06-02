import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

function isWarning(value: string): boolean {
  return value !== 'NO_WARNING' && value !== 'UNKNOWN';
}

export class ServiceDueAccessory {
  private service: ReturnType<PlatformAccessory['addService']>;
  private filterLifeLevel = 100;
  private filterChangeNeeded = false;
  private readonly serviceIntervalMonths: number;
  private readonly serviceIntervalKm: number;
  private readonly serviceAlertThreshold: number;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    this.serviceIntervalMonths = platform.config.serviceIntervalMonths ?? 12;
    this.serviceIntervalKm     = platform.config.serviceIntervalKm     ?? 30000;
    this.serviceAlertThreshold = platform.config.serviceAlertThreshold ?? 20;

    setAccessoryInfo(platform, accessory, 'XC90 — Service Due');

    this.service = accessory.getService(Service.FilterMaintenance)
      || accessory.addService(Service.FilterMaintenance, 'Service Due', 'service-due');
    this.service.displayName = 'Service Due';
    this.service.setCharacteristic(Characteristic.Name, 'Service Due');
    this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.service.setCharacteristic(Characteristic.ConfiguredName, 'Service Due');
    this.service.addOptionalCharacteristic(Characteristic.FilterLifeLevel);

    this.service.getCharacteristic(Characteristic.FilterChangeIndication)
      .onGet(() => this.filterChangeNeeded
        ? Characteristic.FilterChangeIndication.CHANGE_FILTER
        : Characteristic.FilterChangeIndication.FILTER_OK);
    this.service.getCharacteristic(Characteristic.FilterLifeLevel)
      .onGet(() => this.filterLifeLevel);

    platform.registerPoll(() => this.poll());
    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private calcFilterLifeLevel(timeToService: number | undefined, distanceToService: number | undefined): number {
    const percentages: number[] = [];
    if (timeToService !== undefined && this.serviceIntervalMonths > 0) {
      percentages.push(Math.min(100, Math.round((timeToService / this.serviceIntervalMonths) * 100)));
    }
    if (distanceToService !== undefined && this.serviceIntervalKm > 0) {
      percentages.push(Math.min(100, Math.round((distanceToService / this.serviceIntervalKm) * 100)));
    }
    return percentages.length > 0 ? Math.min(...percentages) : 100;
  }

  private async poll(): Promise<void> {
    const { Characteristic } = this.platform;
    try {
      const diag = await this.platform.api.getDiagnostics();

      this.filterLifeLevel    = this.calcFilterLifeLevel(diag.timeToService, diag.distanceToService);
      this.filterChangeNeeded = isWarning(diag.serviceWarning) || this.filterLifeLevel < this.serviceAlertThreshold;

      this.service.updateCharacteristic(Characteristic.FilterLifeLevel, this.filterLifeLevel);
      this.service.updateCharacteristic(
        Characteristic.FilterChangeIndication,
        this.filterChangeNeeded
          ? Characteristic.FilterChangeIndication.CHANGE_FILTER
          : Characteristic.FilterChangeIndication.FILTER_OK,
      );

      this.platform.dbg(
        `Service Due: ${this.filterLifeLevel}% remaining` +
        ` (${diag.timeToService ?? '?'} month(s) / ${diag.distanceToService ?? '?'} km)` +
        ` | ${this.filterChangeNeeded ? 'CHANGE FILTER' : 'OK'}`,
      );
    } catch (err) {
      this.platform.log.warn('Service Due poll failed:', (err as Error).message);
    }
  }
}
