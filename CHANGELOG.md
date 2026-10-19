# Changelog

## Unreleased

## 1.3.13 - 2026-10-19

### Fixed
- Detect unbranded iOS webviews when showing the external-browser notice, while excluding standalone apps and known regular browsers.
- Show link-copying help after failed or unsupported passkey authentication even when the embedded browser cannot be identified.

## 1.3.12 - 2026-10-19

### Added
- Warn users in known embedded browsers, including Messenger, and offer link copying with a manual fallback.

### Fixed
- Preserve group invitations in the URL through login and registration so they survive copying to an external browser.

### Changed
- Default mileage rate for the Bil category raised from 20 to 25 kr/mil to match Skatteverket's tax-free standard rate for private cars. Applies to new groups; existing groups keep their configured rate.

### Updated
- Updated dependencies, including Vite, Lucide React, react-easy-crop, dotenv, express-rate-limit, and the MCP SDK.

## 1.3.11 - 2026-10-06

### Added
- Link existing users to a group by name when creating it. Names without a unique match are added as claimable placeholders.

### Fixed
- Updated the frontend source-map dependency to fix source map handling.

### Updated
- Updated dependencies, including Vite, Vitest, dotenv, and Lucide React.

## 1.3.10 - 2026-10-02

### Added
- Added a debt Sankey chart and expense heatmaps to group statistics.

### Fixed
- Fixed the admin category description layout.

## 1.3.9 - 2026-10-02

### Added
- Added MCP tools for creating groups and adding members to groups.