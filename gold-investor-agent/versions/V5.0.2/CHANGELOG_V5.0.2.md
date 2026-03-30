# V5.0.2

## Summary

- Fixed dashboard write-header handling without re-exposing the real runtime token.

## Runtime

- `public/app.js`
  - Restored optional write-header assembly when a token is explicitly available.
- `shared/runtime/start-dashboard-server.mjs`
  - Keeps the public registry payload free of the real runtime write token.

## Verification

- `node --check public/app.js` passed.
- `node --check shared/runtime/start-dashboard-server.mjs` passed.
- Temporary dashboard smoke testing confirmed the public payload does not expose `writeToken`.
