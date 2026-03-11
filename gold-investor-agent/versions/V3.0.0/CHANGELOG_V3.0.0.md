# V3.0.0 版本更新说明

更新日期：2026-03-10

本次版本围绕“多 Agent 架构稳定化、计算口径复核、版本可追溯”做了一轮整理，并以当前可运行状态生成了 `V3.0.0` 快照。

1. 运行时与可扩展性
- 项目正式按“共享基础层 + Agent 个体层”运行：
  - `Agents/` 保存各 Agent 的独立策略与输出
  - `shared/` 保存共用运行时、调度与 dashboard 服务
  - `public/` 保存共用前端面板
  - `src/` 保留默认入口包装层
- 共享运行时已支持按每个 Agent 的元数据解析：
  - `entry`
  - `outputDir`
- 这轮修正了一个真实扩展性问题：之前 dashboard 和轻量快照仍默认读取 `out/`，现在已经改为按 Agent 元数据真实路径读取。

2. 计算口径复核
- 复核了组合核心口径：
  - `组合权益 = 现金 + 黄金按卖出后价格估值的市值`
  - `总净盈亏 = 组合权益 - 初始本金`
  - `总手续费 = 所有卖出克数 × 每克 4 元`
- 复核了持仓成本逻辑：
  - 只有买入会改变持仓平均金价
  - 卖出只减少仓位与投入成本，不改变剩余仓位的平均金价
- 复核了交易记录衍生字段：
  - 卖出金价
  - 卖出时成本金价
  - 单笔交易成本金额
  - 单笔盈亏 / 单笔净盈亏
  - 手续费 / 净收入
- 兼容字段 `totalPnlCny` 仍然保留，但统一对齐到 `netTotalPnlCny`，避免前后端口径漂移。

3. 多 Agent 面板
- Agent 选择区继续支持：
  - 多 Agent 并列显示
  - 名称旁展示累计总净盈亏
  - 启动 / 停止按钮
- 图表与交易记录的交互保护保留：
  - 金价图需要先单击再启用滚轮缩放
  - 交易记录需要先单击再启用内部滚动

4. 当前 Agent 状态快照
- `Agent1-基础`
  - 策略版本：`v2.2.0`
  - 最新组合权益：`99930.87`
  - 最新总净盈亏：`-69.13`
- `Agent2-短线选手`
  - 策略版本：`v3.2.0`
  - 最新组合权益：`99919.27`
  - 最新总净盈亏：`-80.73`

5. 验证
- 已执行 `node --check`：
  - `shared/runtime/resolve-agent.mjs`
  - `shared/runtime/agent-control.mjs`
  - `shared/runtime/start-dashboard-server.mjs`
  - `public/app.js`
  - `public/dashboard-render.js`
  - `public/dashboard-chart.js`
  - `Agents/Agent1-基础/agent.mjs`
  - `Agents/Agent2-短线选手/agent.mjs`
- 已分别执行：
  - `Agent1-基础`
  - `Agent2-短线选手`
- 已确认：
  - 本地 dashboard 服务可读取多 Agent 列表
  - Agent 选择器可以读取每个 Agent 的总净盈亏轻量快照

6. 快照内容
- `Agents/`
- `public/`
- `shared/`
- `src/`
- `README.md`
- `package.json`
- 启动与停止脚本
