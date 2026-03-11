# V4.1.2

更新时间：2026-03-10 22:43:30 +08:00

## 本版变更

- 修复了根目录空 `out` 目录残留问题：当前运行时会在读取 Agent 元数据和执行 Agent 前自动清理这个空目录，只删除空目录，不碰任何有效输出数据。
- 将 dashboard 的版本号接口改成实时读取 `package.json`，避免以后版本更新后面板标题仍显示旧版本。
- 复查了共享运行时、前端交易记录布局改动和多 Agent 执行链路，未发现新的计算错误或阻断性问题。

## 根目录 out 检查结果

- 本次排查时，根目录 `D:\\codex\\gold-investor-agent\\out` 是空目录。
- 在修正后重新执行：
  - `shared/tools/run-all-agents-once.mjs`
  - `shared/tools/validate-agents.mjs`
  之后，根目录 `out` 已不再存在。
- 这说明当前 live 链路不会再把这个空目录重新留下。

## 当前 Agent 状态

- `Agent1-基础`：现金 `45096.51`，黄金 `48.0429` 克，权益 `100179.62`
- `Agent2-短线选手`：现金 `68115.89`，黄金 `27.9766` 克，权益 `100192.18`
- `Agent3-长线选手`：现金 `68084.09`，黄金 `27.9082` 克，权益 `100081.96`
- `Agent4-定投选手`：现金 `99000.00`，黄金 `0.8756` 克，权益 `100003.91`
- `Agent5-鬼才本人`：现金 `90000.00`，黄金 `8.6960` 克，权益 `99970.31`

## 验证

- `node --check` 已通过：
  - `shared/runtime/agent-control.mjs`
  - `shared/runtime/start-dashboard-server.mjs`
  - `public/dashboard-render.js`
- `shared/tools/run-all-agents-once.mjs`：通过
- `shared/tools/validate-agents.mjs`：通过
