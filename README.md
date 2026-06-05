# homebridge-volvo-xc90

[![npm version](https://img.shields.io/npm/v/homebridge-volvo-xc90)](https://www.npmjs.com/package/homebridge-volvo-xc90)
[![npm downloads](https://img.shields.io/npm/dw/homebridge-volvo-xc90)](https://www.npmjs.com/package/homebridge-volvo-xc90)
[![GitHub release](https://img.shields.io/github/v/release/Codzelerate/homebridge-volvo-xc90)](https://github.com/Codzelerate/homebridge-volvo-xc90/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Homebridge](https://homebridge.io) plugin that integrates your **Volvo XC90 2016** (Sensus) with Apple HomeKit via the official [Volvo Connected Vehicle API v2](https://developer.volvocars.com/apis/connected-vehicle/v2/overview/) and [Energy API v2](https://developer.volvocars.com/apis/energy/v2/overview/).

Control and monitor your car directly from the Apple Home app and Siri — lock/unlock, climate pre-conditioning, honk and flash, door and window sensors, fuel level, EV battery, km-to-empty range, diagnostics, and more (T8 PHEV).

<p align="center">
  <img src="https://raw.githubusercontent.com/Codzelerate/homebridge-volvo-xc90/main/docs/images/home-view.png" alt="Volvo room in the Apple Home app showing lock, climate, remote start, honk and flash controls" width="320">
</p>

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
- [Finding your home coordinates](#car-at-home)
- [Getting your VCC API Key](#getting-your-vcc-api-key)
- [Finding your VIN](#finding-your-vin)
- [Debug mode](#debug-mode)
- [Troubleshooting](#troubleshooting)
- [Known limitations & roadmap](#known-limitations--roadmap)
- [Privacy & security](#privacy--security)
- [Disclaimer](#disclaimer)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [Built by Codzelerate](#built-by-codzelerate)

---

## Features

| Tile | HomeKit type | What it does |
|---|---|---|
| **Volvo Lock** | Lock Mechanism | Lock and unlock your car |
| **Volvo Controls** | Switch (up to 5) | Climate, Honk and Flash, Honk only, Flash only, Refresh — all in one tile |
| **Volvo Doors** | Contact Sensors | Summary tile + individual sensors for all 6 openings |
| **Volvo Windows** | Contact Sensors | Summary tile + individual sensors for all 4 windows and sunroof |
| **Volvo Energy** | Battery + Humidity + Contact | EV battery with charging state, EV charge %, fuel level %, and charger unplugged alert |
| **EV Range km** | Temperature Sensor | Kilometres remaining on EV battery — standalone tile or inside Energy tile |
| **Tank Range km** | Light Sensor | Kilometres remaining on petrol tank — standalone tile or inside Energy tile |
| **Volvo Diagnostics** | Contact + Leak Sensors | Summary alert tile (**faults only** — oil, coolant, brake fluid, washer fluid, tyres) + Service Due as a separate independent sensor |
| **Car at Home** | Occupancy Sensor | Occupied when car is within configured home radius, Not Occupied when away |
| **Left Open** | Contact Sensor | Alerts when car is locked but a door, window, sunroof, hood, or tailgate is still open. Sensor name updates to describe exactly what was left open. |

All accessories update on a configurable poll interval (default: 30 minutes) and reflect the latest state from the Volvo backend.

<p align="center">
  <img src="https://raw.githubusercontent.com/Codzelerate/homebridge-volvo-xc90/main/docs/images/sensors.png" alt="Door, window, tyre, charger, service due, and left open contact sensors in the Home app" width="320">
</p>

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

v1.3.0 adds **OAuth authentication** using your own Volvo Developer app credentials. OAuth is recommended — it is the only path that supports Remote Start and is fully compliant with Volvo's API terms. The legacy OTP flow continues to work but will be removed in v2.0.0.

### OAuth setup (recommended)

**Prerequisites:** a free developer account at [developer.volvocars.com](https://developer.volvocars.com).

1. Sign in to the Volvo Developer Portal and go to **Your API Applications → Create application**
2. Name it (e.g. `homebridge`), select all the scopes you want (include `conve:engine_start_stop` for Remote Start), and add a redirect URI — your GitHub profile URL works fine: `https://github.com/<your-username>`
3. **Publish** the app to receive your `client_id` and `client_secret`
4. Run the OAuth setup tool. The easiest way is via the **Homebridge UI terminal** (terminal icon in the top nav bar — no SSH needed):
   ```bash
   cd /var/lib/homebridge/node_modules/homebridge-volvo-xc90 && npm run oauth
   ```
5. The tool prints a Volvo authorisation URL — open it in your browser and sign in with your Volvo ID. Your browser will redirect to your registered URL (the page may be blank or 404 — that's expected). Copy the **full URL** from the address bar and paste it back into the tool.
6. The tool prints a ready-to-paste config block with `clientId`, `clientSecret`, `vccApiKey`, and `refreshToken`.
7. In Homebridge plugin settings, enter **Client ID**, **Client Secret**, and the **Refresh Token** from the output. **Remove any OTP credentials** if present.
8. Save and restart. Check the log for:
   ```
   [Volvo XC90] Authentication successful (OAuth)
   ```
9. **Remove the Refresh Token field** from plugin settings — the plugin rotates it automatically and stores it on disk. If the token ever expires, re-run `npm run oauth`.

---

### OTP setup (legacy — will be removed in v2.0.0)

The OTP flow uses Volvo's mobile-app credential and does not support Remote Start. It continues to work but migration to OAuth is recommended.

1. Go to **Plugins → homebridge-volvo-xc90 → Settings**
2. Under **Always Required**, enter your **VCC API Key** and **VIN**
3. Under **Authentication (OTP)**, enter your **Volvo ID email** and **password**
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
   ```
10. Return to plugin settings and **remove your email, password, and OTP** — only VCC API Key and VIN are needed going forward

---

### Re-authenticating (OAuth)

If the token chain expires (Volvo invalidates your session), re-run `npm run oauth` from the plugin directory to get a fresh refresh token and paste it back into plugin settings. The fallback is automatic — if the stored token fails, the plugin retries with the token in your config before giving up.

### Re-authenticating (OTP)

**Do not delete any files manually.** Use the built-in **Force re-authentication** toggle instead:

1. Go to **Plugins → homebridge-volvo-xc90 → Settings → Authentication (OTP)**
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

### Authentication — OAuth (recommended)

| Field | Description |
|---|---|
| **OAuth Client ID** | Client ID from your published app on developer.volvocars.com. When both Client ID and Client Secret are present the plugin uses OAuth instead of OTP. |
| **OAuth Client Secret** | Client secret from your published app. |
| **OAuth Refresh Token** | Initial refresh token from `npm run oauth`. Paste once — the plugin rotates and stores it automatically. Remove this field after the first successful restart. |

### Authentication — OTP (legacy, will be removed in v2.0.0)

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
| **Show Remote Start** | Off | Requires **OAuth** with the `conve:engine_start_stop` scope enabled on your Volvo Developer app. Has no effect under the OTP flow. |
| **Show Honk and Flash (combined)** | On | Single momentary switch that honks and flashes simultaneously |
| **Show Honk only** | Off | Separate momentary switch for horn only — enable if your VIN supports the `HONK` command (check `Supported commands:` in the log on startup) |
| **Show Flash only** | Off | Separate momentary switch for lights only — enable if your VIN supports the `FLASH` command |
| **Show Doors** | On | Contact sensor summary tile + 6 individual door/hood/tailgate sensors |
| **Show Windows** | On | Contact sensor summary tile + 5 individual window and sunroof sensors |
| **Show Fuel Level** | On | Petrol tank % inside the Energy tile |
| **Show EV Battery** | On | EV charge level, charging state, and charger plug status inside the Energy tile (T8 PHEV only) |
| **Show Range** | On | Km-to-empty for EV battery and petrol tank. Display style controlled by the Range view option below |
| **Range view** | On (standalone) | **On**: EV Range km and Tank Range km appear as their own standalone room tiles. **Off**: range values appear as sub-sensors inside the Energy tile detail view |
| **Show Left Open sensor** | Off | Alerts when locked with something left open. Enable notifications for this sensor in the Home app. |
| **Show Diagnostics** | On | Vehicle health panel (own config section). The most API-intensive feature — polls 4 endpoints per cycle. Turn off to roughly halve daily API usage. See [API usage](#api-usage). |

### Advanced

| Field | Default | Description |
|---|---|---|
| **Show Refresh switch** | Off | Adds a momentary Refresh switch to the Controls tile. Flipping it polls all accessories immediately — useful for checking charger status, door state, etc. without waiting for the next scheduled poll. |
| **Debug logging** | Off | Logs every API request, response, and state change. Disable once everything is working. |
| **Show Car at Home sensor** | Off | Occupancy sensor that shows Occupied when the car is within the home radius. Requires home coordinates below. |
| **Home latitude** | — | Decimal degrees latitude of your home. Right-click your home in Google Maps — the first number shown. |
| **Home longitude** | — | Decimal degrees longitude of your home. Right-click your home in Google Maps — the second number shown. |
| **Home radius (metres)** | 200 | How close the car must be to count as home. Increase if the car parks on the street. |

### Vehicle

| Field | Default | Description |
|---|---|---|
| **Fuel tank capacity (litres)** | 70 | Used to calculate fuel %. Standard XC90 2016 tank is 70 L. |
| **Engine start duration (minutes)** | 15 | How long the engine runs when started remotely (max 15 min, enforced by Volvo). |
| **Service interval (months)** | 12 | Used to calculate Service Due % in the Diagnostics tile. Default is 12 (annual). |
| **Service interval (km)** | 30000 | Used alongside the months interval — whichever gives the lower % is shown. Common Volvo intervals: 20,000 / 25,000 / 30,000 km. |

### Alerts

| Field | Default | Description |
|---|---|---|
| **EV low charge alert threshold (%)** | 20 | HomeKit sends a low-battery notification when EV charge drops below this level. |
| **Service alert threshold (%)** | 20 | Service Due sensor flips to Open when service life drops below this %. Default 20% — roughly 2–3 months before a 12-month service. |

### Manual config.json

```json
{
  "platforms": [
    {
      "platform": "VolvoXC90",
      "name": "Volvo XC90",
      "vccApiKey": "your-vcc-api-key",
      "vin": "YV1XXXXXXXXX00000",
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "showLock": true,
      "showClimate": true,
      "showEngine": false,
      "showHonkFlash": true,
      "showHonk": false,
      "showFlash": false,
      "showDoors": true,
      "showWindows": true,
      "showFuel": true,
      "showCharging": true,
      "showRange": true,
      "rangeStandalone": true,
      "showDiagnostics": true,
      "showLocation": false,
      "homeLatitude": 0.0,
      "homeLongitude": 0.0,
      "homeRadiusMeters": 200,
      "tankCapacityLiters": 70,
      "evLowChargeThreshold": 20,
      "engineStartDuration": 15,
      "pollInterval": 1800,
      "showRefresh": false,
      "debug": false
    }
  ]
}
```

> **Note:** `refreshToken` is only needed on first run — the plugin rotates and stores it automatically after that. Remove it from the config once the plugin has restarted successfully.

---

## HomeKit accessories

### Volvo Lock
A **Lock Mechanism** tile. Tap to lock or unlock. State is polled from the API and reflects the real lock state of the car.

---

### Volvo Controls
A single tile containing up to six momentary or toggle switches, all visible in the detail view:

<p align="center">
  <img src="https://raw.githubusercontent.com/Codzelerate/homebridge-volvo-xc90/main/docs/images/controls.png" alt="Climate, Remote Start, Flash, Honk, Honk and Flash, and Refresh switches" width="420">
</p>


- **Climate** — Start or stop cabin pre-conditioning (heating or cooling based on outside temperature). Stays on until you turn it off. Useful in automations, e.g. start climate 20 minutes before a calendar event.
- **Honk and Flash** — Momentary switch that honks the horn and flashes the lights together. Resets to off automatically after 1.5 seconds.
- **Honk** *(off by default)* — Momentary switch for horn only. Enable via `showHonk` after confirming your VIN supports the `HONK` command.
- **Flash** *(off by default)* — Momentary switch for lights only. Enable via `showFlash` after confirming your VIN supports the `FLASH` command.
- **Refresh** *(off by default)* — Momentary switch that immediately polls all accessories in parallel. Resets to off after 1 second. Enable via `showRefresh` in Advanced settings.

> **Remote Start requires OAuth.** It is hidden by default and only works when using OAuth credentials (`clientId` + `clientSecret`) with the `conve:engine_start_stop` scope enabled on your Volvo Developer app. Under the legacy OTP flow it returns 403 and cannot be made to work — switch to OAuth to unlock it. Enable the switch via **Controls → Show Remote Start** once OAuth is configured.

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
A single tile covering EV and fuel energy status. Tap the tile to see all sensors:

<p align="center">
  <img src="https://raw.githubusercontent.com/Codzelerate/homebridge-volvo-xc90/main/docs/images/energy.png" alt="EV Charge 100% and Fuel Level 96% tiles" width="420">
</p>


| Sensor | Type | What it shows |
|---|---|---|
| **EV Battery** | Battery | Charge % and charging state (Charging / Not Charging / Not Chargeable). Low-battery alert fires below the configured threshold (default 20%). |
| **EV Charge** | Humidity | Current EV charge % at a glance — same value as EV Battery, humidity-style display for quick reading |
| **Charger Unplugged** | Contact Sensor | Open (highlighted) = cable unplugged · Closed = plugged in |
| **Fuel Level** | Humidity | Petrol tank % (calculated from litres ÷ tank capacity) |

> **EV sensors are T8 PHEV only.** Disable **Show EV Battery** in plugin settings if your variant is petrol-only.

#### EV charging states

| State | Meaning |
|---|---|
| **Charging** | Cable connected and actively charging |
| **Not Charging** | Cable connected but charging is paused or complete |
| **Not Chargeable** | No cable connected |

---

### EV Range km and Tank Range km

Km-to-empty for the EV battery and petrol tank. These use intentionally different HomeKit sensor types to prevent the Home app from grouping them into a single averaged tile:

| Tile | Type | Unit shown | Range |
|---|---|---|---|
| **EV Range km** | Temperature Sensor | °C | 0–100 km (fits typical EV range) |
| **Tank Range km** | Light Sensor | lux | 0–100,000 km (fits any tank range) |

The unit labels (°C, lux) are a HomeKit limitation — no native "km" sensor type exists. The tile names make the meaning clear.

**Display mode** — controlled by **Range view** in plugin settings:
- **Standalone** (default): each appears as its own tile in the room view
- **Combined**: both appear as sub-sensors inside the Volvo Energy tile detail view

---

### Volvo Diagnostics
The **"All Systems OK"** summary tile shows **Open** only when an actual fault is detected — **Closed** when no faults are present. Tap the tile to see which specific sensor triggered.

**Service Due does not affect the summary.** A scheduled maintenance reminder and a system fault are different things. Keeping them separate means "All Systems OK: Open" always means something genuinely needs attention right now.

Fluid sensors use **Leak Sensor** (water-drop icon). Non-fluid faults use **Contact Sensor**.

<p align="center">
  <img src="https://raw.githubusercontent.com/Codzelerate/homebridge-volvo-xc90/main/docs/images/diagnostics.png" alt="Brake Fluid, Coolant Level, Oil Level, and Washer Fluid leak sensors" width="420">
</p>


| Sensor | Type | Triggers when | Affects summary |
|---|---|---|---|
| **Oil Level** | Leak Sensor | Low oil warning from engine | ✅ Yes |
| **Coolant Level** | Leak Sensor | Low coolant warning from engine | ✅ Yes |
| **Brake Fluid** | Leak Sensor | Low brake fluid level | ✅ Yes |
| **Washer Fluid** | Leak Sensor | Low windscreen washer fluid | ✅ Yes |
| **Service Due** | Contact Sensor | Below service alert threshold % or Volvo warning active | ❌ No — independent |
| **Tyre - Front Left** | Contact Sensor | TPMS warning | ✅ Yes |
| **Tyre - Front Right** | Contact Sensor | TPMS warning | ✅ Yes |
| **Tyre - Rear Left** | Contact Sensor | TPMS warning | ✅ Yes |
| **Tyre - Rear Right** | Contact Sensor | TPMS warning | ✅ Yes |

Enable notifications independently: **All Systems OK** for genuine faults, **Service Due** for scheduled maintenance. They are completely independent.

The Homebridge log prints the service interval on every poll:
```
[Volvo XC90] Diagnostics: All OK | Service in 1 month(s) / 21128 km (8% remaining)
```

---

### Car at Home
An **Occupancy Sensor** tile that shows **Occupied** when the car is within your configured home radius and **Not Occupied** when it is away. Useful for automations — for example, turn on the garage light when the car arrives home.

**Setup:**
1. Enable **Show Car at Home sensor** in plugin settings
2. Right-click your home in [Google Maps](https://maps.google.com) — the coordinates appear at the top of the context menu
3. Enter the first number as **Home latitude** and the second as **Home longitude**
4. Set **Home radius** (default 200 m — increase if your car regularly parks on the street)

**How it works:**
- The plugin polls the Volvo Location API on every poll interval
- Distance from home is calculated using the Haversine formula
- The sensor flips when the car crosses the radius boundary
- The Homebridge log prints coordinates, heading, and distance on every poll:

```
[Volvo XC90] Car is now AWAY (1243m from home)
[DEBUG] Location: 52.XXXXXX, 4.XXXXXX | heading 270° | 1243m from home | AWAY (radius 200m)
```

> **Note:** Volvo only updates the GPS position when the car is moving or the engine is on. If the car has been parked for a long time, the position reflects the last known location — which is accurate enough for home/away detection in practice.

---

### Left Open

A **Contact Sensor** that alerts when the car is **locked** but at least one door, window, sunroof, hood, or tailgate is still open. Designed to catch the "I forgot to close the sunroof" scenario before you walk too far away.

**How it works:**
- Polls every cycle (same interval as all other accessories)
- Evaluates: `locked = true` AND `any opening is open`
- When triggered: sensor name updates to describe exactly what is open — e.g. `"Volvo: Door · Sunroof"`
- The HomeKit notification reads: **"Volvo: Door · Sunroof is Open"** — no need to open any app
- Alert fires **once** when the condition first becomes true, not on every poll
- Clears automatically when the car is unlocked or all openings are closed

**Label format:**

| What's open | Sensor name |
|---|---|
| One door | `Volvo: Door` |
| Multiple doors | `Volvo: Doors` |
| One window | `Volvo: Window` |
| Multiple windows | `Volvo: Windows` |
| Sunroof | `Volvo: Sunroof` |
| Hood | `Volvo: Hood` |
| Tailgate | `Volvo: Tailgate` |
| Combination | `Volvo: Doors · Sunroof` |

**Setup:**
1. Enable **Show Left Open sensor** in plugin settings (Sensors section)
2. Restart Homebridge
3. In the Home app, find the **Left Open** sensor → tap Settings → enable **Notifications**

> Automations that reference this sensor work by UUID and remain functional even as the name changes dynamically. The automation display in the Home app will reflect the current name.

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
[DEBUG] EV poll: 100% | CONNECTED | DONE | AC | power: PROVIDING_POWER | ~0min to full | 28km range
[DEBUG] Charger: plugged in (CONNECTED)
[DEBUG] EV range: 28 km
[DEBUG] Tank range: 550 km
[DEBUG] Diagnostics: All OK | Service in 1 month(s) / 21151 km
[DEBUG] Location: 52.XXXXXX, 4.XXXXXX | heading 0° | 12m from home | AT HOME (radius 200m)
```

Disable debug once everything is working to keep your logs clean.

---

## API usage

> **Daily limit:** Volvo's developer platform currently allows **10,000 requests per day** per application. This figure is set by Volvo and is **subject to change** — always check the current quota on the [Volvo Developer Portal](https://developer.volvocars.com) before tuning a low poll interval. All numbers below assume this 10,000/day allowance.

Each poll cycle fetches the latest vehicle state across several endpoints. To stay well within the limit, the plugin:

- **Deduplicates shared endpoints** — accessories that need the same data (e.g. Doors and Left Open both need door/lock state; the two range tiles both need statistics) share a single API call per cycle rather than each making their own.
- **Uses an adaptive in-cycle cache** — the dedup window scales with your poll interval (10%, with a 5-second floor) and can never carry data across cycles, so every poll fetches fresh state.
- **Always fetches fresh on manual refresh** — the Refresh switch clears the cache first, so it never returns stale data.

### Choosing a poll interval

With **all features enabled**, each poll cycle makes **10 API calls**. Token refreshes add roughly 48 calls per day on top.

| Interval | Calls/day (all features) | % of 10,000 limit |
|---|---|---|
| 1800s (30 min, default) | ~530 | 5% |
| 300s (5 min) | ~2,930 | 29% |
| 150s | ~5,810 | 58% |
| 120s | ~7,250 | 72% |
| ~87s | ~9,980 | ~100% (hard floor — avoid) |

**Recommended minimum: 120s** with all features on, which leaves comfortable headroom for token refreshes, transient retries, and manual refreshes (each press = 10 calls).

### Saving calls by disabling Diagnostics (informational)

The **Diagnostics** category is by far the heaviest feature — it polls 4 separate endpoints (`/engine`, `/brakes`, `/diagnostics`, `/tyres`) every cycle. Turning it off (**Diagnostics → Show Diagnostics**) drops each cycle from 10 calls to 6:

| Interval | All features (10/cycle) | Diagnostics off (6/cycle) | Saved/day |
|---|---|---|---|
| 1800s (30 min) | ~530 | ~338 | ~192 |
| 300s (5 min) | ~2,930 | ~1,776 | ~1,154 |
| 150s | ~5,810 | ~3,506 | ~2,304 |
| 120s | ~7,250 | ~4,370 | ~2,880 |

With Diagnostics off, the safe minimum interval drops from ~120s to roughly **65s**. This is purely informational — keep Diagnostics on if you want vehicle health monitoring; the default 30-minute interval is well within budget either way.

> The Controls switches (Climate, Remote Start, Honk, Flash, Refresh) never poll — they only make an API call when you press them, so they cost nothing in the daily budget.

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

**Remote Start fails with "status code 403"**
Remote Start only works under **OAuth authentication** with the `conve:engine_start_stop` scope. If you are using the legacy OTP flow, Volvo refuses the permission at the token level — switch to OAuth (see [Authentication](#authentication)) and ensure your Volvo Developer app has `conve:engine_start_stop` enabled. The switch is hidden by default; enable it under **Controls → Show Remote Start** once OAuth is configured. Note: the command also returns 422 (Precondition Failed) when the car is plugged in and charging — this is expected Volvo API behaviour.

**Fuel level shows wrong percentage**
The API returns litres only. If your tank capacity differs from the default (70 L), set **Fuel tank capacity** in plugin settings to match your variant.

**EV Range shows values above 100°C**
The Temperature Sensor type used for EV Range is capped at 100°C. If your EV range somehow exceeds 100 km, the tile will show 100. In practice the XC90 T8 EV range is well within this limit.

**Diagnostics tile always shows Open**
Enable debug and check the log for `Diagnostics poll failed` — this usually means a scope or connectivity issue. All required scopes are included in the plugin's OAuth request so a fresh re-authentication should resolve it.

**Windows tile always shows Closed even though a window is open**
Window state is reported by the car's sensors — if the car has been stationary with ignition off for a long time, the API may return stale data until the next ignition cycle.

**Car at Home always shows Not Occupied**
- Confirm **homeLatitude** and **homeLongitude** are set correctly in plugin settings — if both are 0 the sensor will always show Not Occupied
- The location timestamp in the debug log shows when the car last reported its position — if stale, drive the car briefly to refresh the GPS fix
- Try increasing **Home radius** if the parked position is slightly offset from your home coordinates

---

## Known limitations & roadmap

Every plugin makes trade-offs. These are the ones we made on purpose — what the plugin deliberately *doesn't* do yet, why, and what it would take to change that. If a limitation below matters to you, the fastest way to move it up the list is to 👍 the matching [GitHub issue](https://github.com/Codzelerate/homebridge-volvo-xc90/issues) — these decisions are demand-driven.

### Data freshness — bounded by the car, not the plugin

Your XC90's modem only phones home to Volvo when the car is awake. Park it and the modem eventually goes dormant, and Volvo's servers keep serving the *last state they were told* — sometimes hours old. The plugin always fetches the freshest data Volvo has, but it cannot be fresher than what the car last reported. This is why a sensor can occasionally lag reality (the charger you just unplugged, the door you just closed) until the car next wakes up. There's no plugin-side fix; it's a property of how the vehicle reports. The manual **Refresh** switch pulls the latest Volvo *has*, but cannot wake a sleeping car.

### Everything is poll-based, not push

HomeKit updates on a schedule (your poll interval), not the instant something changes, because Volvo's API offers no push/webhook channel. Tighten the interval for snappier updates, or tap **Refresh** for an on-demand pull — but true real-time isn't on the table until Volvo offers it.

---

## Roadmap

Items planned for upcoming releases, in rough priority order.

### Charging time remaining sensor

The Volvo Energy API already returns an estimated time to full charge (e.g. `~150 min`). This will be exposed as a HomeKit sensor so you can see it at a glance without opening debug logs.

### Resilient polling with exponential backoff

Currently a failed poll logs a warning and waits silently until the next scheduled interval. A future release will add exponential backoff — retrying sooner after transient failures and backing off progressively under sustained errors, rather than just dropping the cycle.

### OAuth flow in the Homebridge UI

The current setup requires running a terminal command and copy-pasting a redirect URL. A future release will handle the entire OAuth dance inside the Homebridge settings page — no terminal, no copy-paste, just a button that opens the Volvo login and completes the flow automatically.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## Privacy & security

- **All communication with Volvo uses HTTPS.**
- **Your credentials and tokens are stored locally on your Homebridge server** in a plain-text file (`homebridge-volvo-xc90.json`) in the Homebridge storage directory. **They are not encrypted.** Because this file grants access to your vehicle, secure your Homebridge host and restrict access to it accordingly.
- **No data is sent to any third party.** The plugin communicates only with Volvo's official API endpoints and your local Apple HomeKit. Your VCC API Key, Volvo ID credentials, and OAuth tokens are used solely to authenticate with Volvo's API.
- The links to codzelerate.com in this README are documentation links only and transmit no vehicle or account data.

## Regional availability

This plugin currently authenticates against Volvo's **European (EU) Volvo ID** endpoints only. Accounts registered in other regions are not yet supported. (Contributions to add other regions are welcome.)

---

## Disclaimer

**This is an unofficial, community-built plugin.** It is **not affiliated with, endorsed by, sponsored by, or supported by Volvo Car Corporation** in any way.

"Volvo", "XC90", "Sensus", "Volvo On Call", and "Volvo ID" are trademarks of Volvo Car Corporation. They are used in this project **for identification and compatibility purposes only**, to describe what the plugin works with. No ownership of or affiliation with these marks is claimed or implied.

This software is provided **"as is", without warranty of any kind**, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement (see the [LICENSE](LICENSE)).

**Use at your own risk.** This plugin can perform real-world actions on a physical vehicle — including unlocking doors, starting climate pre-conditioning, and sounding the horn or flashing the lights. You are solely responsible for using these features safely, lawfully, and only on a vehicle you own or are authorised to control. The authors and contributors accept **no liability** for any damage, loss, injury, unauthorised access, missed alert, or other consequence arising from the use (or inability to use) this plugin.

Remote features depend on Volvo's services, your vehicle's connectivity, and an active Volvo On Call / Volvo Cars subscription. Availability, accuracy, and timeliness are **not guaranteed** (see [Known limitations & roadmap](#known-limitations--roadmap)).

**You are responsible for ensuring your use of this plugin complies with [Volvo's API Terms & Conditions](https://developer.volvocars.com/terms-and-conditions/apis-terms-and-conditions/) and all applicable laws in your jurisdiction.**

---

## Contributing

Contributions are welcome — bug fixes, new sensors, additional regions, or documentation improvements.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Make your changes and run `npm run build` to confirm it compiles
4. Commit with a clear message and open a pull request describing the change

For larger changes, please open an issue first to discuss the approach.

---

## Built by Codzelerate

This plugin is developed and maintained by [**Codzelerate**](https://www.codzelerate.com?utm_source=github&utm_medium=plugin&utm_campaign=homebridge-volvo-xc90) — a software development studio focused on smart home automation, IoT integrations, and Apple platform development.

For questions, bug reports, or feature requests, please [open an issue](https://github.com/Codzelerate/homebridge-volvo-xc90/issues) on GitHub.

---

## License

MIT © [Codzelerate](https://www.codzelerate.com?utm_source=github&utm_medium=plugin&utm_campaign=homebridge-volvo-xc90)

This license covers the plugin's own source code only. It does not grant any rights to Volvo's APIs, services, trademarks, or data, and does not represent any permission or licence from Volvo Car Corporation.
