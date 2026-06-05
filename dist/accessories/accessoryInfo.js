"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAccessoryInfo = setAccessoryInfo;
function setAccessoryInfo(platform, accessory, model) {
    const { Service, Characteristic } = platform;
    accessory.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'Volvo Cars')
        .setCharacteristic(Characteristic.Model, model)
        .setCharacteristic(Characteristic.SerialNumber, platform.config.vin ?? 'unknown')
        .setCharacteristic(Characteristic.FirmwareRevision, platform.pluginVersion)
        .setCharacteristic(Characteristic.HardwareRevision, '2016');
}
//# sourceMappingURL=accessoryInfo.js.map