# Agent3-长线选手

偏长线、低频调仓的黄金自动交易 Agent。

## 文件说明

- `agent.mjs`
  - Agent3 的策略实现和执行入口
- `agent.json`
  - Agent 元数据
- `strategy-config.json`
  - 当前正在使用的可编辑策略参数
- `out/`
  - 运行输出、回测结果、持仓和交易记录

## 风格定位

- 比 Agent1 更少动
- 更强调高确信度入场
- 更强调长周期持有
- 允许保护性减仓，但普通调仓门槛高很多

## 直接可修改的策略文件

- [strategy-config.json](/D:/codex/gold-investor-agent/agents/agent3-长线选手/strategy-config.json)

## 参数解释

- `initialCapital`
  - 初始本金

- `sellFeePerGram`
  - 卖出手续费

- `minTradeCny`
  - 最小交易金额
  - 长线版默认更高
  - 调大后会更少操作

- `rebalanceBufferRatio`
  - 再平衡缓冲区
  - 长线版这里很关键
  - 调大后更容易“继续拿着不动”
  - 调小后会逐渐向 Agent1 靠近

- `minNetTrimPnlCny`
- `minNetTrimPnlPerGram`
  - 普通长线减仓需要满足的最低净利润门槛
  - 调高后更像“长期大趋势利润兑现”
  - 调低后更容易做中期波段

- `minHoursBeforeNormalTrim`
  - 买入后多久才允许普通减仓
  - 调大后更符合长线风格
  - 调小后会更容易变得像中频策略

- `targetRatioCautious`
- `targetRatioProbe`
- `targetRatioBalanced`
- `targetRatioStrong`
  - 不同评分环境下的目标仓位
  - 长线版默认比 Agent1 低
  - 如果调太高，会削弱 Agent3 的长线特色

- `scoreExitThreshold`
- `scoreProbeThreshold`
- `scoreBalancedThreshold`
- `scoreStrongThreshold`
  - 评分阈值
  - 调高后更难入场，更保守
  - 调低后更容易介入

- `longTrendExitPct`
  - 长期趋势防守线
  - 调高后更早防守
  - 调低后更能容忍波动

- `dashboardLookbackDays`
  - 只影响图表展示

## 适合怎么改

- 想让 Agent3 更长线
  - 调大 `rebalanceBufferRatio`
  - 调大 `minTradeCny`
  - 调高 `scoreProbeThreshold` / `scoreBalancedThreshold`

- 想让 Agent3 稍微不那么钝
  - 小幅降低 `scoreProbeThreshold`
  - 或小幅提高 `targetRatioProbe`
  - 但不要一次改很多，不然会失去和 Agent1 的差异

## 修改后的建议操作

1. 修改 `strategy-config.json`
2. 手动运行一次 Agent 或等待 daemon 下一轮执行
3. 核对：
   - `out/backtest-summary.json`
   - `out/virtual-trade.json`
   - `out/portfolio.json`

