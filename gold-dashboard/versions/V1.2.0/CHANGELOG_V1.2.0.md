# V1.2.0

## Summary

- Expanded the dashboard with domestic gold ETF, SHFE, SGE, and premium charts.
- Added free high-resolution history sync and rebuild tooling.
- Removed absolute local path leakage from the public dashboard API metadata.

## Runtime

- `server.mjs`
  - Added richer market fields to live/history payloads.
  - Sampled large history windows more carefully for browser performance.
  - Replaced absolute-path metadata with non-sensitive availability flags.
- `public/app.js`
  - Added domestic ETF, SHFE, SGE, and premium chart rendering.
- `scripts/sync-history.mjs`
- `scripts/sync-highres-history.mjs`
- `scripts/dukascopy-highres-backfill.mjs`
- `scripts/rebuild-highres-from-backfill.mjs`
  - Added and updated high-resolution history backfill tooling.

## Verification

- `node --check server.mjs` passed.
- `node --check public/app.js` passed.
- The dashboard API returned `200` in smoke testing with the sanitized metadata shape.
