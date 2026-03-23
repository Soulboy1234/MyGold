# V1.2.0

## Summary

- Expanded monitoring outputs with domestic gold ETF, SHFE, and SGE reference signals.
- Increased retained history capacity and added state-history backfill tooling.
- Restored backward-compatible monitor helper signatures after the data-stack refresh.

## Runtime

- `src/monitor.mjs`
  - Added domestic signal collection and richer CSV/state payloads.
  - Increased high-frequency and daily history retention caps.
  - Kept `buildStatus` compatible with the older call signature used by tests and helper code.
- `scripts/backfill-state-history.mjs`
  - Added a helper for rebuilding local monitor state history.

## Verification

- `node --test gold-monitor/test/monitor.test.mjs` passed.
- `node --check src/monitor.mjs` passed.
