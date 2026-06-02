import { PlatformAccessory } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

// Haversine formula — returns distance in metres between two lat/lon points
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class LocationAccessory {
  private service: ReturnType<PlatformAccessory['addService']>;
  private isHome = false;
  private readonly homeLat: number;
  private readonly homeLon: number;
  private readonly radiusMetres: number;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    this.homeLat      = platform.config.homeLatitude   ?? 0;
    this.homeLon      = platform.config.homeLongitude  ?? 0;
    this.radiusMetres = platform.config.homeRadiusMeters ?? 200;

    setAccessoryInfo(platform, accessory, 'XC90 — Location');

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

  private async poll(): Promise<void> {
    const { Characteristic } = this.platform;
    try {
      const loc = await this.platform.api.getLocation();
      if (!loc) {
        this.platform.log.warn('Location: no coordinates returned from API');
        return;
      }

      const distanceM = haversineMetres(this.homeLat, this.homeLon, loc.latitude, loc.longitude);
      const atHome = distanceM <= this.radiusMetres;

      this.platform.dbg(
        `Location: ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}` +
        ` | heading ${loc.heading}° | ${Math.round(distanceM)}m from home` +
        ` | ${atHome ? 'AT HOME' : 'AWAY'} (radius ${this.radiusMetres}m)` +
        ` | last updated ${loc.timestamp}`,
      );

      if (atHome !== this.isHome) {
        this.isHome = atHome;
        this.platform.log.info(`Car is now ${atHome ? 'HOME' : 'AWAY'} (${Math.round(distanceM)}m from home)`);
      }

      this.service.updateCharacteristic(
        Characteristic.OccupancyDetected,
        atHome
          ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
          : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
      );
    } catch (err) {
      this.platform.log.warn('Location poll failed:', (err as Error).message);
    }
  }
}
