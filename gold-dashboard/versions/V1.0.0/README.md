# Gold Dashboard

Current version: `V1.0.0`

`D:\codex\gold-dashboard` 提供黄金追踪的本地可视化面板，并内置历史数据库。

## Version

- `V1.0.0`: 当前稳定基线版本。包含历史数据、高分辨率数据、实时监控拼接、交互缩放、状态面板和独立启停脚本。

## Start

隐藏启动并自动替换旧面板进程：

```powershell
cd D:\codex\gold-dashboard
.\open-dashboard.cmd
```

默认地址：`http://127.0.0.1:3099`

直接前台运行：

```powershell
& "C:\Program Files\nodejs\node.exe" D:\codex\gold-dashboard\server.mjs
```

## Data Sources

- 实时状态优先读取：
  - `D:\codex\gold-monitor\state\latest.json`
  - `D:\codex\gold-monitor\state\high_frequency_history.jsonl`
  - `D:\codex\gold-monitor\state\daily_context_history.jsonl`
- 兼容回退：
  - `D:\codex\gold-monitor\out\high_frequency.csv`
  - `D:\codex\gold-monitor\out\daily_context.csv`
- 历史数据库：
  - `D:\codex\gold-dashboard\data\history.db`

## Stability

- 面板服务读取失败时会优先回退到最近一次成功载入的缓存
- 面板会显示追踪进程状态、数据是否过旧、是否正在使用缓存
- 追踪和面板是两个独立 Node 进程，可以分别重启
