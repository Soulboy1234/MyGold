# Gold Investor Agent

Current version: `V4.2.2`

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

## Start

From this directory:

```powershell
.\start-agent.cmd
```

Dashboard address:

- `http://127.0.0.1:3080`

## Output Policy

Runtime outputs are written inside each agent's own `out` folder and are intentionally excluded from Git.

## Portability

This project is designed to resolve sibling projects by relative paths so the full workspace can be copied to another machine and still run.
