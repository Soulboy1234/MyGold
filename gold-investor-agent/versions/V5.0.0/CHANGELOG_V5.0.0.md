# V5.0.0

## Summary

- Promoted the project to a new major version after the high-resolution data expansion and multi-agent strategy redesign work.
- Extended the free high-resolution gold price history back to 2012 and kept the formal monitoring and replay stacks compatible with the larger history window.
- Rebuilt `Agent2` from the steadier `Agent1` framework into a cleaner short-term/range-trading strategy with much less churn than the previous version.
- Reworked `Agent3` into a more distinct long-horizon value allocator with stronger band stability, clearer value accumulation behavior, and much lower trade count.
- Kept `Agent6` isolated in the lab while continuing to validate its single-scheme and router behaviors under strict no-lookahead replay.

## Strategy Changes

- `agents/agent1-基础/strategy-config.json`
  - Retained the recovered medium-term baseline used as the template for the new `Agent2` and `Agent3` redesigns.
- `agents/agent2-短线选手/agent.mjs`
  - Added `Agent1`-style score-band stabilization and current-ratio-aware target selection.
  - Raised the quality bar for tactical adds and trims so short-term trading is more selective.
- `agents/agent2-短线选手/strategy-config.json`
  - Tuned toward higher-quality short-term range participation with fewer low-edge trades.
- `agents/agent3-长线选手/agent.mjs`
  - Added a stabilized long-value band framework and stronger value-accumulation logic.
- `agents/agent3-长线选手/strategy-config.json`
  - Tuned toward a lower-frequency long-horizon profile while still participating more clearly when value zones appear.

## Research And Evaluation

- `lab/playground/agent6/runtime/strict-from-2014-eval.mjs`
  - Added filtering switches so strict historical replay can target only selected formal agents and optionally skip Agent6 work, making repeated optimization much faster.
- `lab/playground/agent6/runtime/compare-formal-agents-highres.mjs`
  - Continued serving as the long high-resolution replay harness for comparing the formal agents with Agent6 schemes.

## Verification

- `node --check` passed for the updated `Agent2`, `Agent3`, and strict replay tooling.
- `shared/tools/validate-agents.mjs` passed for all five formal agents.
- Strict historical replays from `2015` and `2016` were rerun with a benchmark buy-and-hold control group to verify the redesign direction.
