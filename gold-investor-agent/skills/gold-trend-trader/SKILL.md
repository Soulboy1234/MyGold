---
name: gold-trend-trader
description: Operate a virtual gold trading agent with RMB cash, per-gram sell fees, and data from the gold tracking task. Use when Codex needs to size a gold position, decide whether to add, hold, or reduce, and persist a portfolio snapshot and trade log.
---

# Gold Trend Trader

Read the latest gold monitor snapshot before placing a virtual trade.

Use this decision ladder:

1. Confirm the medium-term regime from daily moving averages and macro proxies.
2. Check whether the latest intraday advice confirms momentum or asks to wait.
3. Size the trade conservatively when medium-term is bullish but intraday confirmation is weak.

Portfolio rules:

- Keep some cash reserve unless both daily and intraday signals align.
- Express the position in grams and RMB cost basis.
- When marking to market, value open gold at `latest price - 4 RMB/gram` to reflect exit cost.

Outputs to keep current:

- Current portfolio snapshot
- Latest virtual order
- Backtest summary
- Human-readable rationale
