"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowsAccessory = void 0;
const accessoryInfo_1 = require("./accessoryInfo");
const WINDOW_SENSORS = [
    { key: 'frontLeft', label: 'Front Left Window' },
    { key: 'frontRight', label: 'Front Right Window' },
    { key: 'rearLeft', label: 'Rear Left Window' },
    { key: 'rearRight', label: 'Rear Right Window' },
    { key: 'sunroof', label: 'Sunroof' },
];
class WindowsAccessory {
    constructor(platform, accessory, opts) {
        this.platform = platform;
        this.accessory = accessory;
        this.opts = opts;
        this.services = new Map();
        const { Service, Characteristic } = platform;
        (0, accessoryInfo_1.setAccessoryInfo)(platform, accessory, 'XC90 — Windows');
        // Summary sensor drives the tile — find by subtype so renames don't cause conflicts
        const summary = accessory.services.find(s => s.subtype === 'summary' && s.UUID === Service.ContactSensor.UUID)
            || accessory.addService(Service.ContactSensor, 'All Windows', 'summary');
        summary.setCharacteristic(Characteristic.ConfiguredName, 'All Windows');
        this.services.set('summary', summary);
        for (const win of WINDOW_SENSORS) {
            // Find by subtype — safe against display name changes across versions
            const svc = accessory.services.find(s => s.subtype === win.key && s.UUID === Service.ContactSensor.UUID)
                || accessory.addService(Service.ContactSensor, win.label, win.key);
            svc.displayName = win.label;
            svc.setCharacteristic(Characteristic.ConfiguredName, win.label);
            this.services.set(win.key, svc);
        }
        platform.registerPoll(() => this.poll());
        this.poll();
        setInterval(() => this.poll(), opts.pollInterval);
    }
    async poll() {
        try {
            const windows = await this.platform.getCachedWindows();
            const { Characteristic } = this.platform;
            const anyOpen = Object.values(windows).some(v => v === 'OPEN');
            const summary = this.services.get('summary');
            if (summary) {
                summary.updateCharacteristic(Characteristic.ContactSensorState, anyOpen
                    ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
                    : Characteristic.ContactSensorState.CONTACT_DETECTED);
            }
            for (const win of WINDOW_SENSORS) {
                const svc = this.services.get(win.key);
                if (!svc)
                    continue;
                const isOpen = windows[win.key] === 'OPEN';
                this.platform.dbg(`Window [${win.label}]: ${windows[win.key]}`);
                svc.updateCharacteristic(Characteristic.ContactSensorState, isOpen
                    ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
                    : Characteristic.ContactSensorState.CONTACT_DETECTED);
            }
            this.platform.dbg(`Windows summary: ${anyOpen ? 'ANY OPEN' : 'ALL CLOSED'}`);
        }
        catch (err) {
            this.platform.log.warn('Windows poll failed:', err.message);
        }
    }
}
exports.WindowsAccessory = WindowsAccessory;
//# sourceMappingURL=windowsAccessory.js.map