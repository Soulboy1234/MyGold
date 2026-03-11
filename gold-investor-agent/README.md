# Gold Investor Agent

`D:\codex\gold-investor-agent` 是一个独立的虚拟黄金投资项目。

它会读取本地已有的黄金追踪数据：
- `D:\codex\gold-monitor`
- `D:\codex\gold-dashboard`

但不会修改这两个上游任务里的文件。

## 目录结构

- `D:\codex\gold-investor-agent\agents`
  - 每个 Agent 一套独立资料、个体代码和输出数据
- `D:\codex\gold-investor-agent\shared`
  - 公共运行时、调度和服务层
- `D:\codex\gold-investor-agent\public`
  - 公共可视化前端
- `D:\codex\gold-investor-agent\src`
  - 默认入口包装层，默认启动 `agent1-基础`

## 当前 Agents

- `D:\codex\gold-investor-agent\agents\agent1-基础`
  - 当前默认 Agent
  - `agent.mjs`：当前基础版 Agent 个体逻辑
  - `out\`：当前基础版 Agent 的独立输出
- `D:\codex\gold-investor-agent\agents\agent2-短线选手`
  - 短线增强型 Agent
  - 已接入独立短线策略、独立回测和独立输出
- `D:\codex\gold-investor-agent\agents\agent3-长线选手`
  - 偏长线、低频调仓型 Agent
  - 以 `agent1-基础` 当前状态为模板复制，并切换到独立的长线低换手策略

## 公共层

- `D:\codex\gold-investor-agent\shared\runtime\resolve-agent.mjs`
  - 解析当前要运行的 Agent
- `D:\codex\gold-investor-agent\shared\runtime\run-daemon.mjs`
  - 公共守护进程逻辑
- `D:\codex\gold-investor-agent\shared\runtime\start-dashboard-server.mjs`
  - 公共 dashboard 服务逻辑

## 默认运行方式

```powershell
cd D:\codex\gold-investor-agent
& "C:\Program Files\nodejs\node.exe" src\agent.mjs
& "C:\Program Files\nodejs\node.exe" src\server.mjs
```

上面的默认入口会运行：
- `agent1-基础`

## 切换 Agent

如果后面实现了新的 Agent，可以通过环境变量切换：

```powershell
$env:GOLD_INVESTOR_AGENT="agent2-短线选手"
& "C:\Program Files\nodejs\node.exe" src\agent.mjs
```

dashboard 也会跟着读取该 Agent 的 `out\dashboard-data.json`。

## 多 Agent 面板

- `http://127.0.0.1:3080`
- 上方 `Agent 选择` 面板支持同时勾选多个 Agent
- 每个 Agent 都会显示名称、总净盈亏、运行状态以及启动/停止按钮

## 当前默认输出位置

- `D:\codex\gold-investor-agent\agents\agent1-基础\out\strategy-report.md`
- `D:\codex\gold-investor-agent\agents\agent1-基础\out\backtest-summary.json`
- `D:\codex\gold-investor-agent\agents\agent1-基础\out\portfolio.json`
- `D:\codex\gold-investor-agent\agents\agent1-基础\out\portfolio-history.json`
- `D:\codex\gold-investor-agent\agents\agent1-基础\out\decision-history.json`
- `D:\codex\gold-investor-agent\agents\agent1-基础\out\dashboard-data.json`
- `D:\codex\gold-investor-agent\agents\agent1-基础\out\virtual-trade.json`
- `D:\codex\gold-investor-agent\agents\agent1-基础\out\trade-log.json`

根目录原有的 `out` 已归档到 `D:\codex\gold-investor-agent\versions\V2.2.0\archive\legacy-root-out`，当前正式输出只看各 Agent 自己的 `out`。
