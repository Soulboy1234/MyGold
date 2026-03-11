# Version Update Workflow

Use this workflow whenever the three child projects are updated and you want GitHub to reflect the latest safe version.

## Scope

This workflow applies to:

- `gold-monitor`
- `gold-dashboard`
- `gold-investor-agent`
- `gold-task-suite-win`

## Rule of Thumb

When you say "update version", the expected work is:

1. update the child project to the latest version
2. sync the version declaration inside `gold-task-suite-win`
3. verify Git only includes code and documentation safe for upload
4. commit and push

## Step 1: Update the Child Project

For each changed child project, update the files that define the new version, such as:

- `package.json`
- `versions/Vx.y.z/version.json`
- `README.md`
- `CHANGELOG_*.md`

If a new version folder is added under `versions/`, keep only:

- `README*`
- `CHANGELOG*`
- `version.json`

Do not upload full source snapshots under `versions/.../snapshot/`.

## Step 2: Sync Gold Task Suite

Update the unified package metadata in:

- `gold-task-suite-win/manifest.json`
- `gold-task-suite-win/README.md` if version references appear there

Sync at least:

- `packageVersion`
- `snapshotVersion`
- generated timestamp if needed

## Step 3: Verify Safe Upload Content

Before commit, check staged or candidate files:

```powershell
git status --short
git diff --cached --name-only
```

Confirm these are not included:

- `**/out/`
- `**/state/`
- `gold-dashboard/data/`
- `*.db`
- `*.db-shm`
- `*.db-wal`
- `gold-task-suite-win/install-state.json`
- `versions/.../snapshot/...`
- backups

If needed, review `.gitignore` first.

## Step 4: Commit

Stage and commit:

```powershell
git add .
git commit -m "Update project versions"
```

If the update is specific, prefer a more precise message, for example:

```powershell
git commit -m "Update gold-investor-agent to V4.2.3"
```

## Step 5: Push

Push to GitHub:

```powershell
git push
```

## Recommended Check After Push

After pushing, verify:

- GitHub repository page shows the expected latest commit
- root `README.md` still reads well
- no runtime output or local data appeared in the changed file list

## Safety Notes

- Do not commit local runtime outputs or agent operation records.
- Do not commit databases or machine-specific install state.
- Do not commit full historical source snapshots.
- Keep the repository focused on runnable code, packaging scripts, and version documentation.
