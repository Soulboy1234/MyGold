# V4.1.1

更新时间：2026-03-10 22:12:30 +08:00

## 本版变更

- 对当前 live 代码做了一轮完整审计，重点检查了共享运行时、Agent 目录发现、版本工具链和多 Agent 执行路径。
- 将动态 `import()` 的文件 URL 生成从手写字符串改为 Node 官方的 `pathToFileURL`，提升中文路径和特殊字符路径下的稳定性。
- 收紧了共享工具里的 Agent 目录发现逻辑：现在只有存在 `agent.json` 的目录才会被识别为 Agent，避免把 `backups` 或未来新增的辅助目录误识别进去。
- 在不改动策略口径和现有功能的前提下，保留了当前多 Agent 运行、手动交易、挂单、备份和校验链路。

## 重点检查结果

- 共享运行时检查：
  - `shared/runtime/resolve-agent.mjs`：通过
  - `shared/runtime/agent-control.mjs`：通过
  - `shared/runtime/start-dashboard-server.mjs`：通过
- 共享工具检查：
  - `shared/tools/agent-state-utils.mjs`：通过
  - `shared/tools/validate-agents.mjs`：通过
  - `shared/tools/run-all-agents-once.mjs`：通过
- 前端核心检查：
  - `public/app.js`：通过

## 当前 Agent 状态

- `Agent1-基础`：现金 `55153.35`，黄金 `39.3134` 克，权益 `100086.99`
- `Agent2-短线选手`：现金 `86192.04`，黄金 `12.2241` 克，权益 `100163.70`
- `Agent3-长线选手`：现金 `80129.80`，黄金 `17.4523` 克，权益 `100077.08`
- `Agent4-定投选手`：现金 `99000.00`，黄金 `0.8756` 克，权益 `100000.78`
- `Agent5-鬼才本人`：现金 `90000.00`，黄金 `8.6960` 克，权益 `99939.18`

## 验证

- `node --check` 已通过：
  - `shared/runtime/resolve-agent.mjs`
  - `shared/runtime/agent-control.mjs`
  - `shared/runtime/start-dashboard-server.mjs`
  - `shared/tools/agent-state-utils.mjs`
  - `public/app.js`
- `shared/tools/validate-agents.mjs`：通过
- `shared/tools/run-all-agents-once.mjs`：通过
