import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { VolvoPlatform } from '../platform';
import { setAccessoryInfo } from './accessoryInfo';

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

    setAccessoryInfo(platform, accessory, 'XC90 — Lock');

    this.service = accessory.getService(Service.LockMechanism)
      || accessory.addService(Service.LockMechanism);

    this.currentState = Characteristic.LockCurrentState.UNKNOWN;
    this.targetState = Characteristic.LockTargetState.SECURED;

    this.service.getCharacteristic(Characteristic.LockCurrentState)
      .onGet(() => {
        platform.dbg(`LockCurrentState queried: ${this.currentState}`);
        return this.currentState;
      });

    this.service.getCharacteristic(Characteristic.LockTargetState)
      .onGet(() => {
        platform.dbg(`LockTargetState queried: ${this.targetState}`);
        return this.targetState;
      })
      .onSet(async (value) => {
        const action = value === Characteristic.LockTargetState.SECURED ? 'lock' : 'unlock';
        platform.dbg(`Lock onSet: ${action}`);
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
          platform.log.info(`Lock: ${action} succeeded`);
        } catch (err) {
          platform.log.error(`Lock ${action} failed:`, (err as Error).message);
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
      this.platform.dbg(`Lock poll complete: ${status.locked ? 'LOCKED' : 'UNLOCKED'}`);
    } catch (err) {
      this.platform.log.warn('Lock poll failed:', (err as Error).message);
    }
  }
}
