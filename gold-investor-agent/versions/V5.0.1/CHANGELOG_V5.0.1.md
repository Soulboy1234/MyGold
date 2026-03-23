# V5.0.1

## Summary

- Hardened the formal dashboard after the V5.0.0 strategy refresh.
- Removed write-token leakage from the public registry payload.
- Added safer fallback behavior when shared dashboard chart databases are missing.

## Runtime

- `shared/runtime/start-dashboard-server.mjs`
  - Stopped returning the runtime write token from `/api/agents`.
  - Accepts same-origin browser mutation requests without requiring the leaked token path.
  - Returns empty shared chart series when the dashboard databases are not present yet.
- `public/app.js`
  - Stopped depending on a server-exposed write token for dashboard mutations.

## Verification

- `node --check shared/runtime/start-dashboard-server.mjs` passed.
- `node --check public/app.js` passed.
- Smoke testing confirmed `/api/agents` no longer exposes `writeToken`.
