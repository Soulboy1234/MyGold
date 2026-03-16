# V4.4.1

## Summary

- Added a shared Beijing-time weekend trading freeze for all five formal agents.
- Blocked all trading from Saturday `02:00` until Monday `09:00`.
- Preserved `Agent5` manual requests and pending orders during the blocked window instead of discarding them.

## Runtime

- `shared/runtime/trading-window.mjs`
  - Added the shared weekend trading-window helper used by all formal agents.
- `agents/agent1-基础/agent.mjs`
  - Added weekend blocking before the normal rebalance decision runs.
- `agents/agent2-短线选手/agent.mjs`
  - Added weekend blocking before short-swing rebalance logic runs.
- `agents/agent3-长线选手/agent.mjs`
  - Added weekend blocking before long-horizon rebalance logic runs.
- `agents/agent4-定投选手/agent.mjs`
  - Added weekend blocking before scheduled DCA and related sell logic runs.
- `agents/agent5-鬼才本人/agent.mjs`
  - Added weekend blocking before manual-order and pending-order execution.
  - Keeps the pending manual request and pending conditional orders in place until trading reopens.

## Verification

- Weekend-window samples confirmed the exact boundaries:
  - Saturday `01:59:59` open
  - Saturday `02:00:00` blocked
  - Monday `08:59:59` blocked
  - Monday `09:00:00` open
- `shared/tools/validate-agents.mjs` passed for all five formal agents after the change.
