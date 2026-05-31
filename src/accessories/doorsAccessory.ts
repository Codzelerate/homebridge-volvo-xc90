import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';

const DOOR_SENSORS = [
  { key: 'frontLeft',  label: 'Front Left Door' },
  { key: 'frontRight', label: 'Front Right Door' },
  { key: 'rearLeft',   label: 'Rear Left Door' },
  { key: 'rearRight',  label: 'Rear Right Door' },
  { key: 'hood',       label: 'Hood' },
  { key: 'tailgate',   label: 'Tailgate' },
] as const;

type DoorKey = typeof DOOR_SENSORS[number]['key'];

export class DoorsAccessory {
  private services: Map<DoorKey, ReturnType<PlatformAccessory['addService']>> = new Map();

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Volvo')
      .setCharacteristic(Characteristic.Model, 'XC90 2016')
      .setCharacteristic(Characteristic.SerialNumber, platform.config.vin ?? 'unknown');

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
      const status = await this.platform.api.getDoorsAndLocks();
      const { Characteristic } = this.platform;
      if (!status.doors) return;

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
