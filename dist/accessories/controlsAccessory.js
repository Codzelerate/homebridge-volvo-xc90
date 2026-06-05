"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlsAccessory = void 0;
const accessoryInfo_1 = require("./accessoryInfo");
class ControlsAccessory {
    constructor(platform, accessory, opts) {
        this.platform = platform;
        this.accessory = accessory;
        this.opts = opts;
        this.climateService = null;
        this.engineService = null;
        this.honkService = null;
        this.flashService = null;
        this.honkFlashService = null;
        this.refreshService = null;
        this.climateActive = false;
        this.engineRunning = false;
        const { Service, Characteristic } = platform;
        (0, accessoryInfo_1.setAccessoryInfo)(platform, accessory, 'XC90 — Controls');
        // Remove legacy unsubtyped Switch service left by the old ClimateAccessory
        const legacySwitch = accessory.services.find(s => s.UUID === Service.Switch.UUID && !s.subtype);
        if (legacySwitch)
            accessory.removeService(legacySwitch);
        // Migration: v1.0.14 used subtype 'honk' for the combined Honk and Flash switch.
        // v1.0.15+ uses subtype 'honk-flash' for combined and 'honk' for horn-only.
        // Remove the old service so it gets re-added under the correct subtype.
        const legacyHonkFlash = accessory.services.find(s => s.UUID === Service.Switch.UUID && s.subtype === 'honk');
        if (legacyHonkFlash) {
            platform.log.info('Migrating legacy Honk and Flash service to updated subtype');
            accessory.removeService(legacyHonkFlash);
        }
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
                .onSet(async (value) => {
                const on = value;
                platform.dbg(`Climate onSet: ${on ? 'start' : 'stop'}`);
                this.climateActive = on; // optimistic — prevents HomeKit verify-GET from flipping back
                try {
                    if (on) {
                        await platform.api.startClimatisation();
                        platform.log.info('Climatisation started');
                    }
                    else {
                        await platform.api.stopClimatisation();
                        platform.log.info('Climatisation stopped');
                    }
                }
                catch (err) {
                    this.climateActive = !on; // revert on failure
                    this.climateService.updateCharacteristic(Characteristic.On, !on);
                    platform.log.error('Climate command failed:', err.message);
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
                .onSet(async (value) => {
                if (!value)
                    return;
                platform.dbg('Honk triggered');
                try {
                    await platform.api.honk();
                    platform.log.info('Honk sent');
                }
                catch (err) {
                    platform.log.error('Honk failed:', err.message);
                }
                finally {
                    setTimeout(() => this.honkService.updateCharacteristic(Characteristic.On, false), 1500);
                }
            });
        }
        else {
            // Remove service if config toggled off
            const s = accessory.getService('Honk');
            if (s)
                accessory.removeService(s);
        }
        if (platform.config.showFlash === true) {
            this.flashService = accessory.getService('Flash')
                || accessory.addService(Service.Switch, 'Flash', 'flash');
            this.flashService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            this.flashService.setCharacteristic(Characteristic.ConfiguredName, 'Flash');
            this.flashService.getCharacteristic(Characteristic.On)
                .onGet(() => false)
                .onSet(async (value) => {
                if (!value)
                    return;
                platform.dbg('Flash triggered');
                try {
                    await platform.api.flash();
                    platform.log.info('Flash sent');
                }
                catch (err) {
                    platform.log.error('Flash failed:', err.message);
                }
                finally {
                    setTimeout(() => this.flashService.updateCharacteristic(Characteristic.On, false), 1500);
                }
            });
        }
        else {
            const s = accessory.getService('Flash');
            if (s)
                accessory.removeService(s);
        }
        if (platform.config.showHonkFlash !== false) {
            this.honkFlashService = accessory.getService('Honk and Flash')
                || accessory.addService(Service.Switch, 'Honk and Flash', 'honk-flash');
            this.honkFlashService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            this.honkFlashService.setCharacteristic(Characteristic.ConfiguredName, 'Honk and Flash');
            this.honkFlashService.getCharacteristic(Characteristic.On)
                .onGet(() => false)
                .onSet(async (value) => {
                if (!value)
                    return;
                platform.dbg('Honk and Flash triggered');
                try {
                    await platform.api.honkAndFlash();
                    platform.log.info('Honk and Flash sent');
                }
                catch (err) {
                    platform.log.error('Honk and Flash failed:', err.message);
                }
                finally {
                    setTimeout(() => this.honkFlashService.updateCharacteristic(Characteristic.On, false), 1500);
                }
            });
        }
        else {
            const s = accessory.getService('Honk and Flash');
            if (s)
                accessory.removeService(s);
        }
        if (platform.config.showRefresh === true) {
            this.refreshService = accessory.getService('Refresh')
                || accessory.addService(Service.Switch, 'Refresh', 'refresh');
            this.refreshService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            this.refreshService.setCharacteristic(Characteristic.ConfiguredName, 'Refresh');
            this.refreshService.getCharacteristic(Characteristic.On)
                .onGet(() => false)
                .onSet(async (value) => {
                if (!value)
                    return;
                platform.log.info('Manual refresh triggered from HomeKit');
                try {
                    await platform.refreshAll();
                }
                finally {
                    setTimeout(() => this.refreshService.updateCharacteristic(Characteristic.On, false), 1000);
                }
            });
        }
        else {
            const s = accessory.getService('Refresh');
            if (s)
                accessory.removeService(s);
        }
        if (platform.config.showEngine === true && platform.supportsEngine()) {
            this.engineService = accessory.getService('Remote Start')
                || accessory.addService(Service.Switch, 'Remote Start', 'engine');
            this.engineService.addOptionalCharacteristic(Characteristic.ConfiguredName);
            this.engineService.setCharacteristic(Characteristic.ConfiguredName, 'Remote Start');
            this.engineService.getCharacteristic(Characteristic.On)
                .onGet(() => {
                platform.dbg(`Engine onGet: running=${this.engineRunning}`);
                return this.engineRunning;
            })
                .onSet(async (value) => {
                const on = value;
                platform.dbg(`Engine onSet: ${on ? `start (${opts.engineDuration}min)` : 'stop'}`);
                this.engineRunning = on; // optimistic — prevents HomeKit verify-GET from flipping back
                try {
                    if (on) {
                        await platform.api.startEngine(opts.engineDuration);
                        platform.log.info(`Engine started for ${opts.engineDuration} min`);
                    }
                    else {
                        await platform.api.stopEngine();
                        platform.log.info('Engine stopped');
                    }
                }
                catch (err) {
                    this.engineRunning = !on; // revert on failure
                    this.engineService.updateCharacteristic(Characteristic.On, !on);
                    platform.log.error('Engine command failed:', err.message);
                }
            });
        }
        else {
            // Remove the cached Remote Start switch for users who had it before it was hidden
            const s = accessory.getService('Remote Start');
            if (s)
                accessory.removeService(s);
        }
    }
}
exports.ControlsAccessory = ControlsAccessory;
//# sourceMappingURL=controlsAccessory.js.map