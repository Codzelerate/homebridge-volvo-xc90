# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
