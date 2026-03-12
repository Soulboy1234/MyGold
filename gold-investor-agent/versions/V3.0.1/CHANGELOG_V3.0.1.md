# V3.0.1 版本更新说明

更新日期：2026-03-10

本次版本是对 `V3.0.0` 的稳定性与计算口径修订，重点不是新增功能，而是把当前多 Agent 结构下的入口、历史成本恢复和图表性能进一步收紧。

1. 运行时入口修正
- `src/agent.mjs` 不再直接拼接默认 Agent 文件路径。
- 现在统一改为走共享运行时 `runAgentOnce(...)`，确保：
  - 默认入口和多 Agent 管理面板使用同一套 Agent 解析逻辑
  - 后续 Agent 自定义 `entry` 时，默认入口不会失效

2. 交易成本恢复修正
- `Agents/Agent1-基础/agent.mjs`
- `Agents/Agent2-短线选手/agent.mjs`
- 修正了历史交易恢复中的一个兼容性问题：
  - 当旧记录缺少 `remainingGoldGrams` 时
  - 卖出后的剩余投入成本可能被推得过低
- 现在改为按交易顺序回放：
  - 买入增加持仓克数和投入金额
  - 卖出结合运行中的持仓克数推导卖出比例
  - 同时补写标准化后的 `remainingGoldGrams`

3. 图表性能与稳定性
- `public/dashboard-chart.js`
- 优化点：
  - 时间点定位由线性扫描改为二分查找
  - 均线结果按当前序列做缓存，避免每次重绘都全量重算
  - 空价格数组直接提前返回，避免异常渲染
  - 本地坐标换算增加除零保护

4. 当前快照
- `Agent1-基础`
  - 最新组合权益：`99951.09`
  - 最新总净盈亏：`-48.91`
- `Agent2-短线选手`
  - 最新组合权益：`99942.84`
  - 最新总净盈亏：`-57.16`

5. 验证
- 已执行 `node --check`
  - `src/agent.mjs`
  - `Agents/Agent1-基础/agent.mjs`
  - `Agents/Agent2-短线选手/agent.mjs`
  - `public/dashboard-chart.js`
- 已执行：
  - 默认入口 `src/agent.mjs`
  - `Agent1-基础`
  - `Agent2-短线选手`
