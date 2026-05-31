import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class ControlsAccessory {
  private climateService: ReturnType<PlatformAccessory['addService']> | null = null;
  private engineService: ReturnType<PlatformAccessory['addService']> | null = null;
  private climateActive = false;
  private engineRunning = false;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    setAccessoryInfo(platform, accessory, 'XC90 — Controls');

    // Remove legacy unsubtyped Switch service left by the old ClimateAccessory
    const legacySwitch = accessory.services.find(s => s.UUID === Service.Switch.UUID && !s.subtype);
    if (legacySwitch) accessory.removeService(legacySwitch);

    if (platform.config.showClimate !== false) {
      this.climateService = accessory.getService('Climate')
        || accessory.addService(Service.Switch, 'Climate', 'climate');
      this.climateService.setCharacteristic(Characteristic.Name, 'Climate');
      this.climateService.getCharacteristic(Characteristic.On)
        .onGet(() => {
          platform.dbg(`Climate onGet: ${this.climateActive}`);
          return this.climateActive;
        })
        .onSet(async (value: CharacteristicValue) => {
          const on = value as boolean;
          platform.dbg(`Climate onSet: ${on ? 'start' : 'stop'}`);
          try {
            if (on) {
              await platform.api.startClimatisation();
              platform.log.info('Climatisation started');
            } else {
              await platform.api.stopClimatisation();
              platform.log.info('Climatisation stopped');
            }
            this.climateActive = on;
          } catch (err) {
            platform.log.error('Climate command failed:', (err as Error).message);
          }
        });
    }

    if (platform.config.showEngine !== false) {
      this.engineService = accessory.getService('Remote Start')
        || accessory.addService(Service.Switch, 'Remote Start', 'engine');
      this.engineService.setCharacteristic(Characteristic.Name, 'Remote Start');
      this.engineService.getCharacteristic(Characteristic.On)
        .onGet(() => {
          platform.dbg(`Engine onGet: running=${this.engineRunning}`);
          return this.engineRunning;
        })
        .onSet(async (value: CharacteristicValue) => {
          const on = value as boolean;
          platform.dbg(`Engine onSet: ${on ? `start (${opts.engineDuration}min)` : 'stop'}`);
          try {
            if (on) {
              await platform.api.startEngine(opts.engineDuration);
              platform.log.info(`Engine started for ${opts.engineDuration} min`);
            } else {
              await platform.api.stopEngine();
              platform.log.info('Engine stopped');
            }
            this.engineRunning = on;
          } catch (err) {
            platform.log.error('Engine command failed:', (err as Error).message);
          }
        });
    }
  }
}
