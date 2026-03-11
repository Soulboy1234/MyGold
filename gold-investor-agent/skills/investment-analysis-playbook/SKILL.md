---
name: investment-analysis-playbook
description: Build a cautious investment view for virtual trading projects. Use when Codex needs to turn market data, macro signals, moving averages, and cost assumptions into a position plan, a backtest summary, and explicit buy or sell conditions.
---

# Investment Analysis Playbook

Use long-horizon trend filters before taking short-horizon entries.

Read only the fields needed from the source data:

- Daily price in CNY per gram
- GLD and UUP daily closes
- The latest monitor advice and intraday state

Prefer a two-layer workflow:

1. Judge whether the medium-term backdrop is bullish, neutral, or bearish.
2. Use short-term data only to improve entry timing and position size.

Default guardrails:

- Keep transaction frequency low because sell costs are charged per gram.
- Prefer partial entries when long-term and short-term signals disagree.
- Record every assumption in the output, especially sample size limits.

Treat a strategy as acceptable only if the backtest remains profitable after applying the sell fee.
