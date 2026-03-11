# Versions Layout

版本目录统一按下面的结构整理：

- `Vx.y.z/`
  - `version.json`
  - `config.json`
  - `CHANGELOG_*.md`
  - `snapshot/`
    - 该版本的正式代码与数据快照
  - `archive/`
    - 额外归档数据，仅在需要时存在

当前约定：

- `snapshot/` 是正式版本快照入口
- `archive/` 只放历史遗留输出或补充归档，不参与当前版本结构判断
