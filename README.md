# homebridge-volvo-xc90

[![npm version](https://img.shields.io/npm/v/homebridge-volvo-xc90)](https://www.npmjs.com/package/homebridge-volvo-xc90)
[![npm downloads](https://img.shields.io/npm/dw/homebridge-volvo-xc90)](https://www.npmjs.com/package/homebridge-volvo-xc90)
[![GitHub release](https://img.shields.io/github/v/release/Codzelerate/homebridge-volvo-xc90)](https://github.com/Codzelerate/homebridge-volvo-xc90/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Homebridge](https://homebridge.io) plugin that integrates your **Volvo XC90 2016** (Sensus) with Apple HomeKit via the official [Volvo Connected Vehicle API v2](https://developer.volvocars.com/apis/connected-vehicle/v2/overview/) and [Energy API v2](https://developer.volvocars.com/apis/energy/v2/overview/).

Control and monitor your car directly from the Apple Home app and Siri — lock/unlock, climate pre-conditioning, remote engine start, honk & flash, door and window sensors, fuel level, EV battery, diagnostics, and more (T8 PHEV).

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Authentication](#authentication)
  - [First-time setup](#first-time-setup)
  - [Re-authenticating](#re-authenticating)
- [Configuration reference](#configuration-reference)
- [HomeKit accessories](#homekit-accessories)
- [Getting your VCC API Key](#getting-your-vcc-api-key)
- [Finding your VIN](#finding-your-vin)
- [Debug mode](#debug-mode)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)
- [Built by Codzelerate](#built-by-codzelerate)

---

## Features

| Tile | HomeKit type | What it does |
|---|---|---|
| **Volvo Lock** | Lock Mechanism | Lock and unlock your car |
| **Volvo Controls** | Switch (up to 5) | Climate, Honk and Flash, Honk only, Flash only, Remote Start — all in one tile |
| **Volvo Doors** | Contact Sensors | Summary tile + individual sensors for all 6 openings |
| **Volvo Windows** | Contact Sensors | Summary tile + individual sensors for all 4 windows and sunroof |
| **Volvo Energy** | Battery + Sensors | EV battery, charger plug status, charge target, EV range, fuel level, and tank range — all in one tile |
| **Volvo Diagnostics** | Contact Sensors | Summary alert tile + individual sensors for oil, coolant, brake fluid, washer fluid, service due, and all 4 tyres |

All accessories update on a configurable poll interval (default: 30 minutes) and reflect the latest state from the Volvo backend.

---

## Requirements

- Homebridge ≥ 1.6.0 or ≥ 2.0.0
- Node.js ≥ 18
- A **2016 Volvo XC90** (Sensus infotainment) with an active Volvo On Call subscription
- The **Volvo Cars app** working on your phone (confirms your car has a live cellular connection)
- A free developer account at [developer.volvocars.com](https://developer.volvocars.com) for a VCC API Key

> **Note:** The 2016 XC90 uses a built-in cellular modem. If the Volvo Cars app can no longer control your car remotely, the modem may need a 4G upgrade from a Volvo dealer before this plugin will work.

---

## Installation

### Via Homebridge UI (recommended)

1. Open the Homebridge UI
2. Go to the **Plugins** tab
3. Search for `homebridge-volvo-xc90`
4. Click **Install**
5. Restart Homebridge when prompted

### Via terminal

```bash
sudo npm install -g homebridge-volvo-xc90
sudo systemctl restart homebridge
```

---

## Authentication

This plugin uses Volvo's multi-step OTP authentication. On first setup, Volvo emails you a 6-digit code to verify your identity. Once authenticated, a refresh token is stored on disk — you only need to log in again if the token expires (typically after several months).

### First-time setup

1. Go to **Plugins → homebridge-volvo-xc90 → Settings**
2. Under **Always Required**, enter your **VCC API Key** and **VIN**
3. Under **First-time Setup**, enter your **Volvo ID email** and **password**
4. Save and restart Homebridge
5. Check the log — you will see:
   ```
   [Volvo XC90] No stored session. Sending OTP to your email...
   ```
6. Check your Volvo ID email for a 6-digit code
7. Go back to plugin settings, paste the code into the **One-Time Password (OTP)** field
8. Save and restart Homebridge
9. Check the log for:
   ```
   [Volvo XC90] Authentication successful (OTP)
   [Volvo XC90] You can now clear the OTP field in the plugin settings.
   ```
10. Return to plugin settings and **remove your email, password, and OTP** — only VCC API Key and VIN are needed going forward

Your session is now saved. Homebridge will automatically refresh it without any further action.

---

### Re-authenticating

You need to re-authenticate when:
- The refresh token has expired (Volvo invalidated your session)
- You installed a plugin update that added new API scopes

**Do not delete any files manually.** Use the built-in **Force re-authentication** toggle instead:

1. Go to **Plugins → homebridge-volvo-xc90 → Settings → First-time Setup**
2. Enter your **Volvo ID email** and **password**
3. Enable **Force re-authentication**
4. Save and restart Homebridge
5. Check the log — you will see:
   ```
   [Volvo XC90] Force re-auth enabled — clearing stored tokens.
   [Volvo XC90] No stored session. Sending OTP to your email...
   ```
6. Check your Volvo ID email for a 6-digit code
7. Paste the code into the **One-Time Password (OTP)** field
8. Save and restart Homebridge
9. Check the log for:
   ```
   [Volvo XC90] Authentication successful (OTP)
   ```
10. Return to settings and **disable Force re-authentication**, then **remove email, password, and OTP**
11. Save and restart one final time

---

## Configuration reference

### Always Required

| Field | Description |
|---|---|
| **VCC API Key** | Primary API key from [developer.volvocars.com](https://developer.volvocars.com) |
| **VIN** | Your 17-character Vehicle Identification Number |

### First-time Setup

| Field | Description |
|---|---|
| **Volvo ID (email)** | Your Volvo Cars account email. Remove after successful login. |
| **Volvo ID password** | Your Volvo Cars account password. Remove after successful login. |
| **One-Time Password (OTP)** | 6-digit code from the Volvo email. Remove after successful login. |
| **Force re-authentication** | Clears the stored session on next restart. Enable to trigger a fresh OTP login. Disable again once authenticated. |

### Accessories

| Field | Default | Description |
|---|---|---|
| **Show Lock** | On | Lock / unlock tile |
| **Show Climate Pre-condition** | On | Climate switch inside the Controls tile |
| **Show Remote Start** | On | Remote engine start switch inside the Controls tile |
| **Show Honk and Flash (combined)** | On | Single momentary switch that honks and flashes simultaneously |
| **Show Honk only** | Off | Separate momentary switch for horn only — enable if your VIN supports the `HONK` command (check the `Supported commands:` log line on startup) |
| **Show Flash only** | Off | Separate momentary switch for lights only — enable if your VIN supports the `FLASH` command |
| **Show Doors** | On | Contact sensor summary tile + 6 individual door/hood/tailgate sensors |
| **Show Windows** | On | Contact sensor summary tile + 5 individual window and sunroof sensors |
| **Show Fuel Level** | On | Petrol tank % inside the Energy tile |
| **Show EV Battery** | On | EV charge level, charging state, charger plug status, charge target, and EV range inside the Energy tile (T8 PHEV only) |
| **Show Diagnostics** | On | Alert tile that fires if any system warning is active, with individual sensors for each warning |

### Behaviour

| Field | Default | Description |
|---|---|---|
| **Fuel tank capacity (litres)** | 70 | Used to calculate fuel %. Standard XC90 2016 tank is 70 L. |
| **EV low charge alert threshold (%)** | 20 | HomeKit sends a low-battery notification when EV charge drops below this level. |
| **Engine start duration (minutes)** | 15 | How long the engine runs when started remotely (max 15 min, enforced by Volvo). |
| **Poll interval (seconds)** | 1800 | How often the plugin fetches vehicle state. Default is 30 minutes to stay within the 10,000 requests/day API limit. |

### Manual config.json

```json
{
  "platforms": [
    {
      "platform": "VolvoXC90",
      "name": "Volvo XC90",
      "vccApiKey": "your-vcc-api-key",
      "vin": "YV1XXXXXXXXX00000",
      "showLock": true,
      "showClimate": true,
      "showEngine": true,
      "showHonkFlash": true,
      "showHonk": false,
      "showFlash": false,
      "showDoors": true,
      "showWindows": true,
      "showFuel": true,
      "showCharging": true,
      "showDiagnostics": true,
      "tankCapacityLiters": 70,
      "evLowChargeThreshold": 20,
      "engineStartDuration": 15,
      "pollInterval": 1800,
      "debug": false
    }
  ]
}
```

---

## HomeKit accessories

### Volvo Lock
A **Lock Mechanism** tile. Tap to lock or unlock. State is polled from the API and reflects the real lock state of the car.

---

### Volvo Controls
A single tile containing up to five momentary or toggle switches, all visible in the detail view:

- **Climate** — Start or stop cabin pre-conditioning (heating or cooling based on outside temperature). Stays on until you turn it off. Useful in automations, e.g. start climate 20 minutes before a calendar event.
- **Honk and Flash** — Momentary switch that honks the horn and flashes the lights together. Resets to off automatically after 1.5 seconds.
- **Honk** *(off by default)* — Momentary switch for horn only. Enable via `showHonk` after confirming your VIN supports the `HONK` command.
- **Flash** *(off by default)* — Momentary switch for lights only. Enable via `showFlash` after confirming your VIN supports the `FLASH` command.
- **Remote Start** — Start the engine remotely for the configured duration (max 15 minutes). Turns off automatically when the timer expires, or switch it off early to stop immediately.

> To check which commands your VIN supports, look for the `Supported commands:` line in the Homebridge log on startup.

---

### Volvo Doors
A **Contact Sensor** tile with an at-a-glance summary: shows **Open** if any door, hood, or tailgate is ajar — **Closed** only when everything is shut. Tap the tile to see the state of all 6 individual sensors:
- Front Left Door
- Front Right Door
- Rear Left Door
- Rear Right Door
- Hood
- Tailgate

---

### Volvo Windows
A **Contact Sensor** tile with an at-a-glance summary: shows **Open** if any window or the sunroof is open — **Closed** only when everything is shut. Tap the tile to see all 5 individual sensors:
- Front Left Window
- Front Right Window
- Rear Left Window
- Rear Right Window
- Sunroof

---

### Volvo Energy
A single tile showing all energy and range data. Tap the tile to see every sensor:

| Sensor | Type | What it shows |
|---|---|---|
| **EV Battery** | Battery | Charge % and charging state (Charging / Not Charging / Not Chargeable) |
| **Charger Connected** | Contact Sensor | Closed = cable plugged in · Open = no cable |
| **Charge Target (%)** | Humidity | The % your car is set to charge to (e.g. 80% for battery health) |
| **EV Range (km)** | Light Sensor | Estimated kilometres remaining on EV battery |
| **Fuel Level** | Humidity | Petrol tank % (calculated from litres ÷ tank capacity) |
| **Tank Range (km)** | Light Sensor | Estimated kilometres remaining on petrol tank |

> **EV sensors are T8 PHEV only.** Disable **Show EV Battery** in plugin settings if your variant is petrol-only.

A low-battery notification fires when EV charge drops below the configured threshold (default 20%).

#### EV charging states

| State | Meaning |
|---|---|
| **Charging** | Cable connected and actively charging |
| **Not Charging** | Cable connected but charging is paused or complete |
| **Not Chargeable** | No cable connected |

---

### Volvo Diagnostics
A **Contact Sensor** tile that shows **Open** (alert) if any vehicle system has a warning — **Closed** when all systems are OK. Tap the tile to see which specific sensor triggered:

| Sensor | Triggers when |
|---|---|
| **Oil Level** | Low oil warning from engine |
| **Coolant Level** | Low coolant warning from engine |
| **Brake Fluid** | Low brake fluid level |
| **Washer Fluid** | Low windscreen washer fluid |
| **Service Due** | Volvo service warning is active |
| **Tyre — Front Left** | TPMS warning on front left tyre |
| **Tyre — Front Right** | TPMS warning on front right tyre |
| **Tyre — Rear Left** | TPMS warning on rear left tyre |
| **Tyre — Rear Right** | TPMS warning on rear right tyre |

The Homebridge log also prints the service interval on every poll:
```
Diagnostics: All OK | Service in 1 month(s) / 21151 km
```

---

## Getting your VCC API Key

1. Go to [developer.volvocars.com](https://developer.volvocars.com) and sign in with your Volvo ID
2. Click **Your API Applications → Create application**
3. Name it (e.g. `homebridge`) and submit
4. Copy the **VCC API Key — Primary** value
5. Paste it into the plugin settings

> The Secondary key is a rotation spare. Leave it unused until you need to rotate credentials.

---

## Finding your VIN

Your VIN is a 17-character code. You can find it:

- In the **Volvo Cars app** → tap your car → **Vehicle details**
- On the dashboard, visible through the windscreen at the base of the driver's side
- On your vehicle registration document

---

## Debug mode

Enable **Debug logging** in the plugin settings (Advanced section) to log every API request, response, and state change. Useful for initial setup and troubleshooting.

Example output:
```
[DEBUG] → GET https://api.volvocars.com/connected-vehicle/v2/vehicles/YV1XX.../doors
[DEBUG] ← 200 /connected-vehicle/v2/vehicles/YV1XX.../doors
[DEBUG] Doors: locked=true, doors={"frontLeft":false,...}
[DEBUG] → GET https://api.volvocars.com/energy/v2/vehicles/YV1XX.../state
[DEBUG] ← 200 /energy/v2/vehicles/YV1XX.../state
[DEBUG] EV poll: 100% (target 100%) | CONNECTED | DONE | AC | power: PROVIDING_POWER | ~0min to full | 28km range
[DEBUG] Charger: plugged in (CONNECTED)
[DEBUG] Tank range: 550 km
[DEBUG] EV range: 28 km
[DEBUG] Diagnostics: All OK | Service in 1 month(s) / 21151 km
```

Disable debug once everything is working to keep your logs clean.

---

## Troubleshooting

**Plugin doesn't appear in the Home app after install**
Open the Homebridge UI → **Child Bridges** tab → find Volvo XC90 → **Reset HomeKit Pairing**. A QR code will appear — scan it in the Home app.

**OTP email never arrives**
- Check your Volvo ID spam folder
- Confirm the email and password entered match your Volvo Cars app credentials
- Enable debug and check the log for any error during OTP initiation

**"Not authenticated" or accessories show "No Response"**
- Your refresh token has likely expired — follow the [Re-authenticating](#re-authenticating) steps above
- Confirm the Volvo Cars app can control your car — if the app is broken, the plugin cannot work either

**EV sensors show "No Response" or always 0%**
- These sensors require the T8 PHEV variant. If your car is petrol-only, disable **Show EV Battery** in plugin settings
- If you are on a T8, re-authenticate to ensure your token includes the Energy API scopes

**Honk and Flash / Honk / Flash does nothing**
- Check the `Supported commands:` line in the Homebridge log on startup — your VIN must list `HONK_AND_FLASH`, `HONK`, or `FLASH` respectively
- Ensure your Volvo On Call subscription is active

**Lock/Unlock not working**
Confirm your Volvo On Call subscription is active. Lock and unlock commands require an active subscription.

**Fuel level shows wrong percentage**
The API returns litres only. If your tank capacity differs from the default (70 L), set **Fuel tank capacity** in plugin settings to match your variant.

**Diagnostics tile always shows Open**
Enable debug and check the log for `Diagnostics poll failed` — this usually means a scope or connectivity issue. All required scopes are included in the plugin's OAuth request so a fresh re-authentication should resolve it.

**Windows tile always shows Closed even though a window is open**
Window state is reported by the car's sensors — if the car has been stationary with ignition off for a long time, the API may return stale data until the next ignition cycle.

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
