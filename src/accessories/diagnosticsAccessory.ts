import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

// A warning value counts as "active" if it is anything other than NO_WARNING or UNKNOWN
function isWarning(value: string): boolean {
  return value !== 'NO_WARNING' && value !== 'UNKNOWN';
}

// Fluid sensors → LeakSensor (water-drop icon, semantically accurate)
// Tyre sensors  → ContactSensor (binary pressure warning)
// Service Due   → ContactSensor — maintenance reminder, separate from fault summary
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

// Only actual faults contribute to the summary tile
const FAULT_SENSORS = ['oilLevel', 'coolantLevel', 'brakeFluid', 'washerFluid',
  'tyreFrontLeft', 'tyreFrontRight', 'tyreRearLeft', 'tyreRearRight'] as const;

type SensorKey = typeof SENSORS[number]['key'];
type ServiceMap = Map<SensorKey | 'summary', ReturnType<PlatformAccessory['addService']>>;

export class DiagnosticsAccessory {
  private services: ServiceMap = new Map();
  private lastWarningState: boolean | null = null;
  private serviceDueOpen = false;
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

    setAccessoryInfo(platform, accessory, 'XC90 — Diagnostics');

    // Summary — faults only, NOT service due
    const summary = accessory.services.find(s => s.subtype === 'summary' && s.UUID === Service.ContactSensor.UUID)
      || accessory.addService(Service.ContactSensor, 'All Systems OK', 'summary');
    summary.displayName = 'All Systems OK';
    summary.setCharacteristic(Characteristic.Name, 'All Systems OK');
    summary.setCharacteristic(Characteristic.ConfiguredName, 'All Systems OK');
    this.services.set('summary', summary);

    // Remove any legacy FilterMaintenance sub-service from the standalone attempt
    const legacyFilter = accessory.services.find(
      s => s.subtype === 'serviceWarning' && s.UUID === Service.FilterMaintenance.UUID,
    );
    if (legacyFilter) {
      platform.log.info('Removing legacy FilterMaintenance service — reverting to ContactSensor');
      accessory.removeService(legacyFilter);
    }

    for (const s of SENSORS) {
      const targetUUID = s.type === 'leak' ? Service.LeakSensor.UUID : Service.ContactSensor.UUID;
      const legacyUUID = s.type === 'leak' ? Service.ContactSensor.UUID : Service.LeakSensor.UUID;

      const legacy = accessory.services.find(svc => svc.subtype === s.key && svc.UUID === legacyUUID);
      if (legacy) {
        platform.log.info(`Migrating ${s.label} to ${s.type === 'leak' ? 'LeakSensor' : 'ContactSensor'}`);
        accessory.removeService(legacy);
      }

      const svc = accessory.services.find(svc => svc.subtype === s.key && svc.UUID === targetUUID)
        || (s.type === 'leak'
          ? accessory.addService(Service.LeakSensor,    s.label, s.key)
          : accessory.addService(Service.ContactSensor, s.label, s.key));
      svc.displayName = s.label;
      svc.setCharacteristic(Characteristic.Name, s.label);
      svc.setCharacteristic(Characteristic.ConfiguredName, s.label);

      if (s.key === 'serviceWarning') {
        svc.getCharacteristic(Characteristic.ContactSensorState)
          .onGet(() => this.serviceDueOpen
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED);
      }

      this.services.set(s.key, svc);
    }

    platform.registerPoll(() => this.poll());
    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private calcServiceLifeLevel(timeToService: number | undefined, distanceToService: number | undefined): number {
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
    try {
      const diag = await this.platform.api.getDiagnostics();
      const { Characteristic } = this.platform;

      // --- Fault sensors (drive the summary) ---
      const warningMap: Partial<Record<SensorKey, boolean>> = {
        oilLevel:       isWarning(diag.oilLevel),
        coolantLevel:   isWarning(diag.coolantLevel),
        brakeFluid:     isWarning(diag.brakeFluid),
        washerFluid:    isWarning(diag.washerFluid),
        tyreFrontLeft:  isWarning(diag.tyreFrontLeft),
        tyreFrontRight: isWarning(diag.tyreFrontRight),
        tyreRearLeft:   isWarning(diag.tyreRearLeft),
        tyreRearRight:  isWarning(diag.tyreRearRight),
      };

      for (const s of SENSORS) {
        if (s.key === 'serviceWarning') continue; // handled separately below
        const svc = this.services.get(s.key);
        if (!svc) continue;
        const warn = warningMap[s.key] ?? false;
        this.platform.dbg(`Diagnostics [${s.label}]: ${warn ? 'WARNING' : 'OK'}`);
        if (s.type === 'leak') {
          svc.updateCharacteristic(Characteristic.LeakDetected,
            warn ? Characteristic.LeakDetected.LEAK_DETECTED : Characteristic.LeakDetected.LEAK_NOT_DETECTED);
        } else {
          svc.updateCharacteristic(Characteristic.ContactSensorState,
            warn ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
        }
      }

      // --- Summary: faults only, NOT service due ---
      const anyFault = FAULT_SENSORS.some(k => warningMap[k]);
      const summary = this.services.get('summary');
      if (summary) {
        summary.updateCharacteristic(Characteristic.ContactSensorState,
          anyFault
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED);
      }

      // --- Service Due: independent ContactSensor, does not affect summary ---
      const serviceLifeLevel = this.calcServiceLifeLevel(diag.timeToService, diag.distanceToService);
      this.serviceDueOpen = isWarning(diag.serviceWarning) || serviceLifeLevel < this.serviceAlertThreshold;
      const serviceSvc = this.services.get('serviceWarning');
      if (serviceSvc) {
        serviceSvc.updateCharacteristic(Characteristic.ContactSensorState,
          this.serviceDueOpen
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED);
      }
      this.platform.dbg(
        `Service Due: ${serviceLifeLevel}% remaining` +
        ` (${diag.timeToService ?? '?'} month(s) / ${diag.distanceToService ?? '?'} km)` +
        ` | ${this.serviceDueOpen ? 'OPEN' : 'OK'}`,
      );

      // Log on state change only (faults only — service due has its own sensor)
      const serviceInfo = `Service in ${diag.timeToService ?? '?'} month(s) / ${diag.distanceToService ?? '?'} km (${serviceLifeLevel}% remaining)`;
      if (anyFault !== this.lastWarningState) {
        this.platform.log.info(`Diagnostics: ${anyFault ? 'FAULT ACTIVE' : 'All OK'} | ${serviceInfo}`);
        this.lastWarningState = anyFault;
      } else {
        this.platform.dbg(`Diagnostics: ${anyFault ? 'FAULT ACTIVE' : 'All OK'} | ${serviceInfo}`);
      }
    } catch (err) {
      this.platform.log.warn('Diagnostics poll failed:', (err as Error).message);
    }
  }
}
