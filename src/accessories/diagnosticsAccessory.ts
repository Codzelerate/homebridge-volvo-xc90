import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

// A warning value counts as "active" if it is anything other than NO_WARNING or UNKNOWN
function isWarning(value: string): boolean {
  return value !== 'NO_WARNING' && value !== 'UNKNOWN';
}

// Fluid sensors use LeakSensor — semantically accurate (low fluid = fluid loss)
// and the water-drop icon makes them instantly distinguishable from non-fluid warnings.
// Non-fluid warnings (service due, tyres) keep ContactSensor.
const SENSORS = [
  { key: 'oilLevel',       label: 'Oil Level',          type: 'leak'    },
  { key: 'coolantLevel',   label: 'Coolant Level',       type: 'leak'    },
  { key: 'brakeFluid',     label: 'Brake Fluid',         type: 'leak'    },
  { key: 'washerFluid',    label: 'Washer Fluid',        type: 'leak'    },
  { key: 'serviceWarning', label: 'Service Due',         type: 'contact' },
  { key: 'tyreFrontLeft',  label: 'Tyre - Front Left',   type: 'contact' },
  { key: 'tyreFrontRight', label: 'Tyre - Front Right',  type: 'contact' },
  { key: 'tyreRearLeft',   label: 'Tyre - Rear Left',    type: 'contact' },
  { key: 'tyreRearRight',  label: 'Tyre - Rear Right',   type: 'contact' },
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

    // Summary sensor drives the tile
    const summary = accessory.services.find(s => s.subtype === 'summary' && s.UUID === Service.ContactSensor.UUID)
      || accessory.addService(Service.ContactSensor, 'All Systems OK', 'summary');
    summary.setCharacteristic(Characteristic.Name, 'All Systems OK');
    summary.setCharacteristic(Characteristic.ConfiguredName, 'All Systems OK');
    this.services.set('summary', summary);

    for (const s of SENSORS) {
      const targetUUID  = s.type === 'leak' ? Service.LeakSensor.UUID    : Service.ContactSensor.UUID;
      const legacyUUID  = s.type === 'leak' ? Service.ContactSensor.UUID : Service.LeakSensor.UUID;

      // Migration: remove service of old type (e.g. ContactSensor → LeakSensor)
      const legacy = accessory.services.find(svc => svc.subtype === s.key && svc.UUID === legacyUUID);
      if (legacy) {
        platform.log.info(`Migrating ${s.label} to ${s.type === 'leak' ? 'LeakSensor' : 'ContactSensor'}`);
        accessory.removeService(legacy);
      }

      const svc = accessory.services.find(svc => svc.subtype === s.key && svc.UUID === targetUUID)
        || (s.type === 'leak'
          ? accessory.addService(Service.LeakSensor,     s.label, s.key)
          : accessory.addService(Service.ContactSensor,  s.label, s.key));

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

      // Update summary (ContactSensor)
      const summary = this.services.get('summary');
      if (summary) {
        summary.updateCharacteristic(
          Characteristic.ContactSensorState,
          anyWarning
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }

      // Update individual sensors
      for (const s of SENSORS) {
        const svc = this.services.get(s.key);
        if (!svc) continue;
        const warn = warningMap[s.key];
        this.platform.dbg(`Diagnostics [${s.label}]: ${warn ? 'WARNING' : 'OK'}`);

        if (s.type === 'leak') {
          svc.updateCharacteristic(
            Characteristic.LeakDetected,
            warn
              ? Characteristic.LeakDetected.LEAK_DETECTED
              : Characteristic.LeakDetected.LEAK_NOT_DETECTED,
          );
        } else {
          svc.updateCharacteristic(
            Characteristic.ContactSensorState,
            warn
              ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
              : Characteristic.ContactSensorState.CONTACT_DETECTED,
          );
        }
      }

      // Log on state change only
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
