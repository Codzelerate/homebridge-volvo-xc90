"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationAccessory = void 0;
const accessoryInfo_1 = require("./accessoryInfo");
// Haversine formula — returns distance in metres between two lat/lon points
function haversineMetres(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in metres
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
class LocationAccessory {
    constructor(platform, accessory, opts) {
        this.platform = platform;
        this.accessory = accessory;
        this.opts = opts;
        this.isHome = false;
        const { Service, Characteristic } = platform;
        this.homeLat = platform.config.homeLatitude ?? 0;
        this.homeLon = platform.config.homeLongitude ?? 0;
        this.radiusMetres = platform.config.homeRadiusMeters ?? 200;
        (0, accessoryInfo_1.setAccessoryInfo)(platform, accessory, 'XC90 — Location');
        this.service = accessory.getService(Service.OccupancySensor)
            || accessory.addService(Service.OccupancySensor, 'Car at Home', 'location');
        this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.service.setCharacteristic(Characteristic.ConfiguredName, 'Car at Home');
        this.service.getCharacteristic(Characteristic.OccupancyDetected)
            .onGet(() => this.isHome
            ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
        if (this.homeLat === 0 && this.homeLon === 0) {
            platform.log.warn('Location: homeLatitude and homeLongitude are not configured — Car at Home sensor will always show Not Occupied.');
        }
        platform.registerPoll(() => this.poll());
        this.poll();
        setInterval(() => this.poll(), opts.pollInterval);
    }
    async poll() {
        const { Characteristic } = this.platform;
        try {
            const loc = await this.platform.api.getLocation();
            if (!loc) {
                this.platform.log.warn('Location: no coordinates returned from API');
                return;
            }
            const distanceM = haversineMetres(this.homeLat, this.homeLon, loc.latitude, loc.longitude);
            const atHome = distanceM <= this.radiusMetres;
            this.platform.dbg(`Location: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}` +
                ` | heading ${loc.heading}° | ${Math.round(distanceM)}m from home` +
                ` | ${atHome ? 'AT HOME' : 'AWAY'} (radius ${this.radiusMetres}m)` +
                ` | last updated ${loc.timestamp}`);
            if (atHome !== this.isHome) {
                this.isHome = atHome;
                this.platform.log.info(`Car is now ${atHome ? 'HOME' : 'AWAY'} (${Math.round(distanceM)}m from home)`);
            }
            this.service.updateCharacteristic(Characteristic.OccupancyDetected, atHome
                ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
                : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
        }
        catch (err) {
            this.platform.log.warn('Location poll failed:', err.message);
        }
    }
}
exports.LocationAccessory = LocationAccessory;
//# sourceMappingURL=locationAccessory.js.map