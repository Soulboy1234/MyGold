# Gold Monitor

`D:\codex\gold-monitor` 是黄金追踪守护程序。

## Start

隐藏启动并自动替换旧进程：

```powershell
cd D:\codex\gold-monitor
.\open-monitor.cmd
```

直接前台运行：

```powershell
& "C:\Program Files\nodejs\node.exe" D:\codex\gold-monitor\src\daemon.mjs
```

## Outputs

- 最新状态：`D:\codex\gold-monitor\state\latest.json`
- 高频历史：`D:\codex\gold-monitor\state\high_frequency_history.jsonl`
- 日频历史：`D:\codex\gold-monitor\state\daily_context_history.jsonl`
- 守护状态：`D:\codex\gold-monitor\state\daemon.json`
- 文本与 CSV 视图：`D:\codex\gold-monitor\out\`

## Stability

- 守护进程会记录 `lastSuccessAt`、`lastFailureAt`、`lastError`
- 主状态写入与视图写入分离，面板优先读取 `state` 下的稳定文件
- 即使 `out` 下的 CSV 被占用，`state` 历史仍会继续刷新
