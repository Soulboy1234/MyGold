# Agent4-定投选手

以固定节奏定投、同时保留低频卖出规则的黄金自动交易 Agent。

## 文件说明

- `agent.mjs`
  - Agent4 的策略实现和执行入口
- `agent.json`
  - Agent 元数据
- `strategy-config.json`
  - 当前正在使用的可编辑策略参数
- `out/`
  - 运行输出、回测结果、持仓和交易记录

## 风格定位

- 以定投为主
- 不追求频繁择时
- 允许在明显盈利或明显转弱时做低频卖出
- 更像“有纪律的长期积累型投资者”

## 直接可修改的策略文件

- [strategy-config.json](/D:/codex/gold-investor-agent/agents/agent4-定投选手/strategy-config.json)

## 参数解释

- `initialCapital`
  - 初始本金

- `sellFeePerGram`
  - 卖出手续费

- `dcaAmountCny`
  - 每次定投金额
  - 调大后建仓更快
  - 调小后更分散、更平滑

- `dcaHourLocal`
- `dcaMinuteLocal`
  - 每天定投执行的本地时间
  - 比如 `15:00`

- `dcaTakeProfitPct`
  - 达到多少净盈利比例后，允许止盈
  - 调低后更容易止盈
  - 调高后更偏长期持有

- `dcaTakeProfitTrimRatio`
  - 触发止盈后卖出多少持仓比例
  - 调大后止盈更明显
  - 调小后更偏“轻微减仓”

- `dcaDefenseTrimRatio`
  - 趋势转弱时的防守减仓比例
  - 调大后防守更坚决
  - 调小后更偏继续持有

- `dcaOverheatPremiumPct`
  - 价格相对短期均线过热到什么程度时，配合盈利条件触发止盈
  - 调低后更容易止盈
  - 调高后更能容忍上涨延伸

- `dcaTrendFloorPct`
  - 长期趋势防守底线
  - 调高后更敏感
  - 调低后更宽松

- `dcaSellCooldownDays`
  - 两次卖出之间至少间隔多少天
  - 调大后更接近纯定投
  - 调小后卖出会更灵活

- `minTradeCny`
  - 最小交易金额
  - 防止很碎的小单

- `rebalanceBufferRatio`
- `targetRatioCautious`
- `targetRatioProbe`
- `targetRatioBalanced`
- `targetRatioStrong`
- `scoreExitThreshold`
- `scoreProbeThreshold`
- `scoreBalancedThreshold`
- `scoreStrongThreshold`
- `longTrendExitPct`
  - 这组参数主要用于 Agent4 保留的综合环境判断和辅助减仓逻辑
  - 通常不建议频繁大改
  - 如果你只想调整定投风格，优先改前面的 `dca*` 参数

- `dashboardLookbackDays`
  - 只影响图表展示

## 适合怎么改

- 想让 Agent4 更像纯定投
  - 调高 `dcaTakeProfitPct`
  - 调小 `dcaTakeProfitTrimRatio`
  - 调大 `dcaSellCooldownDays`

- 想让 Agent4 更会“落袋为安”
  - 调低 `dcaTakeProfitPct`
  - 调大 `dcaTakeProfitTrimRatio`
  - 调低 `dcaOverheatPremiumPct`

## 修改后的建议操作

1. 修改 `strategy-config.json`
2. 手动运行一次 Agent 或等待 daemon 下一轮执行
3. 核对：
   - `out/backtest-summary.json`
   - `out/virtual-trade.json`
   - `out/trade-log.json`

