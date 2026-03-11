# Gold Investor Agent

Current version: `V4.3.1`

`gold-investor-agent` is the virtual gold investing project in this workspace.

## Workspace Dependencies

This project expects these sibling folders in the same workspace:

- `..\gold-monitor`
- `..\gold-dashboard`

## Structure

- `.\agents`: individual agent strategies
- `.\shared`: shared runtime and tools
- `.\public`: dashboard frontend assets
- `.\src`: entrypoints

## Strategy Files

- Automatic-strategy agents now support direct file-based parameter editing.
- Current editable strategy parameter files:
  - `.\agents\agent1-基础\strategy-config.json`
  - `.\agents\agent2-短线选手\strategy-config.json`
  - `.\agents\agent3-长线选手\strategy-config.json`
  - `.\agents\agent4-定投选手\strategy-config.json`
- `Agent5-鬼才本人` is manual-only, so it does not use an automatic strategy config file.
- These files are read on each agent run. Editing them will affect both:
  - historical backtest output
  - live decision output
- Recommended workflow after editing:
  1. Save the corresponding `strategy-config.json`
  2. Run the agent once, or wait for the daemon cycle
  3. Check that `out\backtest-summary.json` and current live output still look reasonable
- Only keys already present in the config files are supported as direct file-level parameters. Strategy text, scoring formulas, and execution code still live in each agent's `agent.mjs`.

## Start

From this directory:

```powershell
.\start-agent.cmd
```

Dashboard address:

- `http://127.0.0.1:3080`

## Dashboard Bind Mode

- On local desktop environments, the dashboard server defaults to `127.0.0.1` so it is only accessible from the same machine.
- On Synology DSM / NAS environments, the dashboard server automatically switches to `0.0.0.0` so other devices in the same LAN can open it without extra host configuration.
- Even in NAS mode, the built-in access guard only allows loopback and private-LAN client addresses by default, which reduces accidental public exposure risk.
- State-changing APIs such as manual trade, pending orders, and start/stop agent also require a runtime write token; any non-local bind mode additionally requires same-origin browser requests from the dashboard page itself.
- If you need a custom bind address, you can still override it explicitly with the `HOST` environment variable.

## Output Policy

Runtime outputs are written inside each agent's own `out` folder and are intentionally excluded from Git.

## Portability

This project is designed to resolve sibling projects by relative paths so the full workspace can be copied to another machine and still run.

## Strategy Validation Rule

- Any change to an agent's scoring model, thresholds, target-position tiers, or buy/sell rules must be validated with a full-history backtest before it is adopted in live mode.
- The default validation window uses all available daily history in `..\gold-dashboard\data\history.db`, currently starting from `2000-10-09` and ending at the latest available historical day.
- Optimization should preserve each agent's style while improving fee-aware return quality, reducing unnecessary trades, and avoiding purely mechanical churn.
