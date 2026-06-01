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

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — Diagnostics');

    // Summary sensor drives the tile
    const summary = accessory.getService('All Systems OK')
      || accessory.addService(Service.ContactSensor, 'All Systems OK', 'summary');
    summary.setCharacteristic(Characteristic.ConfiguredName, 'All Systems OK');
    this.services.set('summary', summary);

    for (const s of SENSORS) {
      const svc = accessory.getService(s.label)
        || accessory.addService(Service.ContactSensor, s.label, s.key);
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

      this.platform.log.info(
        `Diagnostics: ${anyWarning ? '⚠️  WARNING ACTIVE' : 'All OK'} | ` +
        `Service in ${diag.timeToService ?? '?'} month(s) / ${diag.distanceToService ?? '?'} km`,
      );
    } catch (err) {
      this.platform.log.warn('Diagnostics poll failed:', (err as Error).message);
    }
  }
}
