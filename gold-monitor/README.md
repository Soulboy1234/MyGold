# Gold Monitor

Current version: `V1.2.0`

`gold-monitor` is the market data monitor for the gold workspace.

## Start

From this directory:

```powershell
node .\src\daemon.mjs
```

Or use the helper script:

```powershell
.\start-monitor.cmd
```

## Outputs

Main runtime files:

- `.\state\latest.json`
- `.\state\high_frequency_history.jsonl`
- `.\state\daily_context_history.jsonl`
- `.\state\daemon.json`
- `.\out\`

## Scheduling

Use `install-task.ps1` to install the scheduled task for the current folder location. Avoid importing `task.xml` directly without replacing its placeholders first.
