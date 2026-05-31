# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
