"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TankRangeAccessory = exports.EVRangeAccessory = void 0;
const accessoryInfo_1 = require("./accessoryInfo");
class RangeAccessory {
    constructor(platform, accessory, opts, type) {
        this.platform = platform;
        this.accessory = accessory;
        this.opts = opts;
        this.type = type;
        this.rangeKm = 0;
        const { Service, Characteristic } = platform;
        // EV Range → TemperatureSensor (°C, 0–100 fits EV range km)
        // Tank Range → LightSensor (lux, 0–100,000 fits tank range km)
        // Using different service types prevents HomeKit from grouping them in the room summary.
        if (type === 'ev') {
            (0, accessoryInfo_1.setAccessoryInfo)(platform, accessory, 'XC90 — EV Range');
            // Migrate: remove any legacy LightSensor left from earlier versions
            const legacy = accessory.getService(Service.LightSensor);
            if (legacy)
                accessory.removeService(legacy);
            this.service = accessory.getService(Service.TemperatureSensor)
                || accessory.addService(Service.TemperatureSensor, 'EV Range km', 'ev');
            this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
            this.service.setCharacteristic(Characteristic.ConfiguredName, 'EV Range km');
            this.service.getCharacteristic(Characteristic.CurrentTemperature)
                .onGet(() => Math.min(100, this.rangeKm)); // TemperatureSensor max is 100
        }
        else {
            (0, accessoryInfo_1.setAccessoryInfo)(platform, accessory, 'XC90 — Tank Range');
            this.service = accessory.getService(Service.LightSensor)
                || accessory.addService(Service.LightSensor, 'Tank Range km', 'tank');
            this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
            this.service.setCharacteristic(Characteristic.ConfiguredName, 'Tank Range km');
            this.service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .onGet(() => Math.max(0.0001, this.rangeKm));
        }
        platform.registerPoll(() => this.poll());
        this.poll();
        setInterval(() => this.poll(), opts.pollInterval);
    }
    async poll() {
        const { Characteristic } = this.platform;
        try {
            const stats = await this.platform.getCachedStatistics();
            const km = this.type === 'ev'
                ? stats.distanceToEmptyBattery
                : stats.distanceToEmptyTank;
            if (km !== undefined) {
                this.rangeKm = km;
                if (this.type === 'ev') {
                    this.service.updateCharacteristic(Characteristic.CurrentTemperature, Math.min(100, km));
                }
                else {
                    this.service.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.max(0.0001, km));
                }
                this.platform.dbg(`${this.type === 'ev' ? 'EV' : 'Tank'} range: ${km} km`);
            }
        }
        catch (err) {
            this.platform.log.warn(`${this.type === 'ev' ? 'EV' : 'Tank'} range poll failed:`, err.message);
        }
    }
}
class EVRangeAccessory extends RangeAccessory {
    constructor(platform, accessory, opts) {
        super(platform, accessory, opts, 'ev');
    }
}
exports.EVRangeAccessory = EVRangeAccessory;
class TankRangeAccessory extends RangeAccessory {
    constructor(platform, accessory, opts) {
        super(platform, accessory, opts, 'tank');
    }
}
exports.TankRangeAccessory = TankRangeAccessory;
//# sourceMappingURL=rangeAccessory.js.map