import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

export class ControlsAccessory {
  private climateService: ReturnType<PlatformAccessory['addService']> | null = null;
  private engineService: ReturnType<PlatformAccessory['addService']> | null = null;
  private honkService: ReturnType<PlatformAccessory['addService']> | null = null;
  private flashService: ReturnType<PlatformAccessory['addService']> | null = null;
  private honkFlashService: ReturnType<PlatformAccessory['addService']> | null = null;
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
      this.climateService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.climateService.setCharacteristic(Characteristic.ConfiguredName, 'Climate');
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

    if (platform.config.showHonk === true) {
      this.honkService = accessory.getService('Honk')
        || accessory.addService(Service.Switch, 'Honk', 'honk');
      this.honkService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.honkService.setCharacteristic(Characteristic.ConfiguredName, 'Honk');
      this.honkService.getCharacteristic(Characteristic.On)
        .onGet(() => false)
        .onSet(async (value: CharacteristicValue) => {
          if (!value) return;
          platform.dbg('Honk triggered');
          try {
            await platform.api.honk();
            platform.log.info('Honk sent');
          } catch (err) {
            platform.log.error('Honk failed:', (err as Error).message);
          } finally {
            setTimeout(() => this.honkService!.updateCharacteristic(Characteristic.On, false), 1500);
          }
        });
    } else {
      // Remove service if config toggled off
      const s = accessory.getService('Honk');
      if (s) accessory.removeService(s);
    }

    if (platform.config.showFlash === true) {
      this.flashService = accessory.getService('Flash')
        || accessory.addService(Service.Switch, 'Flash', 'flash');
      this.flashService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.flashService.setCharacteristic(Characteristic.ConfiguredName, 'Flash');
      this.flashService.getCharacteristic(Characteristic.On)
        .onGet(() => false)
        .onSet(async (value: CharacteristicValue) => {
          if (!value) return;
          platform.dbg('Flash triggered');
          try {
            await platform.api.flash();
            platform.log.info('Flash sent');
          } catch (err) {
            platform.log.error('Flash failed:', (err as Error).message);
          } finally {
            setTimeout(() => this.flashService!.updateCharacteristic(Characteristic.On, false), 1500);
          }
        });
    } else {
      const s = accessory.getService('Flash');
      if (s) accessory.removeService(s);
    }

    if (platform.config.showHonkFlash !== false) {
      this.honkFlashService = accessory.getService('Honk & Flash')
        || accessory.addService(Service.Switch, 'Honk & Flash', 'honk-flash');
      this.honkFlashService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.honkFlashService.setCharacteristic(Characteristic.ConfiguredName, 'Honk & Flash');
      this.honkFlashService.getCharacteristic(Characteristic.On)
        .onGet(() => false)
        .onSet(async (value: CharacteristicValue) => {
          if (!value) return;
          platform.dbg('Honk & Flash triggered');
          try {
            await platform.api.honkAndFlash();
            platform.log.info('Honk & Flash sent');
          } catch (err) {
            platform.log.error('Honk & Flash failed:', (err as Error).message);
          } finally {
            setTimeout(() => this.honkFlashService!.updateCharacteristic(Characteristic.On, false), 1500);
          }
        });
    } else {
      const s = accessory.getService('Honk & Flash');
      if (s) accessory.removeService(s);
    }

    if (platform.config.showEngine !== false) {
      this.engineService = accessory.getService('Remote Start')
        || accessory.addService(Service.Switch, 'Remote Start', 'engine');
      this.engineService.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.engineService.setCharacteristic(Characteristic.ConfiguredName, 'Remote Start');
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
