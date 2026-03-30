# Gold Task Suite for DSM

Current package version: `V1.5.1`

This folder provides DSM-oriented wrapper scripts for Synology Task Scheduler. It delegates to the Linux suite and gives you simple task entrypoints for install, start, stop, restart, and status checks.

## Files

- `dsm-install.sh`: install npm dependencies through the Linux suite
- `dsm-start.sh`: start all services through the Linux suite
- `dsm-stop.sh`: stop all services through the Linux suite
- `dsm-restart.sh`: restart all services through the Linux suite
- `dsm-status.sh`: print service status and access URLs

## Recommended DSM Tasks

- Install:

```bash
cd /path/to/MyGold/gold-task-suite-dsm && ./dsm-install.sh
```

- Start:

```bash
cd /path/to/MyGold/gold-task-suite-dsm && ./dsm-start.sh
```

- Stop:

```bash
cd /path/to/MyGold/gold-task-suite-dsm && ./dsm-stop.sh
```

- Restart:

```bash
cd /path/to/MyGold/gold-task-suite-dsm && ./dsm-restart.sh
```

- Status:

```bash
cd /path/to/MyGold/gold-task-suite-dsm && ./dsm-status.sh
```

## Notes

- This folder depends on `../gold-task-suite-linux`.
- Use DSM Task Scheduler to run these scripts instead of double-clicking them in File Station.
