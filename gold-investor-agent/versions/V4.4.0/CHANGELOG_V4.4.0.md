# V4.4.0

## Summary

- Added a per-agent `重置资产` action to the formal dashboard selector cards.
- Protected the reset flow with a browser confirmation step and server-side pre-reset safety backups.
- Revalidated the live formal runtime after a controlled reset test and restore cycle.

## Dashboard

- `public/dashboard-render.js`
  - Added a reset button beside the existing start/stop action in each selector card.
- `public/app.js`
  - Added a confirmation dialog before a reset request is sent.
- `public/styles.css`
  - Tightened the selector action layout so the new button does not make cards unnecessarily tall.

## Runtime

- `shared/runtime/start-dashboard-server.mjs`
  - Added `POST /api/agents/reset` for formal per-agent reset actions.
- `shared/runtime/agent-control.mjs`
  - Added the reset implementation used by the dashboard.
  - Refreshes dashboard output after reset so the UI immediately matches the reset portfolio.
  - Creates an automatic safety backup before resetting any agent state files.

## Verification

- `node --check` passed for the updated frontend and runtime entrypoints.
- A controlled reset test was executed against `Agent5`, verified through the live API, then restored from backup.
- `shared/tools/validate-agents.mjs` passed for all five formal agents after restore.
- `http://127.0.0.1:3080/api/agents` returned `200` during final verification.
