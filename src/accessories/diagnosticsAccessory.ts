import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

// A warning value counts as "active" if it is anything other than NO_WARNING or UNKNOWN
function isWarning(value: string): boolean {
  return value !== 'NO_WARNING' && value !== 'UNKNOWN';
}

// Fluid sensors → LeakSensor (water-drop icon, semantically accurate)
// Tyre sensors  → ContactSensor (binary pressure warning)
// Service Due   → FilterMaintenance (filter icon, shows % life remaining + Change Filter alert)
const SENSORS = [
  { key: 'oilLevel',       label: 'Oil Level',          type: 'leak'    },
  { key: 'coolantLevel',   label: 'Coolant Level',       type: 'leak'    },
  { key: 'brakeFluid',     label: 'Brake Fluid',         type: 'leak'    },
  { key: 'washerFluid',    label: 'Washer Fluid',        type: 'leak'    },
  { key: 'tyreFrontLeft',  label: 'Tyre - Front Left',   type: 'contact' },
  { key: 'tyreFrontRight', label: 'Tyre - Front Right',  type: 'contact' },
  { key: 'tyreRearLeft',   label: 'Tyre - Rear Left',    type: 'contact' },
  { key: 'tyreRearRight',  label: 'Tyre - Rear Right',   type: 'contact' },
] as const;

type SensorKey = typeof SENSORS[number]['key'];
type ServiceMap = Map<SensorKey | 'summary' | 'serviceWarning', ReturnType<PlatformAccessory['addService']>>;

export class DiagnosticsAccessory {
  private services: ServiceMap = new Map();
  private lastWarningState: boolean | null = null;
  private readonly serviceIntervalMonths: number;
  private readonly serviceIntervalKm: number;
  private readonly serviceAlertThreshold: number;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    this.serviceIntervalMonths  = platform.config.serviceIntervalMonths  ?? 12;
    this.serviceIntervalKm      = platform.config.serviceIntervalKm      ?? 30000;
    this.serviceAlertThreshold  = platform.config.serviceAlertThreshold  ?? 20;

    setAccessoryInfo(platform, accessory, 'XC90 — Diagnostics');

    // Summary sensor drives the tile
    const summary = accessory.services.find(s => s.subtype === 'summary' && s.UUID === Service.ContactSensor.UUID)
      || accessory.addService(Service.ContactSensor, 'All Systems OK', 'summary');
    summary.displayName = 'All Systems OK';
    summary.setCharacteristic(Characteristic.Name, 'All Systems OK');
    summary.setCharacteristic(Characteristic.ConfiguredName, 'All Systems OK');
    this.services.set('summary', summary);

    // Service Due — FilterMaintenance
    // Migrate from old ContactSensor if present
    const legacyServiceContact = accessory.services.find(
      s => s.subtype === 'serviceWarning' && s.UUID === Service.ContactSensor.UUID,
    );
    if (legacyServiceContact) {
      platform.log.info('Migrating Service Due to FilterMaintenance');
      accessory.removeService(legacyServiceContact);
    }

    const serviceSvc = accessory.services.find(
      s => s.subtype === 'serviceWarning' && s.UUID === Service.FilterMaintenance.UUID,
    ) || accessory.addService(Service.FilterMaintenance, 'Service Due', 'serviceWarning');
    serviceSvc.displayName = 'Service Due';
    serviceSvc.setCharacteristic(Characteristic.Name, 'Service Due');
    serviceSvc.setCharacteristic(Characteristic.ConfiguredName, 'Service Due');
    serviceSvc.addOptionalCharacteristic(Characteristic.FilterLifeLevel);
    serviceSvc.getCharacteristic(Characteristic.FilterChangeIndication)
      .onGet(() => Characteristic.FilterChangeIndication.FILTER_OK);
    serviceSvc.getCharacteristic(Characteristic.FilterLifeLevel)
      .onGet(() => 100);
    this.services.set('serviceWarning', serviceSvc);

    // Fluid (LeakSensor) and Tyre (ContactSensor) sensors
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
      // Update displayName so the cache stores the corrected value — HAP initialises
      // the Name characteristic from displayName on every load, so updating only the
      // characteristic is not enough. Setting displayName directly fixes the warning permanently.
      svc.displayName = s.label;
      svc.setCharacteristic(Characteristic.Name, s.label);
      svc.setCharacteristic(Characteristic.ConfiguredName, s.label);
      this.services.set(s.key, svc);
    }

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

    // Use whichever is lower — that's the binding constraint (nearest trigger)
    return percentages.length > 0 ? Math.min(...percentages) : 100;
  }

  private async poll(): Promise<void> {
    try {
      const diag = await this.platform.api.getDiagnostics();
      const { Characteristic } = this.platform;

      // --- Service Due (FilterMaintenance) ---
      const filterLifeLevel = this.calcFilterLifeLevel(diag.timeToService, diag.distanceToService);
      const apiWarning      = isWarning(diag.serviceWarning);
      const alertThreshold  = apiWarning || filterLifeLevel < this.serviceAlertThreshold;

      const serviceSvc = this.services.get('serviceWarning');
      if (serviceSvc) {
        serviceSvc.updateCharacteristic(Characteristic.FilterLifeLevel, filterLifeLevel);
        serviceSvc.updateCharacteristic(
          Characteristic.FilterChangeIndication,
          alertThreshold
            ? Characteristic.FilterChangeIndication.CHANGE_FILTER
            : Characteristic.FilterChangeIndication.FILTER_OK,
        );
        this.platform.dbg(
          `Service: ${filterLifeLevel}% life remaining` +
          ` (${diag.timeToService ?? '?'} month(s) / ${diag.distanceToService ?? '?'} km)` +
          ` | alert: ${alertThreshold}`,
        );
      }

      // --- Fluid and Tyre sensors ---
      const warningMap: Record<SensorKey, boolean> = {
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
        const svc  = this.services.get(s.key);
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

      // --- Summary tile ---
      const anyWarning = Object.values(warningMap).some(Boolean) || alertThreshold;
      const summary = this.services.get('summary');
      if (summary) {
        summary.updateCharacteristic(
          Characteristic.ContactSensorState,
          anyWarning
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }

      // Log on state change only
      const serviceInfo = `Service in ${diag.timeToService ?? '?'} month(s) / ${diag.distanceToService ?? '?'} km (${filterLifeLevel}% remaining)`;
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
