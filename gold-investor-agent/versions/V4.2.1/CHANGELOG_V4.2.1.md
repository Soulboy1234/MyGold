# V4.2.1

更新时间：2026-03-11 07:55:00 +08:00

## 本版变更

- 审计了共享 runtime、前端入口和全部 5 个 Agent 的主程序，确认当前 live 链路没有新的语法错误或结构性校验失败。
- 修复了 `Agent5-鬼才本人` 的挂单判定 bug：之前只按“当前快照价格”判断挂单是否触发，导致两次轮询之间虽然曾经触价，但挂单仍可能漏掉。
- 现在 `Agent5` 会回看“上次处理快照到当前快照之间”的高频价格窗口，只要中间价格已经触达挂单条件，就会触发。
- 挂单成交价格也改成触发时那条快照的价格，不再用下一次轮询时的当前价顶替，结果更符合直觉。
- 保留了此前把 daemon 默认频率从 10 分钟改到 5 分钟的设置，进一步降低挂单漏判概率。

## 当前 Agent 状态

- `Agent1-基础`：现金 `44896.10`，黄金 `47.9818` 克，权益 `99680.76`，总净盈亏 `-319.24`
- `Agent2-短线选手`：现金 `49944.74`，黄金 `43.6570` 克，权益 `99791.43`，总净盈亏 `-208.57`
- `Agent3-长线选手`：现金 `67794.10`，黄金 `27.8778` 克，权益 `99624.41`，总净盈亏 `-375.59`
- `Agent4-定投选手`：现金 `99000.00`，黄金 `0.8756` 克，权益 `99999.74`
- `Agent5-鬼才本人`：现金 `70000.00`，黄金 `26.1689` 克，权益 `99879.13`

## 验证

- `node --check` 已通过：
  - `D:\\codex\\gold-investor-agent\\shared\\runtime\\agent-control.mjs`
  - `D:\\codex\\gold-investor-agent\\shared\\runtime\\start-dashboard-server.mjs`
  - `D:\\codex\\gold-investor-agent\\public\\app.js`
  - `D:\\codex\\gold-investor-agent\\public\\dashboard-render.js`
  - `D:\\codex\\gold-investor-agent\\public\\dashboard-chart.js`
  - `D:\\codex\\gold-investor-agent\\agents\\agent1-基础\\agent.mjs`
  - `D:\\codex\\gold-investor-agent\\agents\\agent2-短线选手\\agent.mjs`
  - `D:\\codex\\gold-investor-agent\\agents\\agent3-长线选手\\agent.mjs`
  - `D:\\codex\\gold-investor-agent\\agents\\agent4-定投选手\\agent.mjs`
  - `D:\\codex\\gold-investor-agent\\agents\\agent5-鬼才本人\\agent.mjs`
- `D:\\codex\\gold-investor-agent\\shared\\tools\\validate-agents.mjs`：通过
- `Agent5` 主程序重新执行后正常产出，没有打坏现有挂单和持仓结构
