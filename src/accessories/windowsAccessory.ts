import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

const WINDOW_SENSORS = [
  { key: 'frontLeft',  label: 'Front Left Window' },
  { key: 'frontRight', label: 'Front Right Window' },
  { key: 'rearLeft',   label: 'Rear Left Window' },
  { key: 'rearRight',  label: 'Rear Right Window' },
  { key: 'sunroof',    label: 'Sunroof' },
] as const;

type WindowKey = typeof WINDOW_SENSORS[number]['key'];
type ServiceMap = Map<WindowKey | 'summary', ReturnType<PlatformAccessory['addService']>>;

export class WindowsAccessory {
  private services: ServiceMap = new Map();

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — Windows');

    // Summary sensor drives the tile — shows Open if any window is open
    const summary = accessory.getService('All Windows')
      || accessory.addService(Service.ContactSensor, 'All Windows', 'summary');
    summary.setCharacteristic(Characteristic.ConfiguredName, 'All Windows');
    this.services.set('summary', summary);

    for (const win of WINDOW_SENSORS) {
      const svc = accessory.getService(win.label)
        || accessory.addService(Service.ContactSensor, win.label, win.key);
      svc.setCharacteristic(Characteristic.ConfiguredName, win.label);
      this.services.set(win.key, svc);
    }

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    try {
      const windows = await this.platform.api.getWindows();
      const { Characteristic } = this.platform;

      const anyOpen = Object.values(windows).some(v => v === 'OPEN');

      const summary = this.services.get('summary');
      if (summary) {
        summary.updateCharacteristic(
          Characteristic.ContactSensorState,
          anyOpen
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }

      for (const win of WINDOW_SENSORS) {
        const svc = this.services.get(win.key);
        if (!svc) continue;
        const isOpen = windows[win.key] === 'OPEN';
        this.platform.dbg(`Window [${win.label}]: ${windows[win.key]}`);
        svc.updateCharacteristic(
          Characteristic.ContactSensorState,
          isOpen
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED,
        );
      }

      this.platform.dbg(`Windows summary: ${anyOpen ? 'ANY OPEN' : 'ALL CLOSED'}`);
    } catch (err) {
      this.platform.log.warn('Windows poll failed:', (err as Error).message);
    }
  }
}
