# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Releases are cut by the **Release** workflow (Actions → Release → Run workflow):
it tags `v<package.json version>` on `main` and publishes the matching section
below as the GitHub Release notes.

## [0.2.0] - 2026-11-11

### Added

- **Demo mode.** When the dashboard runs on sample data, the Daily header shows
  a "Demo data" badge and "Sample data — run locally to see your own usage"
  instead of the Live badge and local-logs lineage.
- **A year of sample usage.** `public/data/sample-usage.json` now holds 365 days
  of synthetic, anonymized aggregates, produced by a seeded generator
  (`npm run sample:generate`).
- **Fresh sample dates.** Sample data is shifted at load time so its latest day
  is today. The JSON on disk is never edited.
- **`npm run ingest:invoices`.** The script existed, but the command the UI
  pointed to did not.
- **Billing receipts row** in Settings → Data Sources, with live status and the
  reload command.

### Fixed

- Usage loading on hosts that answer missing files with `200` and `index.html`
  (e.g. `vite preview`): non-JSON responses are skipped, so the loader falls
  back to `sample-usage.json` instead of the built-in two-session fallback.
- Dead links to a "Settings → Connectors" section that does not exist.

### Removed

- Unused connector scaffolding (`defaultConnectors`, `ConnectorState`) for
  Drive and Resend integrations that had no scripts. Credentials are never
  entered in the browser; data reloads through the terminal commands.

### Known issues

- The Daily usage chart always draws one pair of bars per day, so on the 90-day
  and All ranges the bars are too thin to see.

## [0.1.0] - 2026-11-10

- Initial public release.

[0.2.0]: https://github.com/gusmagnago/ai-ops-dashboard/releases/tag/v0.2.0
[0.1.0]: https://github.com/gusmagnago/ai-ops-dashboard/commit/b7b1617
