import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

// A warning value counts as "active" if it is anything other than NO_WARNING or UNKNOWN
function isWarning(value: string): boolean {
  return value !== 'NO_WARNING' && value !== 'UNKNOWN';
}

const SENSORS = [
  { key: 'oilLevel',       label: 'Oil Level' },
  { key: 'coolantLevel',   label: 'Coolant Level' },
  { key: 'brakeFluid',     label: 'Brake Fluid' },
  { key: 'washerFluid',    label: 'Washer Fluid' },
  { key: 'serviceWarning', label: 'Service Due' },
  { key: 'tyreFrontLeft',  label: 'Tyre - Front Left' },
  { key: 'tyreFrontRight', label: 'Tyre - Front Right' },
  { key: 'tyreRearLeft',   label: 'Tyre - Rear Left' },
  { key: 'tyreRearRight',  label: 'Tyre - Rear Right' },
] as const;

type SensorKey = typeof SENSORS[number]['key'];
type ServiceMap = Map<SensorKey | 'summary', ReturnType<PlatformAccessory['addService']>>;

export class DiagnosticsAccessory {
  private services: ServiceMap = new Map();
  private lastWarningState: boolean | null = null;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — Diagnostics');

    // Summary sensor drives the tile — find by subtype so renames don't cause conflicts
    const summary = accessory.services.find(s => s.subtype === 'summary' && s.UUID === Service.ContactSensor.UUID)
      || accessory.addService(Service.ContactSensor, 'All Systems OK', 'summary');
    summary.setCharacteristic(Characteristic.ConfiguredName, 'All Systems OK');
    this.services.set('summary', summary);

    for (const s of SENSORS) {
      // Find by subtype — display name may have changed across versions
      const svc = accessory.services.find(existing => existing.subtype === s.key && existing.UUID === Service.ContactSensor.UUID)
        || accessory.addService(Service.ContactSensor, s.label, s.key);
      // Update both Name and ConfiguredName — Name is what HAP validates on cache load,
      // so stale values (e.g. em-dash from older versions) must be corrected here
      svc.setCharacteristic(Characteristic.Name, s.label);
      svc.setCharacteristic(Characteristic.ConfiguredName, s.label);
      this.services.set(s.key, svc);
    }

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    try {
      const diag = await this.platform.api.getDiagnostics();
      const { Characteristic } = this.platform;

      const warningMap: Record<SensorKey, boolean> = {
        oilLevel:       isWarning(diag.oilLevel),
        coolantLevel:   isWarning(diag.coolantLevel),
        brakeFluid:     isWarning(diag.brakeFluid),
        washerFluid:    isWarning(diag.washerFluid),
        serviceWarning: isWarning(diag.serviceWarning),
        tyreFrontLeft:  isWarning(diag.tyreFrontLeft),
        tyreFrontRight: isWarning(diag.tyreFrontRight),
        tyreRearLeft:   isWarning(diag.tyreRearLeft),
        tyreRearRight:  isWarning(diag.tyreRearRight),
      };

      const anyWarning = Object.values(warningMap).some(Boolean);

      // Update summary
      const summary = this.services.get('summary');
      if (summary) {
        summary.updateCharacteristic(
          Characteristic.ContactSensorState,
          anyWarning
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED  // "Open" = warning
            : Characteristic.ContactSensorState.CONTACT_DETECTED,      // "Closed" = all OK
        );
      }

      // Update individual sensors
      for (const s of SENSORS) {
        const svc = this.services.get(s.key);
        if (!svc) continue;
        const warn = warningMap[s.key];
        this.platform.dbg(`Diagnostics [${s.label}]: ${warn ? 'WARNING' : 'OK'}`);
        svc.updateCharacteristic(
          Characteristic.ContactSensorState,
          warn
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }

      // Log state changes at info level; routine polls at debug level only
      const serviceInfo = `Service in ${diag.timeToService ?? '?'} month(s) / ${diag.distanceToService ?? '?'} km`;
      if (anyWarning !== this.lastWarningState) {
        this.platform.log.info(`Diagnostics: ${anyWarning ? 'WARNING ACTIVE' : 'All OK'} | ${serviceInfo}`);
        this.lastWarningState = anyWarning;
      } else {
        this.platform.dbg(`Diagnostics: ${anyWarning ? 'WARNING ACTIVE' : 'All OK'} | ${serviceInfo}`);
      }
    } catch (err) {
      this.platform.log.warn('Diagnostics poll failed:', (err as Error).message);
    }
  }
}
