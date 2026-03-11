# MyGold

MyGold is a packaged gold investing workspace built around three coordinated projects:

- `gold-monitor`: fetches gold, FX, and macro market data
- `gold-dashboard`: visualizes monitored market data
- `gold-investor-agent`: runs virtual gold trading agents and exposes an agent dashboard
- `gold-task-suite`: unified installer, environment controller, launcher, and version manifest

This repository is prepared for GitHub sharing. Runtime outputs, local state, databases, backups, and historical source snapshots are excluded from version control.

## Repository Structure

```text
.
├─ gold-monitor
├─ gold-dashboard
├─ gold-investor-agent
└─ gold-task-suite
```

Key files:

- `gold-task-suite/manifest.json`: unified environment and version manifest
- `gold-task-suite/install.cmd`: install environment only
- `gold-task-suite/install-and-run.cmd`: one-click install and start
- `gold-task-suite/start-all.cmd`: start all services
- `gold-task-suite/stop-all.cmd`: stop all services
- `gold-task-suite/open-all-panels.cmd`: open all dashboards

## Managed Projects

Current package set declared by `gold-task-suite`:

- `gold-monitor`: `package 1.1.0`, `snapshot V1.1.0`
- `gold-dashboard`: `package 1.0.0`, `snapshot V1.0.0`
- `gold-investor-agent`: `package 4.2.0`, `snapshot V4.2.0`

## Runtime Environment

- OS: Windows 10/11 x64
- PowerShell: 5.1 or above
- Node.js: 22.0.0 or above
- Recommended Node.js: 24.14.0
- Network access: required for market data acquisition

Default local ports:

- `gold-dashboard`: `http://127.0.0.1:3099`
- `gold-investor-agent`: `http://127.0.0.1:3080`

## Quick Start

If you copy the whole workspace to another Windows computer:

```powershell
cd .\gold-task-suite
.\install-and-run.cmd
```

If you only want to install the environment first:

```powershell
cd .\gold-task-suite
.\install.cmd
```

Open all panels:

```powershell
cd .\gold-task-suite
.\open-all-panels.cmd
```

## Version Control Policy

This repository keeps:

- current runnable source code
- necessary `README`, `CHANGELOG`, and `version.json`
- packaged installer and environment control scripts

This repository does not keep:

- `out/` runtime outputs
- `state/` local state
- local databases
- install machine state
- backup folders
- full source copies under `versions/.../snapshot/`

## Update Workflow

For future version updates, use the fixed workflow documented here:

- [VERSION_UPDATE_WORKFLOW.md](/D:/codex/docs/VERSION_UPDATE_WORKFLOW.md)

In short:

1. Update child project code and version files.
2. Sync versions in `gold-task-suite`.
3. Verify only safe files are staged.
4. Commit locally.
5. Push to GitHub.

## License

This repository currently uses the MIT License. See [LICENSE](/D:/codex/LICENSE).
