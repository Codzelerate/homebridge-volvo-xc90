import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

const DOOR_SENSORS = [
  { key: 'frontLeft',  label: 'Front Left Door' },
  { key: 'frontRight', label: 'Front Right Door' },
  { key: 'rearLeft',   label: 'Rear Left Door' },
  { key: 'rearRight',  label: 'Rear Right Door' },
  { key: 'hood',       label: 'Hood' },
  { key: 'tailgate',   label: 'Tailgate' },
] as const;

type DoorKey = typeof DOOR_SENSORS[number]['key'];
type ServiceMap = Map<DoorKey | 'summary', ReturnType<PlatformAccessory['addService']>>;

export class DoorsAccessory {
  private services: ServiceMap = new Map();

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — Doors');

    // Summary sensor added first — HomeKit uses the first service as the tile state
    const summary = accessory.getService('All Doors')
      || accessory.addService(Service.ContactSensor, 'All Doors', 'summary');
    this.services.set('summary', summary);

    for (const door of DOOR_SENSORS) {
      const svc = accessory.getService(door.label)
        || accessory.addService(Service.ContactSensor, door.label, door.key);
      this.services.set(door.key, svc);
      platform.dbg(`Registered door sensor: ${door.label}`);
    }

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    try {
      const status = await this.platform.getCachedDoorsAndLocks();
      const { Characteristic } = this.platform;
      if (!status.doors) return;

      const anyOpen = Object.values(status.doors).some(Boolean);
      const summary = this.services.get('summary');
      if (summary) {
        summary.updateCharacteristic(
          Characteristic.ContactSensorState,
          anyOpen
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
        this.platform.dbg(`Doors summary: ${anyOpen ? 'ANY OPEN' : 'ALL CLOSED'}`);
      }

      for (const door of DOOR_SENSORS) {
        const svc = this.services.get(door.key);
        if (!svc) continue;
        const isOpen = status.doors[door.key];
        this.platform.dbg(`Door [${door.label}]: ${isOpen ? 'OPEN' : 'CLOSED'}`);
        svc.updateCharacteristic(
          Characteristic.ContactSensorState,
          isOpen
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }
    } catch (err) {
      this.platform.log.warn('Doors poll failed:', (err as Error).message);
    }
  }
}
