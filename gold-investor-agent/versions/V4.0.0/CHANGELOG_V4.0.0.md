# V4.0.0

更新时间：2026-03-10 20:15:00 +08:00

## 本版变更

- 对 5 个 Agent 做了统一的运行与资产校验，确认组合权益、手续费、持仓成本和交易回放口径一致。
- 修正 `Agent5-鬼才本人` 的运行元数据，明确设为手动模式，不再自动参与守护进程轮询。
- 新增维护工具：
  - `shared/tools/validate-agents.mjs`
  - `shared/tools/backup-agent-states.mjs`
  - `shared/tools/reset-agent-states.mjs`
  - `shared/tools/run-all-agents-once.mjs`
- 运行时目录扫描增强：忽略 `agents/backups`，并只识别带 `agent.json` 的真实 Agent 目录。
- 将全部 Agent 的资产、持仓和交易历史重置为新的 100000 元初始资金基线，并重新按各自策略执行首轮测试。

## 备份与重置

- 重置前资产已归档到：
  - `agents/backups/2026-03-10_20-09-11_pre-v4-reset`
- 重置后当前首轮结果：
  - `Agent1-基础`：买入后现金 `45000`，黄金 `48.159` 克，权益 `99807.35`
  - `Agent2-短线选手`：买入后现金 `36000`，黄金 `56.0396` 克，权益 `99775.87`
  - `Agent3-长线选手`：买入后现金 `68000`，黄金 `28.0198` 克，权益 `99887.93`
  - `Agent4-定投选手`：买入后现金 `99000`，黄金 `0.8756` 克，权益 `99996.48`
  - `Agent5-鬼才本人`：保持 `100000` 元现金，未自动交易

## 验证结果

- `node --check` 已通过：
  - `shared/runtime/resolve-agent.mjs`
  - `shared/runtime/agent-control.mjs`
  - `shared/tools/agent-state-utils.mjs`
  - `shared/tools/validate-agents.mjs`
  - `shared/tools/backup-agent-states.mjs`
  - `shared/tools/reset-agent-states.mjs`
  - `shared/tools/run-all-agents-once.mjs`
- `validate-agents.mjs` 在重置前和重置后都已执行通过。
- `run-all-agents-once.mjs` 已执行完成，5 个 Agent 当前输出均可正常读取。
