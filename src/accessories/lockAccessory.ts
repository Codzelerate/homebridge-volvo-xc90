import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';

export class LockAccessory {
  private service;
  private currentState: CharacteristicValue;
  private targetState: CharacteristicValue;

  constructor(
    private readonly platform: VolvoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly opts: { pollInterval: number; engineDuration: number },
  ) {
    const { Service, Characteristic } = platform;

    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Volvo')
      .setCharacteristic(Characteristic.Model, 'XC90 2016')
      .setCharacteristic(Characteristic.SerialNumber, platform.config.vin ?? 'unknown');

    this.service = accessory.getService(Service.LockMechanism)
      || accessory.addService(Service.LockMechanism);

    this.currentState = Characteristic.LockCurrentState.UNKNOWN;
    this.targetState = Characteristic.LockTargetState.SECURED;

    this.service.getCharacteristic(Characteristic.LockCurrentState)
      .onGet(() => this.currentState);

    this.service.getCharacteristic(Characteristic.LockTargetState)
      .onGet(() => this.targetState)
      .onSet(async (value) => {
        this.targetState = value;
        try {
          if (value === Characteristic.LockTargetState.SECURED) {
            await platform.api.lock();
          } else {
            await platform.api.unlock();
          }
          this.currentState = value === Characteristic.LockTargetState.SECURED
            ? Characteristic.LockCurrentState.SECURED
            : Characteristic.LockCurrentState.UNSECURED;
          this.service.updateCharacteristic(Characteristic.LockCurrentState, this.currentState);
        } catch (err) {
          platform.log.error('Lock command failed:', (err as Error).message);
        }
      });

    this.poll();
    setInterval(() => this.poll(), opts.pollInterval);
  }

  private async poll(): Promise<void> {
    try {
      const status = await this.platform.api.getDoorsAndLocks();
      const { Characteristic } = this.platform;
      this.currentState = status.locked
        ? Characteristic.LockCurrentState.SECURED
        : Characteristic.LockCurrentState.UNSECURED;
      this.targetState = status.locked
        ? Characteristic.LockTargetState.SECURED
        : Characteristic.LockTargetState.UNSECURED;
      this.service.updateCharacteristic(Characteristic.LockCurrentState, this.currentState);
      this.service.updateCharacteristic(Characteristic.LockTargetState, this.targetState);
    } catch (err) {
      this.platform.log.warn('Lock poll failed:', (err as Error).message);
    }
  }

  // expose for platform to access
  get config() {
    return this.platform['config'];
  }
}
