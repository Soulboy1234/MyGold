# Agent1-基础

稳健基础版黄金自动交易 Agent。

## 文件说明

- `agent.mjs`
  - Agent1 的策略实现和执行入口
- `agent.json`
  - Agent 元数据
- `strategy-config.json`
  - 当前正在使用的可编辑策略参数
- `out/`
  - 运行输出、回测结果、持仓和交易记录

## 风格定位

- 偏稳健、偏基础趋势跟随
- 会根据综合评分调整仓位
- 会保留保护性减仓
- 不追求过高频率的短线操作

## 直接可修改的策略文件

- `strategy-config.json`

修改这个文件后：

- 会影响后续实时决策
- 也会影响重新生成的历史回测结果

## 参数解释

- `initialCapital`
  - 初始本金
  - 一般不建议在正常运行中修改

- `sellFeePerGram`
  - 每克黄金卖出手续费
  - 调大后策略会更谨慎卖出
  - 调小后策略更容易做再平衡

- `minTradeCny`
  - 最小交易金额
  - 调大后，零碎小调仓会减少
  - 调小后，策略会更容易频繁小额交易

- `rebalanceBufferRatio`
  - 再平衡缓冲区
  - 调大后，只有仓位和目标仓位差得更明显时才交易，能减少抖动
  - 调小后，Agent 会更积极贴近目标仓位，但更容易来回调仓

- `minNetTrimPnlCny`
  - 普通减仓时，整笔卖出至少要达到的净利润金额
  - 调大后更像“有肉才卖”
  - 调小后更容易提前止盈或机械减仓

- `minNetTrimPnlPerGram`
  - 普通减仓时，每克至少要达到的净利润
  - 和上面的金额门槛一起使用
  - 调大后会进一步过滤低质量卖出

- `minHoursBeforeNormalTrim`
  - 新买入之后，普通减仓至少要等待的小时数
  - 调大后，刚买完不容易马上卖
  - 调小后，仓位会更灵活，但也更容易被短波动洗出去

- `targetRatioCautious`
  - 谨慎状态下的目标仓位
- `targetRatioProbe`
  - 试探状态下的目标仓位
- `targetRatioBalanced`
  - 平衡偏积极状态下的目标仓位
- `targetRatioStrong`
  - 强势状态下的目标仓位
  - 这些值调大，Agent 会整体更激进
  - 这些值调小，Agent 会整体更保守

- `scoreExitThreshold`
  - 低于这个综合评分时，转入明显防守
- `scoreProbeThreshold`
  - 达到这个评分后，允许建立试探仓
- `scoreBalancedThreshold`
  - 达到这个评分后，进入中等偏积极仓位
- `scoreStrongThreshold`
  - 达到这个评分后，进入强势仓位
  - 这些阈值调低，Agent 更容易加仓
  - 这些阈值调高，Agent 更难进入高仓位

- `longTrendExitPct`
  - 长期趋势防线比例
  - 一般表示价格跌破长期均线某个比例后，防守性减仓会更容易触发
  - 调高后更敏感，调低后更能扛回撤

- `dashboardLookbackDays`
  - 面板图表默认回看天数
  - 只影响展示，不影响交易逻辑

## 适合怎么改

- 想让 Agent1 更稳
  - 优先调大 `rebalanceBufferRatio`
  - 调大 `minNetTrimPnlCny`
  - 调高 `scoreProbeThreshold` 和 `scoreBalancedThreshold`

- 想让 Agent1 更积极
  - 优先小幅提高各档 `targetRatio`
  - 或小幅降低 `scoreProbeThreshold` / `scoreBalancedThreshold`
  - 不建议一次改太多，否则容易从“稳健”变成“机械高频”

## 修改后的建议操作

1. 修改 `strategy-config.json`
2. 手动运行一次 Agent 或等待 daemon 下一轮执行
3. 检查：
   - `out/backtest-summary.json`
   - `out/virtual-trade.json`
   - `out/portfolio.json`
