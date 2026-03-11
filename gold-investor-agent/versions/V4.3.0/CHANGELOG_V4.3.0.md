# V4.3.0

更新时间：2026-03-12 07:45:00 +08:00

## 本版变更

- 为 `Agent1-基础`、`Agent2-短线选手`、`Agent3-长线选手`、`Agent4-定投选手` 增加了可直接编辑的 `strategy-config.json`，策略参数与代码实现正式分离。
- 新增共享配置加载器 `shared/runtime/strategy-config.mjs`，自动在运行时读取策略配置，并把缺失字段补齐回配置文件。
- 重写了 5 个 Agent 的独立 README，补充了风格定位、参数含义、调参方向和修改后的检查建议。
- 收紧了 dashboard 写接口的安全策略：
  - 写接口需要运行时写令牌
  - NAS 模式下写接口还需要同源页面请求
  - 动态接口统一 `no-store`
  - JSON 请求体大小限制为 64 KB

## 当前 Agent 状态

- `Agent1-基础`：现金 `44896.10`，黄金 `47.9818` 克，权益 `99293.07`，总净盈亏 `-706.93`
- `Agent2-短线选手`：现金 `35853.25`，黄金 `56.0047` 克，权益 `99345.78`，总净盈亏 `-654.22`
- `Agent3-长线选手`：现金 `67794.10`，黄金 `27.8778` 克，权益 `99399.16`，总净盈亏 `-600.84`
- `Agent4-定投选手`：现金 `98000.00`，黄金 `1.7476` 克，权益 `99981.25`，总净盈亏 `-18.75`
- `Agent5-鬼才本人`：现金 `20000.00`，黄金 `70.0748` 克，权益 `99443.80`，总净盈亏 `-556.20`

## 验证

- `node --check`
  - `D:\\codex\\gold-investor-agent\\shared\\runtime\\strategy-config.mjs`
  - `D:\\codex\\gold-investor-agent\\shared\\runtime\\start-dashboard-server.mjs`
  - `D:\\codex\\gold-investor-agent\\public\\app.js`
  - `D:\\codex\\gold-investor-agent\\agents\\agent1-基础\\agent.mjs`
  - `D:\\codex\\gold-investor-agent\\agents\\agent2-短线选手\\agent.mjs`
  - `D:\\codex\\gold-investor-agent\\agents\\agent3-长线选手\\agent.mjs`
  - `D:\\codex\\gold-investor-agent\\agents\\agent4-定投选手\\agent.mjs`
- `D:\\codex\\gold-investor-agent\\shared\\tools\\run-all-agents-once.mjs`：通过
- `D:\\codex\\gold-investor-agent\\shared\\tools\\validate-agents.mjs`：通过
