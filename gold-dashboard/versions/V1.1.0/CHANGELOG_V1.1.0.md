# V1.1.0

## Summary

- Added adaptive dashboard bind behavior for desktop and Synology DSM environments.
- Limited dashboard access to loopback or private-LAN clients based on bind mode.
- Added basic hardening response headers for JSON and static asset responses.

## Server

- `server.mjs`
  - Defaults to `127.0.0.1` on desktop environments.
  - Switches to `0.0.0.0` automatically on Synology DSM / NAS environments.
  - Rejects requests outside loopback or private-LAN address ranges.
  - Adds `nosniff`, `Referrer-Policy`, and `Cross-Origin-Resource-Policy` headers.

## Documentation

- `README.md`
  - Clarified the bind behavior and private-LAN access boundary.

## Verification

- `node --check server.mjs` passed.
- Local dashboard API verification remained aligned with the existing runtime entrypoint.
