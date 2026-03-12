# V4.3.3

## Summary

- Rechecked the live gold investor dashboard and all five formal agents after the recent UI adjustments.
- Improved daemon resilience by enforcing a hard timeout on per-agent child-process execution.
- Tightened dashboard write-endpoint validation so mutation requests must send `application/json`.

## Runtime

- `shared/runtime/agent-control.mjs`
  - Added a five-minute timeout for spawned agent runs.
  - Surface a clearer runtime error if an agent child process hangs.

## Security

- `shared/runtime/start-dashboard-server.mjs`
  - Mutation endpoints now reject non-JSON request bodies with `415 Unsupported Media Type`.
  - Existing write-token and same-origin protections remain in place.

## Verification

- `node --check` passed for the key runtime and frontend entrypoints.
- `shared/tools/validate-agents.mjs` passed for all formal agents.
- `http://127.0.0.1:3080/api/agents` returned `200` during final verification.
