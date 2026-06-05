"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoorsAccessory = void 0;
const accessoryInfo_1 = require("./accessoryInfo");
const DOOR_SENSORS = [
    { key: 'frontLeft', label: 'Front Left Door' },
    { key: 'frontRight', label: 'Front Right Door' },
    { key: 'rearLeft', label: 'Rear Left Door' },
    { key: 'rearRight', label: 'Rear Right Door' },
    { key: 'hood', label: 'Hood' },
    { key: 'tailgate', label: 'Tailgate' },
];
class DoorsAccessory {
    constructor(platform, accessory, opts) {
        this.platform = platform;
        this.accessory = accessory;
        this.opts = opts;
        this.services = new Map();
        const { Service, Characteristic } = platform;
        (0, accessoryInfo_1.setAccessoryInfo)(platform, accessory, 'XC90 — Doors');
        // Summary sensor added first — HomeKit uses the first service as the tile state
        const summary = accessory.services.find(s => s.subtype === 'summary' && s.UUID === Service.ContactSensor.UUID)
            || accessory.addService(Service.ContactSensor, 'All Doors', 'summary');
        summary.setCharacteristic(Characteristic.ConfiguredName, 'All Doors');
        this.services.set('summary', summary);
        for (const door of DOOR_SENSORS) {
            // Find by subtype — safe against display name changes across versions
            const svc = accessory.services.find(s => s.subtype === door.key && s.UUID === Service.ContactSensor.UUID)
                || accessory.addService(Service.ContactSensor, door.label, door.key);
            svc.displayName = door.label;
            svc.setCharacteristic(Characteristic.ConfiguredName, door.label);
            this.services.set(door.key, svc);
            platform.dbg(`Registered door sensor: ${door.label}`);
        }
        platform.registerPoll(() => this.poll());
        this.poll();
        setInterval(() => this.poll(), opts.pollInterval);
    }
    async poll() {
        try {
            const status = await this.platform.getCachedDoorsAndLocks();
            const { Characteristic } = this.platform;
            if (!status.doors)
                return;
            const anyOpen = Object.values(status.doors).some(Boolean);
            const summary = this.services.get('summary');
            if (summary) {
                summary.updateCharacteristic(Characteristic.ContactSensorState, anyOpen
                    ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
                    : Characteristic.ContactSensorState.CONTACT_DETECTED);
                this.platform.dbg(`Doors summary: ${anyOpen ? 'ANY OPEN' : 'ALL CLOSED'}`);
            }
            for (const door of DOOR_SENSORS) {
                const svc = this.services.get(door.key);
                if (!svc)
                    continue;
                const isOpen = status.doors[door.key];
                this.platform.dbg(`Door [${door.label}]: ${isOpen ? 'OPEN' : 'CLOSED'}`);
                svc.updateCharacteristic(Characteristic.ContactSensorState, isOpen
                    ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
                    : Characteristic.ContactSensorState.CONTACT_DETECTED);
            }
        }
        catch (err) {
            this.platform.log.warn('Doors poll failed:', err.message);
        }
    }
}
exports.DoorsAccessory = DoorsAccessory;
//# sourceMappingURL=doorsAccessory.js.map