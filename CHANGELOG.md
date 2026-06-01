# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.21] - 2026-06-01

### Fixed
- **Diagnostics crash on startup**: tyre sensor subtypes (`tyreFrontLeft` etc.) already existed in cache under old display names with em dashes. Service lookup now uses subtype matching instead of display name matching so renames never cause UUID conflicts — applied to Doors, Windows, and Diagnostics accessories.

## [1.0.20] - 2026-06-01

### Fixed
- **Crash on startup**: "Cannot add a Service with the same UUID and subtype 'honk'" — the v1.0.14 combined Honk and Flash switch was registered with subtype `honk`; v1.0.15 onwards uses `honk-flash` for combined and `honk` for horn-only, causing a UUID conflict on cached accessories. Migration code now removes the old service on first run.
- **HAP name warnings**: `&` and `—` are not valid in HAP `Name` characteristics. Renamed "Honk & Flash" → "Honk and Flash" and "Tyre — Front/Rear Left/Right" → "Tyre - Front/Rear Left/Right" throughout.

## [1.0.19] - 2026-06-01

### Added
- **Charger Connected** contact sensor on the Energy tile — Closed = cable plugged in, Open = no cable. Makes plug status visible at a glance independently of whether the car is actively charging.

## [1.0.18] - 2026-06-01

### Added
- **Charge Target (%)** sensor on the Energy tile — shows the charge level your car is set to stop at (e.g. 80% for battery health, 100% for long trips)
- `chargingType` (AC/DC) and `chargerPowerStatus` now included in debug log output

### Changed
- EV API response parsing now checks `status: "OK"` on each field before using its value, so unsupported properties (`chargingCurrentLimit`, `chargingPower`) are safely ignored rather than silently returning undefined

## [1.0.17] - 2026-06-01

### Added
- **Volvo Windows** tile — contact sensor summary (Open if any window is ajar) with individual sensors for Front Left Window, Front Right Window, Rear Left Window, Rear Right Window, and Sunroof
- **Volvo Diagnostics** tile — contact sensor summary (Open = any warning active) with individual sensors for Oil Level, Coolant Level, Brake Fluid, Washer Fluid, Service Due, and all four tyre warnings (Front Left/Right, Rear Left/Right). Startup log always shows service interval.
- **Tank Range (km)** and **EV Range (km)** sensors on the Energy tile — shows kilometres to empty for both the petrol tank and EV battery using the LightSensor service (value displayed in km, labelled clearly)

## [1.0.16] - 2026-06-01

### Fixed
- Climate and Remote Start switches no longer flip back to off immediately after being tapped — state is now set optimistically before the API call so HomeKit's verify-GET sees the correct value; reverts automatically if the API call actually fails

## [1.0.15] - 2026-06-01

### Added
- **Honk only** and **Flash only** switches — separate momentary controls alongside the existing combined Honk & Flash switch. Both are off by default; enable via `showHonk` / `showFlash` in plugin settings. Check the Homebridge log for `Supported commands:` on startup to confirm your VIN supports the separate `honk` and `flash` API commands before enabling.

### Changed
- `showHonkFlash` renamed to **Show Honk & Flash (combined)** in the plugin settings UI for clarity

## [1.0.14] - 2026-05-31

### Added
- **Honk & Flash** switch in the Controls tile — momentary action that honks the horn and flashes the lights; resets to off automatically after 1.5 s. Toggle with `showHonkFlash` (default on). No re-authentication required — the `conve:honk_flash` scope was already included.

## [1.0.13] - 2026-05-31

### Fixed
- Eliminated "Characteristic not in required or optional characteristic section for service Battery" warning — legacy Battery service cleanup now uses `getService(Service.Battery)` (reliable) instead of UUID string comparison; HumiditySensor lookup uses `getService(Service.HumiditySensor)` so it can never accidentally resolve to the old Battery service

## [1.0.12] - 2026-05-31

### Changed
- Fuel Level now uses a `HumiditySensor` service (showing fuel % as a humidity %) instead of a second `Battery` service — HomeKit renders Battery and HumiditySensor as separate rows in the same accessory detail view, making both EV Battery and Fuel Level visible in the single Energy tile

## [1.0.11] - 2026-05-31

### Fixed
- Controls tile switches now show correct names ("Climate", "Remote Start") instead of generic "Switch" / "Switch 2" — HomeKit requires `ConfiguredName` characteristic for per-service labelling in multi-service accessories

## [1.0.10] - 2026-05-31

### Fixed
- Controls tile no longer shows three duplicate "Volvo Climate" entries — the legacy unsubtyped Switch service left by the old ClimateAccessory is now removed on first run after upgrading

## [1.0.9] - 2026-05-31

### Changed
- Fuel Level and EV Battery are now combined into a single **Energy** tile (one accessory, two battery services visible in the detail view) — reduces clutter in the Home app
- Climate and Remote Start are now combined into a single **Controls** tile (one accessory, two switch services) — same concept
- Legacy `${vin}-engine` and `${vin}-charging` accessories are automatically removed on first run after upgrading

## [1.0.8] - 2026-05-31

## [1.0.7] - 2026-05-31

### Fixed
- Fuel Level and EV Battery services now have `ConfiguredName` set — fixes "Volvo Battery" / "Volvo Charged" auto-naming in the Home app
- Fuel Level `ChargingState` corrected to `NOT_CHARGEABLE` (was `NOT_CHARGING`) — petrol cannot be electrically charged

## [1.0.6] - 2026-05-31

### Fixed
- Door sensors now show their correct names in the Home app ("Front Left Door", "Rear Right Door", etc.) by setting the `ConfiguredName` characteristic — previously displayed as "Contact Sensor 1–7"

## [1.0.5] - 2026-05-31

### Added
- `evLowChargeThreshold` config option — percentage at which HomeKit fires a low-battery notification for the EV Battery tile (default 20%)

## [1.0.3] - 2026-05-31

### Fixed
- EV battery: correct OAuth scopes (`energy:battery_charge_level`, `energy:charging_connection_status`, `energy:charging_system_status`, `energy:electric_range`, `energy:estimated_charging_time`, `energy:recharge_status`) sourced from official ioBroker.volvo implementation
- EV battery: endpoint corrected to Energy API v2 (`/energy/v2/vehicles/{vin}/state`)
- EV battery: field names corrected to match actual API response (`chargerConnectionStatus`, `chargingStatus`, `estimatedChargingTimeTimeToTargetBatteryChargeLevel`)

## [1.0.2] - 2026-05-31

### Fixed
- Removed invalid `conve:recharge_status` OAuth scope — Volvo's auth server rejects it with a validation error, breaking OTP initiation entirely. The `/recharge-status` endpoint will be tested without a dedicated scope

## [1.0.1] - 2026-05-31

### Added
- `forceReauth` config toggle — clears the stored session on next restart, triggering a fresh OTP login without needing SSH access to delete the state file. Useful when re-authenticating to pick up new API scopes

## [1.0.0] - 2026-05-31

### Added
- **EV Battery accessory** (T8 PHEV) — shows charge level %, charging state (Charging / Plugged In / Unplugged), and a low-charge alert below 20%. Powered by the `/recharge-status` endpoint
- `showCharging` config toggle to hide the EV Battery tile on petrol-only variants
- `conve:recharge_status` added to OAuth scopes — **requires re-authentication** after upgrading (add credentials + OTP in plugin settings, save, restart)

## [0.9.0] - 2026-05-31

### Fixed
- Doors cache stampede: both LockAccessory and DoorsAccessory fired simultaneously on startup before the first request resolved, causing two `/doors` calls instead of one. Fixed with an in-flight promise guard — concurrent callers now join the same request
- Fuel level no longer shows `undefined%` — the `/fuel` endpoint returns litres only (`fuelAmount`), not a percentage. Fuel % is now calculated from litres ÷ tank capacity

### Added
- `tankCapacityLiters` config option (default `70` — the standard XC90 2016 tank). Set to your actual tank size if your variant differs
- Codzelerate attribution in README and `package.json` author field

## [0.8.0] - 2026-05-31

### Added
- `showLock`, `showClimate`, `showEngine`, `showDoors`, `showFuel` config options — toggle each tile on/off from the Homebridge UI; disabled accessories are cleanly unregistered from HomeKit
- Doors accessory: "All Doors" summary contact sensor added as the primary tile — shows "Open" if any opening is ajar, "Closed" only when everything is shut; individual door sensors still visible in the detail view

### Changed
- "Volvo Engine" renamed to "Remote Start" — clearer label for a naive Home app user
- "Volvo Fuel" renamed to "Fuel Level"

## [0.7.0] - 2026-05-31

### Changed
- Default `pollInterval` changed from 30 seconds to 1800 seconds (30 minutes) — keeps daily API usage around 96 requests/day vs. 8,640 with the old default (Volvo allows 10,000/day)
- `LockAccessory` and `DoorsAccessory` now share a single `getDoorsAndLocks()` API call per poll cycle via a 5-second platform-level cache — halves door/lock request count

## [0.6.2] - 2026-05-31

### Fixed
- Door field names corrected to match actual API response (`frontLeftDoor`, `frontRightDoor`, `rearLeftDoor`, `rearRightDoor`, `tailgate`) — doors were always showing closed
- Fuel level now fetched from `/fuel` endpoint instead of `/engine` (engine endpoint only returns warning flags, not fuel level)

## [0.6.1] - 2026-05-31

### Changed
- `username` and `password` are now optional — only needed for first-time setup or when the refresh token expires
- Config UI reorganised: "Always Required" section (VCC API Key + VIN) vs "First-time Setup" section (email, password, OTP)
- Clear log message guides user to add credentials back temporarily if session expires

## [0.6.0] - 2026-05-31

### Changed
- **Authentication completely rewritten** — replaces deprecated OAuth password grant with Volvo's current multi-step PingFederate OTP flow
- Correct OAuth client credentials, scopes (`conve:*`), and `X-XSRF-Header` now used
- Refresh token persisted to `homebridge-volvo-xc90.json` in Homebridge storage — re-auth only needed when token expires
- Auth flow state (flow ID + cookies) also persisted so OTP can be submitted after a Homebridge restart
- Accessories only start polling after successful authentication (no more "Not authenticated" flood)

### Added
- `otp` config field in Homebridge UI (Authentication section) for first-time setup
- Clear step-by-step instructions in log and UI header for the OTP flow

## [0.5.0] - 2026-05-31

### Fixed
- Peer dependency now supports Homebridge v2 (`^1.6.0 || ^2.0.0`) — resolves install failure on Homebridge 2.x

## [0.4.0] - 2026-05-31

### Added
- Comprehensive README with installation guide, configuration reference, accessory descriptions, VCC API Key setup, VIN instructions, debug mode docs, and troubleshooting section

## [0.3.0] - 2026-05-31

### Changed
- Renamed package from `@codzelerate/homebridge-volvo-xc90` to `homebridge-volvo-xc90` (unscoped) so the plugin appears in the Homebridge UI plugin search

## [0.2.0] - 2026-05-31

### Added
- CHANGELOG.md (Homebridge plugin registry requirement)
- Complete `AccessoryInformation` on all accessories: `Manufacturer`, `Model`, `SerialNumber`, `FirmwareRevision` (synced from package version), `HardwareRevision` (`2016`)
- Shared `setAccessoryInfo` helper — consistent child bridge metadata across all five accessories
- GitHub Actions release workflow: tag a `v*` → auto-creates GitHub Release with changelog notes and publishes to npm

### Changed
- Manufacturer value updated from `'Volvo'` to `'Volvo Cars'` (matches HomeKit convention)
- Each accessory now has a distinct model string (`XC90 — Lock`, `XC90 — Climate`, etc.) for easy identification in Home app and child bridge settings

## [0.1.0] - 2026-05-31

### Added
- Initial release
- **Lock accessory** — lock and unlock via Volvo Connected Vehicle API v2
- **Climate accessory** — start and stop pre-conditioning
- **Engine accessory** — remote engine start (configurable 1–15 min) and stop
- **Doors accessory** — contact sensors for all 6 openings (front/rear doors, hood, tailgate)
- **Fuel accessory** — fuel level shown as battery percentage with low-fuel alert below 15%
- Full Homebridge Config UI X support with grouped fieldsets
- **Debug toggle** — logs every API request, response, and state change when enabled
- Automatic OAuth token refresh before expiry
- `getSupportedCommands()` called on startup to log which commands your VIN supports
