"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeftOpenAccessory = void 0;
const accessoryInfo_1 = require("./accessoryInfo");
/**
 * LeftOpenAccessory
 *
 * A single ContactSensor that alerts when the car is locked but at least one
 * door, window, sunroof, hood, or tailgate is still open.
 *
 * The sensor's ConfiguredName updates dynamically to describe exactly what
 * was left open — e.g. "Volvo: Door · Sunroof". This means the HomeKit
 * notification reads "Volvo: Door · Sunroof is Open", giving you actionable
 * information without opening any app.
 *
 * The alert fires once when the condition first becomes true (locked + open).
 * It clears automatically when the car is unlocked or all openings are closed.
 * Enable notifications for this sensor in the Home app to receive alerts.
 *
 * Note: automations that reference this sensor work by UUID, so they remain
 * functional even when the ConfiguredName changes. The automation display in
 * the Home app will show the current dynamic name.
 */
const BASE_NAME = 'Left Open';
function buildLabel(doors, windows) {
    const parts = [];
    const openDoorCount = [doors.frontLeft, doors.frontRight, doors.rearLeft, doors.rearRight].filter(Boolean).length;
    if (openDoorCount === 1)
        parts.push('Door');
    if (openDoorCount > 1)
        parts.push('Doors');
    if (doors.hood)
        parts.push('Hood');
    if (doors.tailgate)
        parts.push('Tailgate');
    const openWindowCount = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight']
        .filter(k => windows[k] === 'OPEN').length;
    if (openWindowCount === 1)
        parts.push('Window');
    if (openWindowCount > 1)
        parts.push('Windows');
    if (windows['sunroof'] === 'OPEN')
        parts.push('Sunroof');
    return parts.length > 0 ? `Volvo: ${parts.join(' · ')}` : BASE_NAME;
}
class LeftOpenAccessory {
    constructor(platform, accessory, opts) {
        this.platform = platform;
        this.accessory = accessory;
        this.opts = opts;
        this.isOpen = false;
        const { Service, Characteristic } = platform;
        (0, accessoryInfo_1.setAccessoryInfo)(platform, accessory, 'XC90 — Left Open');
        this.service = accessory.getService(Service.ContactSensor)
            || accessory.addService(Service.ContactSensor, BASE_NAME, 'left-open');
        this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.service.setCharacteristic(Characteristic.Name, BASE_NAME);
        this.service.setCharacteristic(Characteristic.ConfiguredName, BASE_NAME);
        this.service.getCharacteristic(Characteristic.ContactSensorState)
            .onGet(() => this.isOpen
            ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
            : Characteristic.ContactSensorState.CONTACT_DETECTED);
        platform.registerPoll(() => this.poll());
        this.poll();
        setInterval(() => this.poll(), opts.pollInterval);
    }
    async poll() {
        const { Characteristic } = this.platform;
        try {
            const [status, windows] = await Promise.all([
                this.platform.getCachedDoorsAndLocks(),
                this.platform.getCachedWindows(),
            ]);
            if (!status.doors)
                return;
            const locked = status.locked === true;
            const anyDoorOpen = status.doors.frontLeft || status.doors.frontRight ||
                status.doors.rearLeft || status.doors.rearRight ||
                status.doors.hood || status.doors.tailgate;
            const anyWindowOpen = Object.values(windows).some(v => v === 'OPEN');
            const leftOpen = locked && (anyDoorOpen || anyWindowOpen);
            const label = leftOpen ? buildLabel(status.doors, windows) : BASE_NAME;
            // Update name first so the notification carries the correct label
            this.service.updateCharacteristic(Characteristic.ConfiguredName, label);
            this.service.updateCharacteristic(Characteristic.ContactSensorState, leftOpen
                ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
                : Characteristic.ContactSensorState.CONTACT_DETECTED);
            if (leftOpen !== this.isOpen) {
                this.isOpen = leftOpen;
                if (leftOpen) {
                    this.platform.log.info(`Left open while locked: ${label.replace('Volvo: ', '')}`);
                }
                else {
                    this.platform.log.info('Left Open cleared — car unlocked or all closed');
                }
            }
            else {
                this.platform.dbg(`Left Open: ${leftOpen ? label : 'all closed / unlocked'}`);
            }
        }
        catch (err) {
            this.platform.log.warn('Left Open poll failed:', err.message);
        }
    }
}
exports.LeftOpenAccessory = LeftOpenAccessory;
//# sourceMappingURL=leftOpenAccessory.js.map