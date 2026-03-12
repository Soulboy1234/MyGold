# V4.3.2

Updated: `2026-03-12 13:35:00 +08:00`

## Changes

- Switched `runAgentOnce(...)` to spawn a fresh Node child process for each agent run, which avoids long-lived module accumulation in the daemon process.
- Added stricter dashboard response headers:
  - `Content-Security-Policy`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Cross-Origin-Resource-Policy`
  - existing `X-Content-Type-Options`
- Archived the root `tmp` strategy experiment outputs into the version archive so the live project root stays clean.
- Updated package metadata and README to reflect `4.3.2`.

## Validation

- `node --check`
  - `shared/runtime/start-dashboard-server.mjs`
  - `shared/runtime/agent-control.mjs`
  - `public/app.js`
- `node shared/tools/validate-agents.mjs`
