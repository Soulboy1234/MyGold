# Agent2-短线选手

偏主动、偏短线波段的黄金自动交易 Agent。

## 文件说明

- `agent.mjs`
  - Agent2 的策略实现和执行入口
- `agent.json`
  - Agent 元数据
- `strategy-config.json`
  - 当前正在使用的可编辑策略参数
- `out/`
  - 运行输出、回测结果、持仓和交易记录

## 风格定位

- 比 Agent1 更积极
- 更愿意利用盘中回撤加仓、盘中过热减仓
- 仍然会考虑手续费，不是无脑高频
- 目标是做“更有质量的短线”

## 直接可修改的策略文件

- [strategy-config.json](/D:/codex/gold-investor-agent/agents/agent2-短线选手/strategy-config.json)

## 参数解释

- `initialCapital`
  - 初始本金

- `sellFeePerGram`
  - 每克黄金卖出手续费
  - 短线策略对这个参数更敏感

- `minTradeCny`
  - 最小交易金额
  - 调小后更容易做细碎短线
  - 调大后能减少手续费磨损

- `rebalanceBufferRatio`
  - 再平衡缓冲区
  - 调小后更贴近目标仓位，更积极
  - 调大后更克制，减少短线来回折腾

- `targetRatioCautious`
- `targetRatioProbe`
- `targetRatioBalanced`
- `targetRatioStrong`
  - 不同强弱环境下的目标仓位
  - 调大后整体更激进
  - 调小后整体更保守

- `scoreExitThreshold`
- `scoreProbeThreshold`
- `scoreBalancedThreshold`
- `scoreStrongThreshold`
  - 综合评分阈值
  - 调低后更容易进入多头仓位
  - 调高后更难加仓

- `longTrendExitPct`
  - 长期趋势防守阈值
  - 调高后更早触发保护性退出
  - 调低后更愿意扛波动

- `shortTermDipPremium`
  - 相对短期均线出现多大回撤时，允许短线回撤加仓
  - 数值更负，说明要跌得更深才加仓
  - 数值更接近 0，说明更容易在浅回撤时加仓

- `shortTermStrongDipPremium`
  - 进入更强一级短线加仓前，需要的更深回撤幅度
  - 越负越谨慎

- `shortTermTrimPremium`
  - 盘中过热到什么程度时，允许短线减仓
  - 调低后更容易止盈
  - 调高后更耐拿

- `shortTermHardTrimPremium`
  - 更强烈的过热减仓阈值
  - 调低后更容易重度止盈
  - 调高后更少触发

- `minTrendScoreForTacticalAdd`
  - 允许战术性短线加仓时，趋势分至少要达到的值
  - 调高后更重视趋势健康度

- `minMacroScoreForTacticalAdd`
  - 允许战术性短线加仓时，宏观分至少要达到的值
  - 调高后更重视宏观环境

- `maxRatioWhenTrendWeak`
  - 趋势偏弱时允许的最大仓位
  - 调低后更保守

- `maxRatioWhenMacroHeavy`
  - 宏观压力较大时允许的最大仓位
  - 调低后更保守

- `maxRatioOnCrossDown`
  - 短趋势转弱时允许的最大仓位
  - 调低后更容易主动降仓

- `minNetTrimPnlCny`
- `minNetTrimPnlPerGram`
  - 一般减仓时至少要达到的净利润门槛
  - 调高后，更像“利润边际足够才卖”
  - 调低后，更容易做频繁止盈

- `minProfitTakeTrimPnlCny`
- `minProfitTakeTrimPnlPerGram`
  - 纯止盈型短线卖出时的更高净利润门槛
  - 是 Agent2 和 Agent1 的重要区别之一
  - 调高后会更挑机会
  - 调低后会更积极止盈

- `minHoursBeforeProfitTakeTrim`
  - 刚买入后，至少等多久才允许做短线止盈
  - 调大后更防止“刚买就卖”
  - 调小后更灵活，但更容易过度交易

- `dashboardLookbackDays`
  - 只影响图表展示

## 适合怎么改

- 想让 Agent2 更像短线高手
  - 优先调 `shortTermDipPremium`、`shortTermTrimPremium`
  - 再小幅调 `targetRatioBalanced` / `targetRatioStrong`

- 想减少 Agent2 过度交易
  - 调大 `rebalanceBufferRatio`
  - 调大 `minProfitTakeTrimPnlCny`
  - 调大 `minHoursBeforeProfitTakeTrim`

## 修改后的建议操作

1. 修改 `strategy-config.json`
2. 手动运行一次 Agent 或等待 daemon 下一轮执行
3. 核对：
   - `out/backtest-summary.json`
   - `out/virtual-trade.json`
   - `out/trade-log.json`

