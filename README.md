# homebridge-volvo-xc90

[![npm version](https://img.shields.io/npm/v/homebridge-volvo-xc90)](https://www.npmjs.com/package/homebridge-volvo-xc90)
[![npm downloads](https://img.shields.io/npm/dw/homebridge-volvo-xc90)](https://www.npmjs.com/package/homebridge-volvo-xc90)
[![GitHub release](https://img.shields.io/github/v/release/Codzelerate/homebridge-volvo-xc90)](https://github.com/Codzelerate/homebridge-volvo-xc90/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Homebridge](https://homebridge.io) plugin that integrates your **Volvo XC90 2016** (Sensus) with Apple HomeKit via the official [Volvo Connected Vehicle API v2](https://developer.volvocars.com/apis/connected-vehicle/v2/overview/).

Control and monitor your car directly from the Apple Home app and Siri — lock/unlock, climate pre-conditioning, remote engine start, door sensors, and fuel level.

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [HomeKit Accessories](#homekit-accessories)
- [Getting Your VCC API Key](#getting-your-vcc-api-key)
- [Finding Your VIN](#finding-your-vin)
- [Debug Mode](#debug-mode)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)
- [License](#license)

---

## Features

| Accessory | HomeKit Type | What it does |
|---|---|---|
| **Volvo Lock** | Lock Mechanism | Lock and unlock your car |
| **Volvo Climate** | Switch | Start / stop cabin pre-conditioning |
| **Volvo Engine** | Switch | Remote engine start (1–15 min) and stop |
| **Volvo Doors** | Contact Sensors (×6) | Open/closed state for all doors, hood, and tailgate |
| **Volvo Fuel** | Battery Level | Fuel level % with low-fuel alert below 15% |

All accessories update on a configurable poll interval and reflect the latest state from the Volvo backend.

---

## Requirements

- Homebridge ≥ 1.6.0
- Node.js ≥ 18
- A **2016 Volvo XC90** (Sensus infotainment) with an active Volvo On Call subscription
- The **Volvo Cars app** working on your phone (confirms your car has a live cellular connection)
- A free developer account at [developer.volvocars.com](https://developer.volvocars.com)

> **Note:** The 2016 XC90 uses a built-in cellular modem. If your Volvo Cars app can no longer control your car remotely, your modem may need a 4G upgrade from a Volvo dealer before this plugin will work.

---

## Installation

### Via Homebridge UI (recommended)

1. Open the Homebridge UI on your Homebridge host
2. Go to the **Plugins** tab
3. Search for `homebridge-volvo-xc90`
4. Click **Install**
5. Restart Homebridge when prompted

### Via SSH / Terminal

```bash
sudo npm install -g homebridge-volvo-xc90
sudo systemctl restart homebridge
```

---

## Configuration

After installation, configure the plugin through the Homebridge UI:

1. Go to **Plugins → homebridge-volvo-xc90 → Settings**
2. Fill in the four required fields (see table below)
3. Save and restart Homebridge

### Configuration fields

| Field | Required | Description |
|---|---|---|
| **Volvo ID (email)** | ✅ | The email you use to log into the Volvo Cars app |
| **Volvo ID password** | ✅ | Your Volvo Cars account password |
| **VCC API Key** | ✅ | Primary API key from [developer.volvocars.com](https://developer.volvocars.com) |
| **VIN** | ✅ | Your 17-character Vehicle Identification Number |
| **Engine start duration** | — | How long the engine runs remotely (1–15 min, default: 15) |
| **Poll interval** | — | How often vehicle state is fetched in seconds (default: 30) |
| **Debug logging** | — | Log every API call and state change to the Homebridge log |

### Manual config.json

If you prefer to edit `config.json` directly:

```json
{
  "platforms": [
    {
      "platform": "VolvoXC90",
      "name": "Volvo XC90",
      "username": "your-email@example.com",
      "password": "your-password",
      "vccApiKey": "your-vcc-api-key",
      "vin": "YV1XXXXXXXXX00000",
      "engineStartDuration": 15,
      "pollInterval": 30,
      "debug": false
    }
  ]
}
```

---

## HomeKit Accessories

Once configured, five accessories appear in the Home app:

### Volvo Lock
A standard **Lock Mechanism** accessory. Tap to lock or unlock. State is polled from the API and reflects the real lock state of the car.

### Volvo Climate
A **Switch** accessory. Turn on to start cabin pre-conditioning (heating or cooling depending on outside temperature). Turn off to stop it. Useful in automations — e.g. start climate 20 minutes before your calendar event.

### Volvo Engine
A **Switch** accessory. Turn on to start the engine remotely for the configured duration (max 15 minutes, enforced by the Volvo API). The engine stops automatically when the timer expires, or you can turn the switch off early.

### Volvo Doors
Six **Contact Sensor** accessories — one for each opening:
- Front Left Door
- Front Right Door
- Rear Left Door
- Rear Right Door
- Hood
- Tailgate

Each sensor shows **Open** or **Closed** and can trigger automations (e.g. notify if the tailgate is left open).

### Volvo Fuel
A **Battery Level** accessory showing your current fuel level as a percentage. A **low battery** alert fires in the Home app when fuel drops below 15%.

---

## Getting Your VCC API Key

1. Go to [developer.volvocars.com](https://developer.volvocars.com) and sign in with your Volvo ID
2. Click **Your API Applications → Create application**
3. Name it (e.g. `homebridge`) and submit
4. Copy the **VCC API Key — Primary** value
5. Paste it into the plugin settings

> The Secondary key is a rotation spare. Leave it unused until you need to rotate credentials.

---

## Finding Your VIN

Your VIN is a 17-character code. You can find it:

- In the **Volvo Cars app** → tap your car → **Vehicle details**
- On the dashboard, visible through the windscreen at the base of the driver's side
- On your vehicle registration document

---

## Debug Mode

Enable **Debug logging** in the plugin settings (under the **Advanced** section) to log every API request, response, and state change to the Homebridge log. This is useful for initial setup and troubleshooting.

Example debug output:
```
[DEBUG] Plugin v0.3.0 loaded — VIN: YV1XXXXXXXXXXXXX, poll: 30s
[DEBUG] Authenticating as your@email.com
[DEBUG] Token acquired, expires in 1800s
[DEBUG] → GET https://api.volvocars.com/connected-vehicle/v2/vehicles/YV1XX.../doors
[DEBUG] ← 200 /connected-vehicle/v2/vehicles/YV1XX.../doors
[DEBUG] Doors result: locked=true, doors={"frontLeft":false,"frontRight":false,...}
[DEBUG] Lock poll complete: LOCKED
```

Disable debug once everything is working to keep your logs clean.

---

## Troubleshooting

**Plugin doesn't appear in the Home app after install**
Restart Homebridge and wait 30 seconds. Check the Homebridge log for errors.

**"Authentication failed" in the log**
- Confirm your Volvo ID email and password are correct (same credentials as the Volvo Cars app)
- The Volvo API may require an OTP step — check the log for the specific error response with debug enabled

**Accessories show "No Response" in Home**
- Enable debug and check the log for API errors
- Confirm the Volvo Cars app can control your car — if the app is broken, the plugin cannot work either
- Check that your VCC API Key and VIN are entered correctly

**Lock/Unlock not working**
Confirm your Volvo On Call subscription is active. Lock and unlock commands require an active subscription.

**Fuel level always shows 100%**
Your VIN may not support the engine/fuel endpoint. Check the Homebridge log on startup for the **Supported commands** line — it lists what your car actually exposes.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## Built by Codzelerate

This plugin is developed and maintained by [**Codzelerate**](https://www.codzelerate.com?utm_source=github&utm_medium=plugin&utm_campaign=homebridge-volvo-xc90) — a software development studio focused on smart home automation, IoT integrations, and Apple platform development.

For questions, bug reports, or feature requests, please [open an issue](https://github.com/Codzelerate/homebridge-volvo-xc90/issues) on GitHub.

---

## License

MIT © [Codzelerate](https://www.codzelerate.com?utm_source=github&utm_medium=plugin&utm_campaign=homebridge-volvo-xc90)
