import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { VolvoApiClient, TokenSet } from './volvoApi';
import { LockAccessory } from './accessories/lockAccessory';
import { ClimateAccessory } from './accessories/climateAccessory';
import { EngineAccessory } from './accessories/engineAccessory';
import { DoorsAccessory } from './accessories/doorsAccessory';
import { FuelAccessory } from './accessories/fuelAccessory';

export interface VolvoConfig extends PlatformConfig {
  username: string;
  password: string;
  vccApiKey: string;
  vin: string;
  engineStartDuration?: number;
  pollInterval?: number;
}

export class VolvoPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  public readonly api: VolvoApiClient;
  public readonly config: VolvoConfig;

  constructor(
    public readonly log: Logger,
    config: PlatformConfig,
    public readonly hbApi: API,
  ) {
    this.Service = hbApi.hap.Service;
    this.Characteristic = hbApi.hap.Characteristic;
    this.config = config as VolvoConfig;

    this.api = new VolvoApiClient(this.config.vccApiKey, this.config.vin);

    hbApi.on('didFinishLaunching', () => {
      this.authenticate().then(() => this.discoverDevices());
    });
  }

  private async authenticate(): Promise<void> {
    try {
      await this.api.authenticate(this.config.username, this.config.password);
      this.log.info('Authenticated with Volvo API');

      const supported = await this.api.getSupportedCommands();
      this.log.info(`Supported commands for VIN ${this.config.vin}: ${supported.join(', ')}`);
    } catch (err) {
      this.log.error('Failed to authenticate with Volvo API:', (err as Error).message);
    }
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private discoverDevices(): void {
    const pollInterval = (this.config.pollInterval ?? 30) * 1000;
    const engineDuration = this.config.engineStartDuration ?? 15;
    const vin = this.config.vin;

    const devices = [
      { id: `${vin}-lock`,    name: 'Volvo Lock',    Class: LockAccessory },
      { id: `${vin}-climate`, name: 'Volvo Climate', Class: ClimateAccessory },
      { id: `${vin}-engine`,  name: 'Volvo Engine',  Class: EngineAccessory },
      { id: `${vin}-doors`,   name: 'Volvo Doors',   Class: DoorsAccessory },
      { id: `${vin}-fuel`,    name: 'Volvo Fuel',    Class: FuelAccessory },
    ];

    for (const device of devices) {
      const uuid = this.hbApi.hap.uuid.generate(device.id);
      const existing = this.accessories.find(a => a.UUID === uuid);

      if (existing) {
        this.log.info(`Restoring accessory: ${device.name}`);
        new device.Class(this, existing, { pollInterval, engineDuration });
      } else {
        this.log.info(`Adding accessory: ${device.name}`);
        const accessory = new this.hbApi.platformAccessory(device.name, uuid);
        new device.Class(this, accessory, { pollInterval, engineDuration });
        this.hbApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
