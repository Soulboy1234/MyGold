# V1.2.1

## Summary

- Fixed live dashboard chart windows to use real time ranges instead of fixed row counts.

## Runtime

- `server.mjs`
  - Keeps the high-frequency chart focused on the most recent 30 days.
  - Keeps the daily chart focused on the most recent 365 days.
  - Falls back to a bounded row slice only when timestamp parsing is unavailable.

## Verification

- `node --check server.mjs` passed.
- Local dashboard API smoke testing returned `200`.
