# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-02

### Added
- **Left Open sensor** — opt-in ContactSensor that alerts when the car is locked but a door, window, sunroof, hood, or tailgate is still open. Sensor name updates dynamically to describe what was left open — e.g. `"Volvo: Door · Sunroof"` — so the HomeKit notification is fully self-contained. Enable via **Sensors → Show Left Open sensor**, then enable notifications for the sensor in the Home app.
- **Service Due now uses FilterMaintenance** — replaced ContactSensor with a FilterMaintenance service showing % of service life remaining (`FilterLifeLevel`) and a "Change Filter" alert (`FilterChangeIndication`). Fires proactively when service life drops below a configurable threshold, before Volvo's own warning activates.
- **`serviceIntervalMonths`** config (default 12) — months between services, used to calculate service life %
- **`serviceIntervalKm`** config (default 30,000) — km between services; whichever metric gives the lower % is used (binding constraint)
- **`serviceAlertThreshold`** config (default 20%) — Change Filter alert fires when service life drops below this level

### Changed
- **Plugin settings reorganised into 9 collapsible sections** — Required (always open), Authentication (open), Controls, Sensors, Energy, Location, Vehicle, Alerts, Advanced (all collapsed). Reduces visual clutter significantly.
- Behaviour section split into **Vehicle** (tank capacity, engine duration, service intervals) and **Alerts** (EV low charge, service alert threshold)

## [1.1.6] - 2026-06-02

### Added
- **Refresh switch** — opt-in momentary switch inside the Controls tile that triggers an immediate poll of all accessories in parallel. Useful for checking the latest state (charger status, door state, etc.) without waiting for the next scheduled poll. Enable via **Advanced → Show Refresh switch** in plugin settings. Off by default.

### Changed
- Platform now maintains a poll registry — each accessory registers its `poll()` function on startup so `refreshAll()` can fire them all via `Promise.allSettled` (one failure does not block others).

## [1.1.5] - 2026-06-01

### Changed
- **Fluid diagnostic sensors now use LeakSensor** — Oil Level, Coolant Level, Brake Fluid, and Washer Fluid switch from ContactSensor to LeakSensor. The water-drop icon and "Leak Detected" state are semantically accurate for fluid warnings and visually distinct from non-fluid alerts. Service Due and tyre sensors remain as ContactSensor. Migration runs automatically on first restart — no manual action needed.

## [1.1.4] - 2026-06-01

### Changed
- Diagnostics summary log (`All OK | Service in X month(s) / Y km`) is now only printed at `info` level when the warning state **changes**. Routine polls log at `debug` level only. Eliminates log spam at short poll intervals.

## [1.1.3] - 2026-06-01

### Fixed
- **Persistent HAP Name warnings for Tyre sensors** — `ConfiguredName` and `Name` are separate HAP characteristics. We were only updating `ConfiguredName` after finding a service by subtype, so the `Name` characteristic in the cache kept its old em-dash value (`Tyre — Front Left`) and triggered the warning on every restart. Now explicitly sets both `Name` and `ConfiguredName` to the corrected label — cache is written correctly after the first restart with this version, warnings gone from the second restart onward.

## [1.1.2] - 2026-06-01

### Fixed
- **Charger Connected sensor stuck on Closed** — `onGet` was hardcoded to return CONTACT_DETECTED (plugged in) regardless of actual state. Added `chargerPluggedIn` instance property updated by poll; `onGet` now returns the last known state. Same pattern as the earlier fix applied to fuel level, EV charge, and range sensors.

## [1.1.1] - 2026-06-01

### Added
- **Car at Home** occupancy sensor — polls the Volvo Location API (`/location/v1/vehicles/{vin}/location`) and shows Occupied when the car is within the configured home radius, Not Occupied when away. Uses the Haversine formula for accurate distance calculation.
- `showLocation` config toggle (off by default)
- `homeLatitude`, `homeLongitude`, `homeRadiusMeters` (default 200m) config options

## [1.1.0] - 2026-06-01

This release consolidates a full day of feature development. No breaking changes — all existing config options continue to work. New accessories register automatically on first restart; old accessories migrate cleanly.

### Added
- **Volvo Windows** tile — contact sensor summary + individual sensors for front left/right, rear left/right, and sunroof
- **Volvo Diagnostics** tile — summary alert + individual sensors for oil level, coolant level, brake fluid, washer fluid, service due, and all 4 tyre TPMS warnings. Logs service interval on every poll.
- **EV Range km** standalone tile — km-to-empty for EV battery shown as a Temperature Sensor (°C). Standalone by default; can be placed inside the Energy tile via `rangeStandalone: false`
- **Tank Range km** standalone tile — km-to-empty for petrol tank shown as a Light Sensor (lux). Same standalone/combined toggle as EV Range
- **EV Charge** humidity sensor in the Energy tile — shows current EV charge % at a glance alongside Fuel Level, consistent visual style
- **Charger Connected** contact sensor in the Energy tile — Closed = cable plugged in, Open = no cable
- **Honk only** and **Flash only** switches in Controls — separate momentary switches for horn and lights independently (`showHonk`, `showFlash`, both off by default)
- `showRange` config toggle — show/hide both range tiles
- `rangeStandalone` config toggle — standalone room tiles (default) or sub-sensors inside Energy tile detail view
- `showWindows` config toggle
- `showDiagnostics` config toggle
- `showHonk` and `showFlash` config toggles

### Changed
- **Volvo Controls** tile: Climate and Remote Start merged into one tile. Honk and Flash (combined), Honk only, Flash only also available as switches in the same tile — up to 5 switches total
- **Volvo Energy** tile: Fuel Level and EV Battery merged into one tile. Added EV Charge % and Charger Connected sensors
- EV Range uses `TemperatureSensor` (not `LightSensor`) to prevent HomeKit from averaging it with Tank Range into a single grouped tile
- Climate and Remote Start switches now set state optimistically before the API call — prevents HomeKit's verify-GET from flipping the switch back during the request
- All contact sensor accessories now look up services by subtype rather than display name — resilient to label changes across versions

### Fixed
- Startup crash caused by UUID conflict when upgrading from v1.0.14 (legacy `honk` subtype for combined Honk and Flash)
- Service names containing `&` and `—` rejected by HAP name validation — renamed to `and` and `-`
- `onGet` handlers for range and charge level sensors returning hardcoded placeholder values instead of last polled data

## [1.0.28] - 2026-06-01

### Changed
- **EV Range** switched from LightSensor to TemperatureSensor (shows km as °C) — prevents HomeKit from grouping EV Range and Tank Range into a single averaged "Light" summary tile in the room view. Two different sensor types = two distinct tiles that can't be merged.
- Applies in both standalone tile mode and combined (inside Energy tile) mode.

## [1.0.27] - 2026-06-01

### Added
- `rangeStandalone` config option — **On** (default): EV Range and Tank Range appear as standalone room tiles; **Off**: range sensors shown as sub-services inside the Energy tile detail view. Switching either way migrates cleanly on restart.

## [1.0.26] - 2026-06-01

### Added
- **EV Range km** and **Tank Range km** are now standalone accessories registered with their own UUIDs — each appears as its own tile in the room view, exactly like any other sensor
- **EV Charge** HumiditySensor in the Energy tile — shows current EV charge % at a glance alongside Fuel Level, consistent visual style
- `showRange` config toggle (default on) to hide both range tiles if not wanted

### Changed
- Charge Limit removed from Energy tile — rarely changes and caused confusion with current charge level
- Range sensors removed from Energy tile detail view (they're now standalone tiles)

## [1.0.25] - 2026-06-01

### Changed
- "Charge Target" renamed to **Charge Limit** — clearer name for the configured charging ceiling (e.g. 80% for daily charging, 100% for long trips). Current charge level is already shown on the EV Battery tile.

## [1.0.24] - 2026-06-01

### Changed
- Range tile names shortened from `Tank Range (km)` → `Tank Range km` and `EV Range (km)` → `EV Range km` — removes truncation in the Home app tile label

## [1.0.23] - 2026-06-01

### Fixed
- Charge Target (%) onGet was hardcoded to 100 instead of returning the last polled value — now stored in an instance property and returned correctly
- Range sensors confirmed as LightSensor (shows value on tile) — CO2/AirQuality approach discarded as it hides the number behind Normal/Abnormal status

## [1.0.22] - 2026-06-01

### Fixed
- EV Range and Tank Range tiles were showing "1 lux" — the `onGet` handlers returned a hardcoded placeholder instead of the last polled value. Range values are now cached in instance properties and returned correctly by `onGet`.

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
