# Gold Dashboard

Current version: `V1.2.1`

`gold-dashboard` provides the local visualization panel for the gold monitoring workspace.

## Start

From this directory:

```powershell
node .\server.mjs
```

Or use the helper script:

```powershell
.\open-dashboard.cmd
```

Default address:

- `http://127.0.0.1:3099`

Bind behavior:

- On desktop environments, the dashboard defaults to `127.0.0.1`.
- On Synology DSM / NAS environments, it switches to `0.0.0.0` so other devices on the same private LAN can open it.
- In non-local bind modes, requests are limited to loopback and private-LAN client addresses.

## Data Sources

Primary monitor inputs are read from the sibling `gold-monitor` project:

- `..\gold-monitor\state\latest.json`
- `..\gold-monitor\state\high_frequency_history.jsonl`
- `..\gold-monitor\state\daily_context_history.jsonl`

Fallback files:

- `..\gold-monitor\out\high_frequency.csv`
- `..\gold-monitor\out\daily_context.csv`

Local history database:

- `.\data\history.db`

## Portability

This project is intended to run from a copied workspace folder without requiring a fixed drive letter. Use sibling-relative paths inside the same workspace.
