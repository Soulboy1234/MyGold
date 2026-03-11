# Gold Dashboard V1.0.0

Version snapshot metadata for the first packaged dashboard release.

## Start

From this version folder you can still forward to the current project root scripts:

```powershell
.\open-dashboard.cmd
```

Or directly from the project root:

```powershell
cd ..\..
node .\server.mjs
```

## Data Sources

- `..\..\..\gold-monitor\state\latest.json`
- `..\..\..\gold-monitor\state\high_frequency_history.jsonl`
- `..\..\..\gold-monitor\state\daily_context_history.jsonl`
- `..\..\data\history.db`
