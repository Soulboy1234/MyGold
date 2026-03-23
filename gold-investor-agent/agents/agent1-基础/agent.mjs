import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { loadStrategyConfig } from "../../shared/runtime/strategy-config.mjs";
import { getWeekendTradingWindowStatus } from "../../shared/runtime/trading-window.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(AGENT_DIR, "out");
const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, "..");

const INPUTS = {
  latest: path.join(WORKSPACE_ROOT, "gold-monitor", "state", "latest.json"),
  intradayJsonl: path.join(WORKSPACE_ROOT, "gold-monitor", "state", "high_frequency_history.jsonl"),
  dailyDb: path.join(WORKSPACE_ROOT, "gold-dashboard", "data", "history.db"),
  intradayDb: path.join(WORKSPACE_ROOT, "gold-dashboard", "data", "highres.db"),
};

const FILES = {
  state: path.join(OUT_DIR, "agent-state.json"),
  portfolio: path.join(OUT_DIR, "portfolio.json"),
  portfolioHistory: path.join(OUT_DIR, "portfolio-history.json"),
  tradeLog: path.join(OUT_DIR, "trade-log.json"),
  decisionHistory: path.join(OUT_DIR, "decision-history.json"),
  virtualTrade: path.join(OUT_DIR, "virtual-trade.json"),
  backtest: path.join(OUT_DIR, "backtest-summary.json"),
  strategyReport: path.join(OUT_DIR, "strategy-report.md"),
  dashboardData: path.join(OUT_DIR, "dashboard-data.json"),
  strategyHistory: path.join(OUT_DIR, "strategy-history.json"),
  strategyConfig: path.join(AGENT_DIR, "strategy-config.json"),
};

const DEFAULT_CONFIG = {
  initialCapital: 100000,
  sellFeePerGram: 4,
  minTradeCny: 5200,
  rebalanceBufferRatio: 0.075,
  minNetTrimPnlCny: 220,
  minNetTrimPnlPerGram: 3.2,
  minHoursBeforeNormalTrim: 96,
  cooldownBypassNetTrimPnlCny: 900,
  cooldownBypassNetTrimPnlPerGram: 6.5,
  targetRatioCautious: 0.08,
  targetRatioProbe: 0.24,
  targetRatioBalanced: 0.52,
  targetRatioStrong: 0.72,
  scoreExitThreshold: 32,
  scoreProbeThreshold: 46,
  scoreBalancedThreshold: 58,
  scoreStrongThreshold: 70,
  longTrendExitPct: 0.985,
  flowRiskOffPriceBelowSma60Pct: 0.989,
  flowRiskOffEtfRoc20Pct: -0.045,
  sharpDropDefenseDailySma20Pct: 0.975,
  sharpDropDefenseDailySma60Pct: 0.985,
  sharpDropDefenseIntradayPremiumPct: -0.018,
  sharpDropDefenseRatio: 0.16,
  sharpDropReboundRecoveryPct: 0.025,
  sharpDropReboundNeedAboveSma24Pct: 1.002,
  sharpDropReboundDailySma20Pct: 0.99,
  sharpDropReboundRatio: 0.3,
  reentryCooldownHoursAfterDefense: 96,
  reentryNeedScoreAfterDefense: 60,
  reentryNeedAdviceScoreAfterDefense: 1,
  enableSharpDropTacticalRules: false,
  drawdownRiskOffPriceBelowSma20Pct: 0.965,
  drawdownRiskOffPriceBelowSma60Pct: 0.985,
  peakRolloverRiskOffPriceBelowRecentHigh5Pct: 0.945,
  peakRolloverRiskOffIntradayPremiumPct: -0.0015,
  peakRolloverSeverePriceBelowRecentHigh5Pct: 0.905,
  bandUpgradeMarginPoints: 8,
  bandDowngradeMarginPoints: 16,
  cnEtfStrongRoc20Pct: 0.03,
  cnEtfWeakRoc20Pct: -0.05,
  cnEtfStrongTurnoverRatio20: 1.08,
  cnEtfWeakTurnoverRatio20: 0.84,
  cnEtfRiskOffTurnoverRatio20: 1.28,
  cnEtfPriceSupportPct: 0.998,
  cnEtfAltStrongRoc20Pct: 0.018,
  cnEtfAltWeakRoc20Pct: -0.04,
  cnEtfAltStrongTurnoverRatio20: 1.05,
  shfeStrongRoc20Pct: 0.02,
  shfeWeakRoc20Pct: -0.05,
  shfeStrongVolumeRatio20: 1.05,
  shfeRiskOffVolumeRatio20: 1.2,
  shfeStrongPremiumCny: 2,
  shfeWeakPremiumCny: -6,
  dashboardLookbackDays: 180,
};

const STRATEGY_HISTORY = {
  currentVersion: "v2.6.0",
  versions: [
    {
      version: "v1.0.0",
      createdAt: "2026-03-09 21:30:00",
      updatedAt: "2026-03-09 21:30:00",
      title: "Trend Pullback With Macro Filter",
      changes: [
        "基于日频趋势和短线回踩做分批买入",
        "首次引入高频建议和美元代理过滤",
      ],
      reason: "先快速搭建一版能用的黄金虚拟交易规则并验证手续费约束。",
    },
    {
      version: "v2.0.0",
      createdAt: "2026-03-10 00:20:00",
      updatedAt: "2026-03-10 00:20:00",
      title: "MA Cross Trend Filter",
      titleZh: "均线趋势过滤",
      changes: [
        "改为 20 日与 60 日均线交叉的低频趋势策略",
        "显著降低交易频率，减少每克 4 元卖出手续费拖累",
        "加入持仓续管、组合历史、决策去重和可视化数据输出",
      ],
      reason: "v1 交易过于频繁，回测被手续费和震荡段明显拖累，需要切换到更低频、更稳的策略。",
    },
    {
      version: "v2.1.0",
      createdAt: "2026-03-10 09:10:00",
      updatedAt: "2026-03-10 09:10:00",
      title: "Composite Multi-Signal Gold Allocation",
      titleZh: "多信号综合黄金配置",
      changes: [
        "Use a composite score instead of leaning on a single advice field.",
        "Blend trend, UUP, GLD, real yield and intraday extension into target positioning.",
        "Expose Chinese strategy text and clearer diagnostics for the dashboard.",
      ],
      changesZh: [
        "不再依赖单一建议字段，而是改成综合评分决策。",
        "把趋势、美元代理、GLD、真实利率和盘中偏离度共同纳入目标仓位模型。",
        "为面板输出中文策略文案和更清晰的诊断信息。",
      ],
      reason: "Portfolio decisions should depend on multiple market signals rather than only on the monitor task's summary text.",
      reasonZh: "投资决策不该只依赖追踪任务里的总结文本，而应由多个市场信号共同驱动。",
    },
    {
      version: "v2.2.0",
      createdAt: "2026-03-10 10:45:00",
      updatedAt: "2026-03-10 10:45:00",
      title: "Fee-Aware Composite Regime Filter",
      titleZh: "手续费敏感的综合评分分层过滤",
      changes: [
        "Promote score thresholds and target ratios into explicit config.",
        "Unify live and backtest decision logic through the same composite decision helper.",
        "Tighten weak-regime exits and soften strong-regime leverage after fee-aware historical validation.",
      ],
      changesZh: [
        "把综合评分阈值和目标仓位映射显式收敛到配置层。",
        "让实盘和回测共用同一套综合决策 helper，减少口径漂移。",
        "在考虑卖出手续费的历史验证后，收紧弱势区间退出、适度降低强势区间目标仓位。",
      ],
      reason: "The previous version mixed a composite score with looser threshold wiring. v2.2.0 makes the decision path explicit and more fee-aware.",
      reasonZh: "上一版虽然用了综合评分，但阈值和映射仍然偏松散。v2.2.0 把决策路径显式化，并进一步按手续费约束收紧。",
    },
    {
      version: "v2.3.0",
      createdAt: "2026-03-11 07:20:00",
      updatedAt: "2026-03-11 07:20:00",
      title: "Composite Regime With Human-Like Sell Filters",
      titleZh: "更像人交易的综合评分策略",
      changes: [
        "Raise the normal rebalance buffer and add a minimum net-profit filter for non-defensive sells.",
        "Keep protective reductions available, but delay ordinary trims shortly after a fresh buy.",
        "Reduce score-band churning so the base agent behaves more like a profit-seeking discretionary trader.",
      ],
      changesZh: [
        "提高普通再平衡缓冲，并给非防守型卖出增加最低净收益门槛。",
        "保留保护性减仓，但在刚买入后的一小段时间内延后普通调仓减仓。",
        "降低评分边界附近的来回调仓，让基础版更像以赚钱为目标的人类交易者。",
      ],
      reason: "The base agent should still rebalance, but should not dump gold too quickly after buying unless risk protection is genuinely needed.",
      reasonZh: "基础版仍然需要调仓，但不应该在刚买入后不久就因为轻微回摆而卖出，除非确实进入需要防守的环境。",
    },
    {
      version: "v2.4.0",
      createdAt: "2026-03-20 09:30:00",
      updatedAt: "2026-03-20 09:30:00",
      title: "Sharp Drop Defense And Rebound Rebuild",
      titleZh: "急跌防守与反弹回补",
      changes: [
        "Add a live sharp-drop defense branch before the normal score ladder so deep breaks below daily SMA20/SMA60 can cut exposure earlier.",
        "Add a rebound rebuild branch that allows reloading part of the trimmed position after a sharp-drop bounce reclaims the intraday average.",
        "Expose the sharp-drop live diagnostics so intraday crash handling is easier to audit from the dashboard files.",
      ],
      changesZh: [
        "在常规评分映射前增加急跌防守分支，当实时价格深度跌破日线 SMA20/SMA60 时可以提前降仓。",
        "增加急跌后的反弹回补分支，当价格从急跌低点反弹并重新站回盘中均线时允许回补部分仓位。",
        "把急跌相关诊断输出到面板数据里，便于后续核查实时决策逻辑。",
      ],
      reason: "The previous base strategy treated very sharp intraday sell-offs as ordinary pullbacks. It needs a dedicated defense-and-rebuild path for crash-like moves.",
      reasonZh: "上一版基础策略把很急的盘中跳水仍然当成普通回撤处理，需要单独增加一条急跌防守与反弹回补路径。",
    },
    {
      version: "v2.5.0",
      createdAt: "2026-03-21 13:10:00",
      updatedAt: "2026-03-21 13:10:00",
      title: "Medium-Term Trend With Domestic Flow Filters",
      titleZh: "中线趋势主导与资金过滤",
      changes: [
        "Shift Agent1 back to a medium-term trend allocator led by price structure and intraday positioning.",
        "Use domestic gold ETF flow and macro proxies mostly as risk filters and exposure caps instead of primary triggers.",
        "Increase hysteresis, minimum trim edge and minimum trade size to avoid fee-heavy mid-range churning.",
      ],
      changesZh: [
        "把 Agent1 收敛回更纯粹的中线趋势配置器，由价格结构和盘中位置主导交易。",
        "国内黄金 ETF 资金与宏观代理更多作为风险过滤和仓位上限控制，而不是直接主导加减仓。",
        "提高滞回、最小利润和最小交易额，减少中间区间来回切换带来的手续费磨损。",
      ],
      reason: "Feature ablation on the extended high-resolution history showed price plus intraday timing was the real driver, while macro-style inputs mostly added churn.",
      reasonZh: "扩展后的高频历史消融测试显示，真正支撑 Agent1 的是价格趋势和盘中择时，宏观类输入当前更多是在制造来回调仓。",
    },
    {
      version: "v2.6.0",
      createdAt: "2026-03-21 18:40:00",
      updatedAt: "2026-03-21 18:40:00",
      title: "Mid-Term Trend Core With Domestic Caps",
      titleZh: "中线趋势主轴与国内资金上限",
      changes: [
        "Rebuild the score around medium-term trend and intraday location instead of letting fast filters dominate every rebalance.",
        "Use domestic ETF and SHFE signals primarily as exposure caps and risk filters.",
        "Increase hysteresis, trim thresholds and post-defense reentry requirements so the base agent behaves like a steadier swing allocator.",
      ],
      changesZh: [
        "把评分主轴重新收回到中线趋势和盘中位置，不再让快变过滤器主导每一次调仓。",
        "把国内 ETF 与沪金信号主要用于仓位上限和风险过滤。",
        "提高滞回、止盈门槛和防守后再入场要求，让基础版更像稳扎稳打的中线配置器。",
      ],
      reason: "The previous revision still reacted too often to mixed fast signals. This version rebuilds Agent1 as a calmer medium-term allocator while keeping domestic filters as safety rails.",
      reasonZh: "上一版仍然会被混杂的快变信号频繁推着走。这一版把 Agent1 收回到更沉稳的中线配置器，同时保留国内资金过滤作为安全护栏。",
    },
  ],
};

const STRATEGY = {
  id: "composite-multi-signal-gold-allocation",
  version: STRATEGY_HISTORY.currentVersion,
  createdAt: "2026-03-10 09:10:00",
  name: "Composite Multi-Signal Gold Allocation",
  nameZh: "多信号综合黄金配置策略",
  description: "Blend long-term trend, macro proxies, real yield and intraday extension into a target-position model.",
  descriptionZh: "以长期价格趋势和盘中位置为主做中线配置，国内黄金 ETF 资金与宏观代理更多作为风险过滤和仓位上限控制。",
  buyRule: [
    "daily composite score >= 48",
    "price stays above the long-term trend floor",
    "domestic flow and macro filters do not cap exposure",
    "intraday extension is not overheated",
  ],
  sellRule: [
    "daily composite score < 35",
    "or price loses the long-term trend floor",
    "or domestic flow turns weak while price falls back into the weak daily regime",
  ],
  buyRuleZh: [
    "综合评分达到 48 分以上。",
    "价格维持在长期趋势底线之上。",
    "国内资金与宏观过滤未触发明显风险约束。",
    "盘中位置没有过热。",
  ],
  sellRuleZh: [
    "综合评分跌破 35 分。",
    "或者价格跌破长期趋势底线。",
    "或者国内资金确认转弱且价格重新落回日线弱势区间。",
    "或者实时价格深跌破日线 SMA20/SMA60 时，先减到防守仓；若急跌后重新站回盘中均线，再回补到反弹仓。",
  ],
  scoreMethodZh: [
    "综合评分 = 趋势分 + 资金过滤分 + 盘中位置分 + 追踪建议分，最后截断到 0 到 100 分。",
    "趋势分是主轴：价格站上 SMA200、SMA20 站上 SMA60、价格重新站上短中期均线时加分；跌回长期趋势保护带会扣分。",
    "资金过滤分不再主导节奏，而是主要根据国内黄金 ETF 的 20 日动量、相对放量和价格是否站稳 ETF 均线做加减分，同时只对极端美元和实际利率做轻量修正。",
    "盘中位置分继续负责择时：实时价格相对盘中 SMA24 越低，越适合中线仓位回补；明显过热则抑制追价。",
    "追踪建议分只做辅助确认，权重比过去更小，避免文本信号把中线策略带成高频来回调仓。",
    "仓位映射：35 分以下偏防守，53 分以上建立试探仓，61 分以上进入中线主仓，75 分以上才允许高配仓位；若国内资金偏弱，高配仓会被自动压回。",
  ],
};

applyChineseStrategyText();

await mkdir(OUT_DIR, { recursive: true });

const CONFIG = await loadStrategyConfig(FILES.strategyConfig, DEFAULT_CONFIG, {
  agentName: "agent1-基础",
  strategyVersion: STRATEGY_HISTORY.currentVersion,
  description: "中线趋势主导参数。以价格趋势和高频位置为主，国内 ETF 资金与宏观代理更多作为风险过滤与仓位上限控制。",
});

const latest = JSON.parse(cleanText(await readFile(INPUTS.latest, "utf8")));
const intradayTape = await loadJsonLines(INPUTS.intradayJsonl);
const dailyRows = enrichDailyRows(loadDailyRows(INPUTS.dailyDb));
const rawIntradayRows = loadIntradayRows(INPUTS.intradayDb);
const intradayRows = mergeIntradaySeries(rawIntradayRows, intradayTape, latest);

const backtest = runBacktest(dailyRows, CONFIG);
const persisted = await loadPersistedState();
const liveDecision = decideAndApply({
  latest,
  intradayRows,
  dailyRows,
  persisted,
  config: CONFIG,
  backtest,
});

const dashboardData = buildDashboardData({
  latest,
  dailyRows,
  intradayRows,
  intradayTape,
  backtest,
  liveDecision,
  tradeLog: liveDecision.tradeLog,
  decisionHistory: liveDecision.decisionHistory,
  portfolioHistory: liveDecision.portfolioHistory,
});

const report = buildReport({ latest, backtest, liveDecision });

await writeJson(FILES.state, liveDecision.agentState);
await writeJson(FILES.portfolio, liveDecision.portfolio);
await writeJson(FILES.portfolioHistory, liveDecision.portfolioHistory);
await writeJson(FILES.tradeLog, liveDecision.tradeLog);
await writeJson(FILES.decisionHistory, liveDecision.decisionHistory);
await writeJson(FILES.virtualTrade, liveDecision.order);
await writeJson(FILES.backtest, backtest);
await writeJson(FILES.dashboardData, dashboardData);
await writeJson(FILES.strategyHistory, STRATEGY_HISTORY);
await writeFile(FILES.strategyReport, report, "utf8");

console.log(JSON.stringify({
  checkedAt: latest.checkedAtLocal,
  action: liveDecision.order.action,
  targetPositionRatio: round4(liveDecision.order.targetPositionRatio),
  cashCny: round2(liveDecision.portfolio.cashCny),
  goldGrams: round4(liveDecision.portfolio.goldGrams),
  equityCny: round2(liveDecision.portfolio.equityCny),
  tradeCount: liveDecision.tradeLog.length,
}, null, 2));

function applyChineseStrategyText() {
  const localizedVersions = new Map([
    ["v1.0.0", {
      title: "趋势回踩与宏观过滤",
      changes: [
        "基于日频趋势和短线回踩做分批买入。",
        "首次引入高频建议和美元代理过滤。",
      ],
      reason: "先快速搭建一版能用的黄金虚拟交易规则并验证手续费约束。",
    }],
    ["v2.0.0", {
      title: "均线趋势过滤",
      changes: [
        "改为 20 日与 60 日均线交叉的低频趋势策略。",
        "显著降低交易频率，减少每克 4 元卖出手续费拖累。",
        "加入持仓续管、组合历史、决策去重和可视化数据输出。",
      ],
      reason: "v1 交易过于频繁，回测被手续费和震荡段明显拖累，需要切换到更低频、更稳的策略。",
    }],
    ["v2.1.0", {
      title: "多信号综合黄金配置",
      changes: [
        "不再依赖单一建议字段，而是改成综合评分决策。",
        "把趋势、美元代理、GLD、真实利率和盘中偏离度共同纳入目标仓位模型。",
        "为面板输出中文策略文案和更清晰的诊断信息。",
      ],
      reason: "投资决策不该只依赖追踪任务里的总结文本，而应由多个市场信号共同驱动。",
    }],
    ["v2.2.0", {
      title: "手续费敏感的综合评分分层过滤",
      changes: [
        "把综合评分阈值和目标仓位映射显式收敛到配置层。",
        "让实盘和回测共用同一套综合决策 helper，减少口径漂移。",
        "在考虑卖出手续费的历史验证后，收紧弱势区间退出、适度降低强势区间目标仓位。",
      ],
      reason: "上一版虽然用了综合评分，但阈值和映射仍然偏松散。v2.2.0 把决策路径显式化，并进一步按手续费约束收紧。",
    }],
    ["v2.6.0", {
      title: "中线趋势主轴与国内资金上限",
      changes: [
        "把评分主轴重新收回到中线趋势和盘中位置，不再让快变过滤器主导每一次调仓。",
        "把国内 ETF 与沪金信号主要用于仓位上限和风险过滤。",
        "提高滞回、止盈门槛和防守后再入场要求，让基础版更像稳扎稳打的中线配置器。",
      ],
      reason: "上一版仍然会被混杂的快变信号频繁推着走。这一版把 Agent1 收回到更沉稳的中线配置器，同时保留国内资金过滤作为安全护栏。",
    }],
  ]);

  for (const item of STRATEGY_HISTORY.versions) {
    const localized = localizedVersions.get(item.version);
    if (!localized) continue;
    item.title = localized.title;
    item.titleZh = localized.title;
    item.changes = localized.changes.slice();
    item.changesZh = localized.changes.slice();
    item.reason = localized.reason;
    item.reasonZh = localized.reason;
  }

  const localizedScoreMethod = [
    "综合评分 = 趋势分 + 宏观分 + 盘中位置分 + 追踪建议分，最后截断到 0 到 100 分。",
    "趋势分 0 到 38：价格站上 SMA200、SMA20 上穿 SMA60、价格站上 SMA20 会加分；若价格跌破长期趋势保护带会扣分。",
    "宏观分 0 到 32：综合 UUP 20 日变动、GLD 20 日变动和 10 年期实际利率，美元走弱、GLD 走强、实际利率偏低时加分。",
    "盘中位置分 2 到 14：比较实时金价和盘中 SMA24 的偏离，位置越低越容易加分，过热则降分。",
    "追踪建议分 0 到 14：读取高频建议、日频建议和方向描述，偏多加分，观望或转弱减分。",
    "仓位映射：24 分以下以防守和减仓为主，48 分以上建立试探仓，56 分以上进入平衡偏积极仓，70 分以上进入强势仓。",
  ];

  Object.assign(STRATEGY, {
    name: "多信号综合黄金配置策略",
    nameZh: "多信号综合黄金配置策略",
    description: "把长期趋势、美元与 GLD 代理、真实利率和盘中偏离度合并成综合评分，再映射为目标仓位。",
    descriptionZh: "把长期趋势、美元与 GLD 代理、真实利率和盘中偏离度合并成综合评分，再映射为目标仓位。",
    buyRule: [
      "综合评分达到 48 分以上。",
      "价格维持在长期趋势底线之上。",
      "宏观压力没有明显转空。",
      "盘中位置没有过热。",
    ],
    sellRule: [
      "综合评分跌破 24 分。",
      "或者价格跌破 SMA200 的 97%。",
      "或者短期趋势转弱且宏观压力同步变差。",
    ],
    buyRuleZh: [
      "综合评分达到 48 分以上。",
      "价格维持在长期趋势底线之上。",
      "宏观压力没有明显转空。",
      "盘中位置没有过热。",
    ],
    sellRuleZh: [
      "综合评分跌破 24 分。",
      "或者价格跌破 SMA200 的 97%。",
      "或者短期趋势转弱且宏观压力同步变差。",
    ],
    scoreMethodTitle: "综合评分计算方式",
    scoreMethodTitleZh: "综合评分计算方式",
    scoreMethodZh: localizedScoreMethod,
  });
}

async function loadPersistedState() {
  const [agentState, portfolio, tradeLog, decisionHistory, portfolioHistory] = await Promise.all([
    readJsonIfExists(FILES.state, defaultAgentState()),
    readJsonIfExists(FILES.portfolio, defaultPortfolio()),
    readJsonIfExists(FILES.tradeLog, []),
    readJsonIfExists(FILES.decisionHistory, []),
    readJsonIfExists(FILES.portfolioHistory, []),
  ]);

  const normalizedTradeLog = normalizeTradeLog(tradeLog);
  const inferredInvestedCapitalCny = inferInvestedCapitalFromTrades(normalizedTradeLog);
  const normalizedPortfolio = normalizePortfolio(
    portfolio,
    CONFIG.initialCapital,
    inferredInvestedCapitalCny
  );
  if (!(normalizedPortfolio.investedCapitalCny > 0) && inferredInvestedCapitalCny > 0) {
    normalizedPortfolio.investedCapitalCny = round2(inferredInvestedCapitalCny);
  }

  return {
    agentState,
    portfolio: normalizedPortfolio,
    tradeLog: normalizedTradeLog,
    decisionHistory: Array.isArray(decisionHistory) ? decisionHistory : [],
    portfolioHistory: Array.isArray(portfolioHistory) ? portfolioHistory : [],
  };
}

function decideAndApply(context) {
  const latestDaily = buildLiveDailyContextRow(context.dailyRows.at(-1), context.latest);
  const intradayStats = computeIntradayStats(context.intradayRows);
  const currentPortfolio = normalizePortfolio(context.persisted.portfolio, context.config.initialCapital);
  const currentPrice = round4(context.latest.priceCnyPerGram);
  const processedAlready = context.persisted.agentState.lastProcessedCheckedAt === context.latest.checkedAt;
  const tradingWindow = getWeekendTradingWindowStatus(context.latest.checkedAtLocal);

  const order = processedAlready
    ? buildHoldOrder({
        latest: context.latest,
        reason: "同一条实时快照已经处理过，本次不重复下单，只刷新估值。",
        targetPositionRatio: currentPositionRatio(currentPortfolio, currentPrice, context.config.sellFeePerGram),
        decisionKind: "duplicate-snapshot",
        diagnostics: buildDiagnostics(context.latest, latestDaily, intradayStats),
        backtest: context.backtest,
      })
    : tradingWindow.blocked
      ? buildHoldOrder({
          latest: context.latest,
          reason: tradingWindow.reason,
          targetPositionRatio: currentPositionRatio(currentPortfolio, currentPrice, context.config.sellFeePerGram),
          decisionKind: tradingWindow.decisionKind,
          diagnostics: buildDiagnostics(context.latest, latestDaily, intradayStats),
          backtest: context.backtest,
        })
    : buildRebalanceOrder({
        latest: context.latest,
        portfolio: currentPortfolio,
        currentPrice,
        target: chooseCompositeTargetPositionRatio(context.latest, latestDaily, intradayStats, context.config, {
          currentRatio: currentPositionRatio(currentPortfolio, currentPrice, context.config.sellFeePerGram),
          tradeLog: context.persisted.tradeLog,
        }),
        recentTrade: getLatestTrade(context.persisted.tradeLog),
        config: context.config,
        diagnostics: buildDiagnostics(context.latest, latestDaily, intradayStats),
        backtest: context.backtest,
      });

  const nextPortfolio = applyOrder(currentPortfolio, order, currentPrice, context.config.sellFeePerGram);
  const nextState = {
    lastProcessedCheckedAt: processedAlready ? context.persisted.agentState.lastProcessedCheckedAt : context.latest.checkedAt,
    lastAction: order.action,
    lastDecisionKind: order.decisionKind,
    lastUpdatedAtLocal: context.latest.checkedAtLocal,
    initialCapital: context.config.initialCapital,
    sellFeePerGram: context.config.sellFeePerGram,
  };

  const tradeLog = [...context.persisted.tradeLog];
  if (order.action !== "HOLD") tradeLog.push(order);

  const decisionEntry = {
    checkedAt: context.latest.checkedAt,
    checkedAtLocal: context.latest.checkedAtLocal,
    action: order.action,
    decisionKind: order.decisionKind,
    priceCnyPerGram: order.priceCnyPerGram,
    targetPositionRatio: order.targetPositionRatio,
    reason: order.reason,
  };

  const portfolioEntry = {
    checkedAt: context.latest.checkedAt,
    checkedAtLocal: context.latest.checkedAtLocal,
    priceCnyPerGram: currentPrice,
    cashCny: nextPortfolio.cashCny,
    goldGrams: nextPortfolio.goldGrams,
    equityCny: nextPortfolio.equityCny,
    unrealizedPnlCny: nextPortfolio.unrealizedPnlCny,
    action: order.action,
  };

  return {
    order,
    portfolio: nextPortfolio,
    agentState: nextState,
    tradeLog,
    decisionHistory: appendIfNewSnapshot(context.persisted.decisionHistory, decisionEntry),
    portfolioHistory: appendIfNewSnapshot(context.persisted.portfolioHistory, portfolioEntry),
  };
}

function buildLiveDailyContextRow(latestDaily, latest) {
  if (!latestDaily) return latestDaily;
  const currentPrice = Number(latest?.priceCnyPerGram);
  if (!Number.isFinite(currentPrice)) return latestDaily;
  return {
    ...latestDaily,
    date: typeof latest?.checkedAtLocal === "string" ? latest.checkedAtLocal.slice(0, 10) : latestDaily.date,
    price: currentPrice,
  };
}

function buildRebalanceOrder({ latest, portfolio, currentPrice, target, recentTrade, config, diagnostics, backtest }) {
  const equityBefore = markPortfolio(portfolio, currentPrice, config.sellFeePerGram).equityCny;
  const sellablePrice = Math.max(0, currentPrice - config.sellFeePerGram);
  const currentGoldValue = portfolio.goldGrams * sellablePrice;
  const targetGoldValue = equityBefore * target.ratio;
  const deltaValue = targetGoldValue - currentGoldValue;
  const currentRatio = equityBefore > 0 ? currentGoldValue / equityBefore : 0;
  const rebalanceBuffer = Math.max(
    config.minTradeCny,
    equityBefore * (config.rebalanceBufferRatio || 0),
    portfolio.goldGrams * config.sellFeePerGram
  );

  if (Math.abs(deltaValue) < rebalanceBuffer) {
    return buildHoldOrder({
      latest,
      reason: `${target.reason} 当前仓位与目标仓位差距较小，不执行交易。`,
      targetPositionRatio: target.ratio,
      decisionKind: target.decisionKind,
      diagnostics,
      backtest,
    });
  }

  if (deltaValue > 0) {
    const budget = Math.min(deltaValue, portfolio.cashCny);
    if (budget < config.minTradeCny) {
      return buildHoldOrder({
        latest,
        reason: `${target.reason} 但可用现金不足，暂不加仓。`,
        targetPositionRatio: target.ratio,
        decisionKind: "cash-limited",
        diagnostics,
        backtest,
      });
    }
    const grams = budget / currentPrice;
    return {
      checkedAt: latest.checkedAt,
      checkedAtLocal: latest.checkedAtLocal,
      action: portfolio.goldGrams > 0 ? "BUY_MORE" : "BUY",
      decisionKind: target.decisionKind,
      reason: target.reason,
      priceCnyPerGram: currentPrice,
      amountCny: round2(budget),
      grams: round4(grams),
      realizedPnlCny: null,
      profitable: null,
      targetPositionRatio: round4(target.ratio),
      currentPositionRatio: round4(currentRatio),
      diagnostics,
      backtestSupport: summarizeBacktest(backtest),
    };
  }

  const sellValue = Math.min(Math.abs(deltaValue), portfolio.goldGrams * sellablePrice);
  const grams = sellablePrice > 0 ? Math.min(portfolio.goldGrams, sellValue / sellablePrice) : 0;
  if (grams * sellablePrice < config.minTradeCny) {
    return buildHoldOrder({
      latest,
      reason: `${target.reason} 但本次应减仓金额太小，暂不卖出。`,
      targetPositionRatio: target.ratio,
      decisionKind: "sell-too-small",
      diagnostics,
      backtest,
    });
  }

  const grossPnlCny = grams * (currentPrice - portfolio.averageCostCnyPerGram);
  const realizedPnlCny = grossPnlCny - grams * config.sellFeePerGram;

  if (shouldDelayNormalTrim(target.decisionKind, latest, recentTrade, realizedPnlCny, grams, config)) {
    return buildHoldOrder({
      latest,
      reason: `${target.reason} 但距离上一次买入还太近，暂时不做普通调仓减仓。`,
      targetPositionRatio: currentRatio,
      decisionKind: "cooldown-hold",
      diagnostics,
      backtest,
    });
  }
  if (shouldSkipLowEdgeSell(target.decisionKind, realizedPnlCny, grams, config)) {
    return buildHoldOrder({
      latest,
      reason: `${target.reason} 但这笔普通调仓卖出在扣除手续费后净收益偏低，暂时不卖出。`,
      targetPositionRatio: currentRatio,
      decisionKind: "skip-low-edge-sell",
      diagnostics,
      backtest,
    });
  }
  return {
    checkedAt: latest.checkedAt,
    checkedAtLocal: latest.checkedAtLocal,
    action: target.ratio === 0 ? "SELL_ALL" : "SELL_PART",
    decisionKind: target.decisionKind,
    reason: target.reason,
    priceCnyPerGram: currentPrice,
    holdingAverageCostCnyPerGram: round4(portfolio.averageCostCnyPerGram),
    amountCny: round2(grams * sellablePrice),
    grams: round4(grams),
    sellFeePerGram: config.sellFeePerGram,
    sellFeeCny: round2(grams * config.sellFeePerGram),
    grossProceedsCny: round2(grams * currentPrice),
    netProceedsCny: round2(grams * sellablePrice),
    grossPnlCny: round2(grossPnlCny),
    netPnlCny: round2(realizedPnlCny),
    realizedPnlCny: round2(realizedPnlCny),
    profitable: realizedPnlCny > 0,
    targetPositionRatio: round4(target.ratio),
    currentPositionRatio: round4(currentRatio),
    diagnostics,
    backtestSupport: summarizeBacktest(backtest),
  };
}

function applyOrder(portfolio, order, currentPrice, sellFeePerGram) {
  let cashCny = portfolio.cashCny;
  let goldGrams = portfolio.goldGrams;
  let averageCost = portfolio.averageCostCnyPerGram;
  let investedCapitalCny = Number.isFinite(portfolio.investedCapitalCny) ? portfolio.investedCapitalCny : 0;

  if (order.action === "BUY" || order.action === "BUY_MORE") {
    const totalCost = goldGrams * (averageCost || 0) + order.amountCny;
    goldGrams += order.grams;
    cashCny -= order.amountCny;
    averageCost = goldGrams > 0 ? totalCost / goldGrams : null;
    investedCapitalCny += order.amountCny;
  } else if (order.action === "SELL_PART" || order.action === "SELL_ALL") {
    const soldRatio = goldGrams > 0 ? order.grams / goldGrams : 0;
    investedCapitalCny = Math.max(0, investedCapitalCny * (1 - soldRatio));
    goldGrams = Math.max(0, goldGrams - order.grams);
    cashCny += order.amountCny;
    if (goldGrams === 0) averageCost = null;
  }

  return markPortfolio({
    initialCapital: portfolio.initialCapital,
    cashCny: round2(cashCny),
    goldGrams: round4(goldGrams),
    averageCostCnyPerGram: averageCost ? round4(averageCost) : null,
    investedCapitalCny: round2(investedCapitalCny),
  }, currentPrice, sellFeePerGram);
}

function markPortfolio(portfolio, currentPrice, sellFeePerGram) {
  const exitPriceCnyPerGram = Math.max(0, currentPrice - sellFeePerGram);
  const investedCapitalCny = Number.isFinite(portfolio.investedCapitalCny)
    ? portfolio.investedCapitalCny
    : portfolio.goldGrams * (portfolio.averageCostCnyPerGram || 0);
  const goldMarketValueCny = portfolio.goldGrams * exitPriceCnyPerGram;
  const equityCny = portfolio.cashCny + goldMarketValueCny;
  const netTotalPnlCny = equityCny - portfolio.initialCapital;
  const unrealizedPnlCny = goldMarketValueCny - investedCapitalCny;
  return {
    initialCapital: portfolio.initialCapital,
    cashCny: round2(portfolio.cashCny),
    goldGrams: round4(portfolio.goldGrams),
    averageCostCnyPerGram: portfolio.averageCostCnyPerGram ? round4(portfolio.averageCostCnyPerGram) : null,
    investedCapitalCny: round2(investedCapitalCny),
    currentPriceCnyPerGram: round4(currentPrice),
    markPriceCnyPerGramAfterExitFee: round4(exitPriceCnyPerGram),
    goldMarketValueCny: round2(goldMarketValueCny),
    costBasisCny: round2(investedCapitalCny),
    equityCny: round2(equityCny),
    unrealizedPnlCny: round2(unrealizedPnlCny),
    netTotalPnlCny: round2(netTotalPnlCny),
    totalPnlCny: round2(netTotalPnlCny),
  };
}

function buildHoldOrder({ latest, reason, targetPositionRatio, decisionKind, diagnostics, backtest }) {
  return {
    checkedAt: latest.checkedAt,
    checkedAtLocal: latest.checkedAtLocal,
    action: "HOLD",
    decisionKind,
    reason,
    priceCnyPerGram: round4(latest.priceCnyPerGram),
    amountCny: 0,
    grams: 0,
    realizedPnlCny: null,
    profitable: null,
    targetPositionRatio: round4(targetPositionRatio),
    diagnostics,
    backtestSupport: summarizeBacktest(backtest),
  };
}

function buildDiagnostics(latest, latestDaily, intradayStats) {
  const profile = buildCompositeSignalProfile(latest, latestDaily, intradayStats, CONFIG);
  return {
    latestHighFrequencyAdvice: latest.highFrequencyAdvice,
    latestDailyAdvice: latest.dailyAdvice,
    dailyContextDate: latestDaily?.date ?? null,
    dailyContextPrice: Number.isFinite(latestDaily?.price) ? round4(latestDaily.price) : null,
    cnGoldEtfClose: Number.isFinite(latestDaily?.cnGoldEtfClose) ? round4(latestDaily.cnGoldEtfClose) : null,
    cnGoldEtfRoc20: Number.isFinite(latestDaily?.cnGoldEtfRoc20) ? round4(latestDaily.cnGoldEtfRoc20) : null,
    cnGoldEtfTurnoverRatio20: Number.isFinite(latestDaily?.cnGoldEtfTurnoverRatio20) ? round4(latestDaily.cnGoldEtfTurnoverRatio20) : null,
    cnGoldEtfAltClose: Number.isFinite(latestDaily?.cnGoldEtfAltClose) ? round4(latestDaily.cnGoldEtfAltClose) : null,
    cnGoldEtfAltRoc20: Number.isFinite(latestDaily?.cnGoldEtfAltRoc20) ? round4(latestDaily.cnGoldEtfAltRoc20) : null,
    cnGoldEtfAltTurnoverRatio20: Number.isFinite(latestDaily?.cnGoldEtfAltTurnoverRatio20) ? round4(latestDaily.cnGoldEtfAltTurnoverRatio20) : null,
    shfeAuMainClose: Number.isFinite(latestDaily?.shfeAuMainClose) ? round4(latestDaily.shfeAuMainClose) : null,
    shfeAuMainRoc20: Number.isFinite(latestDaily?.shfeAuMainRoc20) ? round4(latestDaily.shfeAuMainRoc20) : null,
    shfeAuMainVolumeRatio20: Number.isFinite(latestDaily?.shfeAuMainVolumeRatio20) ? round4(latestDaily.shfeAuMainVolumeRatio20) : null,
    shfeSpotPremiumCnyPerGram: Number.isFinite(latestDaily?.shfeSpotPremiumCnyPerGram) ? round4(latestDaily.shfeSpotPremiumCnyPerGram) : null,
    intradaySma24: intradayStats.sma24 ? round4(intradayStats.sma24) : null,
    intradayPremiumToSma24: Number.isFinite(profile.intradayPremiumToSma24) ? round4(profile.intradayPremiumToSma24) : null,
    intradayLatestAtLocal: intradayStats.latestTimestampLocal ?? null,
    intradayRecentLow: Number.isFinite(intradayStats.recentLow) ? round4(intradayStats.recentLow) : null,
    reboundFromRecentLowPct: Number.isFinite(profile.reboundFromRecentLowPct) ? round4(profile.reboundFromRecentLowPct) : null,
    bullishDaily: isBullishDailySetup(latestDaily),
    crossDown: isCrossDown(latestDaily),
    compositeScore: profile.score,
    trendScore: profile.trendScore,
    macroScore: profile.macroScore,
    intradayScore: profile.intradayScore,
    adviceScore: profile.adviceScore,
    trendNormalized: Number.isFinite(profile.trendNormalized) ? round4(profile.trendNormalized) : null,
    intradayNormalized: Number.isFinite(profile.intradayNormalized) ? round4(profile.intradayNormalized) : null,
    adviceNormalized: Number.isFinite(profile.adviceNormalized) ? round4(profile.adviceNormalized) : null,
    sharpDropDefense: profile.sharpDropDefense,
    sharpDropRebound: profile.sharpDropRebound,
    drawdownRiskOff: profile.drawdownRiskOff,
    summary: profile.summary,
  };
}

function chooseCompositeTargetPositionRatio(latest, latestDaily, intradayStats, config, options = {}) {
  const profile = buildCompositeSignalProfile(latest, latestDaily, intradayStats, config);
  return chooseTargetPositionFromProfile(profile, config, {
    currentRatio: options.currentRatio,
    tradeLog: options.tradeLog,
    latest,
  });
}

function buildCompositeSignalProfile(latest, latestDaily, intradayStats, config = CONFIG) {
  const trendScore = scoreTrend(latestDaily);
  const macroScore = scoreMacro(latestDaily, config);
  const intradayScore = scoreIntraday(latest, intradayStats);
  const adviceScore = scoreAdvice(latest);
  const crossDown = isCrossDown(latestDaily);
  const intradayPremiumToSma24 = Number.isFinite(intradayStats.sma24)
    ? latest.priceCnyPerGram / intradayStats.sma24 - 1
    : null;
  const reboundFromRecentLowPct = Number.isFinite(intradayStats.recentLow) && intradayStats.recentLow > 0
    ? latest.priceCnyPerGram / intradayStats.recentLow - 1
    : null;
  const priceVsSma20 = latestDaily && Number.isFinite(latestDaily.sma20) ? latestDaily.price / latestDaily.sma20 - 1 : null;
  const priceVsSma60 = latestDaily && Number.isFinite(latestDaily.sma60) ? latestDaily.price / latestDaily.sma60 - 1 : null;
  const priceVsRecentHigh5 = latestDaily && Number.isFinite(latestDaily.recentHigh5) && latestDaily.recentHigh5 > 0
    ? latestDaily.price / latestDaily.recentHigh5 - 1
    : null;
  const etfPrimaryStrong = Boolean(
    latestDaily
      && Number.isFinite(latestDaily.cnGoldEtfRoc20)
      && latestDaily.cnGoldEtfRoc20 >= config.cnEtfStrongRoc20Pct
      && Number.isFinite(latestDaily.cnGoldEtfClose)
      && Number.isFinite(latestDaily.cnGoldEtfSma20)
      && latestDaily.cnGoldEtfClose >= latestDaily.cnGoldEtfSma20 * config.cnEtfPriceSupportPct
  );
  const etfAltStrong = Boolean(
    latestDaily
      && Number.isFinite(latestDaily.cnGoldEtfAltRoc20)
      && latestDaily.cnGoldEtfAltRoc20 >= config.cnEtfAltStrongRoc20Pct
      && Number.isFinite(latestDaily.cnGoldEtfAltClose)
      && Number.isFinite(latestDaily.cnGoldEtfAltSma20)
      && latestDaily.cnGoldEtfAltClose >= latestDaily.cnGoldEtfAltSma20 * config.cnEtfPriceSupportPct
  );
  const shfeStrong = Boolean(
    latestDaily
      && Number.isFinite(latestDaily.shfeAuMainRoc20)
      && latestDaily.shfeAuMainRoc20 >= config.shfeStrongRoc20Pct
      && Number.isFinite(latestDaily.shfeAuMainVolumeRatio20)
      && latestDaily.shfeAuMainVolumeRatio20 >= config.shfeStrongVolumeRatio20
      && Number.isFinite(latestDaily.shfeSpotPremiumCnyPerGram)
      && latestDaily.shfeSpotPremiumCnyPerGram >= config.shfeStrongPremiumCny
  );
  const domesticStrongCount = [etfPrimaryStrong, etfAltStrong, shfeStrong].filter(Boolean).length;
  const etfPrimaryWeak = Boolean(
    latestDaily
      && Number.isFinite(latestDaily.cnGoldEtfRoc20)
      && latestDaily.cnGoldEtfRoc20 <= config.cnEtfWeakRoc20Pct
  );
  const etfAltWeak = Boolean(
    latestDaily
      && Number.isFinite(latestDaily.cnGoldEtfAltRoc20)
      && latestDaily.cnGoldEtfAltRoc20 <= config.cnEtfAltWeakRoc20Pct
  );
  const shfeWeak = Boolean(
    latestDaily
      && (
        (Number.isFinite(latestDaily.shfeAuMainRoc20) && latestDaily.shfeAuMainRoc20 <= config.shfeWeakRoc20Pct)
        || (
          Number.isFinite(latestDaily.shfeAuMainVolumeRatio20)
          && latestDaily.shfeAuMainVolumeRatio20 >= config.shfeRiskOffVolumeRatio20
          && Number.isFinite(latestDaily.shfeSpotPremiumCnyPerGram)
          && latestDaily.shfeSpotPremiumCnyPerGram <= config.shfeWeakPremiumCny
        )
      )
  );
  const domesticWeakCount = [etfPrimaryWeak, etfAltWeak, shfeWeak].filter(Boolean).length;
  const weakDomesticFlow = Boolean(
    latestDaily
      && (
        domesticWeakCount >= 3
        || (
          domesticWeakCount >= 2
          && Number.isFinite(latestDaily.shfeSpotPremiumCnyPerGram)
          && latestDaily.shfeSpotPremiumCnyPerGram <= config.shfeWeakPremiumCny
        )
      )
  );
  const strongDomesticFlow = domesticStrongCount >= 2;
  const longTrendBroken = Boolean(
    latestDaily
      && Number.isFinite(latestDaily.sma200)
      && latestDaily.price < latestDaily.sma200 * config.longTrendExitPct
  );
  const flowRiskOff = Boolean(
    latestDaily
      && Number.isFinite(priceVsSma60)
      && priceVsSma60 <= config.flowRiskOffPriceBelowSma60Pct - 1
      && weakDomesticFlow
      && Number.isFinite(latestDaily.shfeSpotPremiumCnyPerGram)
      && latestDaily.shfeSpotPremiumCnyPerGram <= config.shfeWeakPremiumCny
  );
  const drawdownRiskOff = Boolean(
    latestDaily
      && !longTrendBroken
      && Number.isFinite(priceVsSma20)
      && Number.isFinite(priceVsSma60)
      && priceVsSma20 <= config.drawdownRiskOffPriceBelowSma20Pct - 1
      && priceVsSma60 <= config.drawdownRiskOffPriceBelowSma60Pct - 1
  );
  const peakRolloverRiskOff = Boolean(
    latestDaily
      && !longTrendBroken
      && Number.isFinite(priceVsRecentHigh5)
      && Number.isFinite(intradayPremiumToSma24)
      && priceVsRecentHigh5 <= config.peakRolloverRiskOffPriceBelowRecentHigh5Pct - 1
      && intradayPremiumToSma24 <= config.peakRolloverRiskOffIntradayPremiumPct
  );
  const peakRolloverSevere = Boolean(
    latestDaily
      && !longTrendBroken
      && Number.isFinite(priceVsRecentHigh5)
      && priceVsRecentHigh5 <= config.peakRolloverSeverePriceBelowRecentHigh5Pct - 1
  );
  const trendNormalized = (() => {
    if (!latestDaily) return 0;
    if (longTrendBroken) return -1;
    const raw = clamp((trendScore - 19) / 19, -1, 1);
    if (crossDown && raw > 0.45) return 0.4;
    return raw;
  })();
  const domesticNormalized = (() => {
    if (weakDomesticFlow) return -0.18;
    if (strongDomesticFlow) return 0.06;
    return clamp((macroScore - 5) / 5, -0.05, 0.08);
  })();
  const intradayNormalized = 0;
  const adviceNormalized = 0;
  const score = clamp(
    Math.round(
      50
      + trendNormalized * 32
      + domesticNormalized * 2
    ),
    0,
    100
  );
  const hardExit = Boolean(
    longTrendBroken
      || (
        crossDown
        && Number.isFinite(priceVsSma20)
        && priceVsSma20 <= -0.025
        && Number.isFinite(priceVsSma60)
        && priceVsSma60 <= -0.015
        && (score < config.scoreExitThreshold || weakDomesticFlow)
      )
  );
  const sharpDropDefense = config.enableSharpDropTacticalRules
    && !hardExit
    && Number.isFinite(intradayPremiumToSma24)
    && Number.isFinite(priceVsSma20)
    && Number.isFinite(priceVsSma60)
    && intradayPremiumToSma24 <= config.sharpDropDefenseIntradayPremiumPct
    && latestDaily.price <= latestDaily.sma20 * config.sharpDropDefenseDailySma20Pct
    && latestDaily.price <= latestDaily.sma60 * config.sharpDropDefenseDailySma60Pct
    && weakDomesticFlow;
  const sharpDropRebound = config.enableSharpDropTacticalRules
    && !hardExit
    && !sharpDropDefense
    && Number.isFinite(reboundFromRecentLowPct)
    && reboundFromRecentLowPct >= config.sharpDropReboundRecoveryPct
    && Number.isFinite(intradayStats.sma24)
    && latest.priceCnyPerGram >= intradayStats.sma24 * config.sharpDropReboundNeedAboveSma24Pct
    && Number.isFinite(latestDaily?.sma20)
    && latestDaily.price <= latestDaily.sma20 * config.sharpDropReboundDailySma20Pct;

  return {
    score,
    trendScore,
    macroScore,
    intradayScore,
    adviceScore,
      trendNormalized,
      intradayNormalized,
      domesticNormalized,
      adviceNormalized,
      crossDown,
      longTrendBroken,
      weakDomesticFlow,
      strongDomesticFlow,
      domesticStrongCount,
      domesticWeakCount,
      flowRiskOff,
      drawdownRiskOff,
      peakRolloverRiskOff,
      peakRolloverSevere,
      hardExit,
    intradayPremiumToSma24,
    reboundFromRecentLowPct,
    priceVsRecentHigh5,
    sharpDropDefense,
      sharpDropRebound,
      summary: [
        trendScore >= 30 ? "日线趋势偏强" : trendScore >= 18 ? "日线趋势中性" : "日线趋势偏弱",
        strongDomesticFlow ? "国内资金确认偏强" : weakDomesticFlow ? "国内资金偏弱" : macroScore >= 7 ? "国内资金中性" : "国内资金偏弱",
        sharpDropDefense ? "急跌防守触发" : sharpDropRebound ? "急跌后正在修复" : intradayScore >= 10 ? "盘中位置不高" : intradayScore >= 6 ? "盘中位置中性" : "盘中过热或偏弱",
        adviceScore >= 2 ? "追踪建议偏多" : adviceScore >= 1 ? "追踪建议中性" : "追踪建议谨慎",
      ].join("，"),
    };
  }

function chooseTargetPositionFromProfile(profile, config, options = {}) {
  const currentRatio = Number.isFinite(options.currentRatio) ? options.currentRatio : 0;
  const recentRiskOffSell = getLatestTradeMatching(
    options.tradeLog,
    (trade) => isSellAction(trade?.action) && isRiskOffDecisionKind(trade?.decisionKind)
  );

  if (profile.hardExit) {
    return {
      ratio: 0,
      decisionKind: "exit",
      reason: `综合评分 ${profile.score} 分，${profile.summary}，风险条件已触发，目标仓位降至 0%。`,
      profile,
    };
  }

  if (profile.sharpDropDefense) {
    const defenseRatio = Math.min(currentRatio, config.sharpDropDefenseRatio);
    return {
      ratio: defenseRatio,
      decisionKind: "sharp-drop-defense",
      reason: `综合评分 ${profile.score} 分，${profile.summary}，急跌防守条件已触发，先降到防守仓。`,
      profile,
    };
  }

  if (shouldHoldDefensePosition(profile, options.latest, recentRiskOffSell, config)) {
    const defenseRatio = Math.min(currentRatio, config.sharpDropDefenseRatio);
    return {
      ratio: defenseRatio,
      decisionKind: "post-defense-hold",
      reason: `综合评分 ${profile.score} 分，${profile.summary}，急跌防守后仍处于确认期，先维持防守仓等待重新确认。`,
      profile,
    };
  }

  const rawBand = chooseScoreBand(profile, config);
  const currentBand = inferPositionBand(currentRatio, config);
  const stableBand = applyFlowAwareBandCap(
    stabilizeScoreBand(rawBand, currentBand, profile.score, config),
    profile,
    config
  );
  return {
    ratio: stableBand.ratio,
    decisionKind: stableBand.decisionKind,
    reason: `综合评分 ${profile.score} 分，${profile.summary}，${stableBand.reasonSuffix}`,
    profile,
  };
}

function shouldHoldDefensePosition(profile, latest, recentRiskOffSell, config) {
  if (profile.hardExit || !latest || !recentRiskOffSell) return false;
  if (canRebuildAfterDefense(profile, latest, recentRiskOffSell, config)) return false;
  const hoursSinceRiskOff = diffHours(recentRiskOffSell.checkedAt, latest.checkedAt);
  return Number.isFinite(hoursSinceRiskOff) && hoursSinceRiskOff < config.reentryCooldownHoursAfterDefense;
}

function canRebuildAfterDefense(profile, latest, recentRiskOffSell, config) {
  if (!latest || !recentRiskOffSell || !profile.sharpDropRebound) return false;
  const hoursSinceRiskOff = diffHours(recentRiskOffSell.checkedAt, latest.checkedAt);
  if (!Number.isFinite(hoursSinceRiskOff) || hoursSinceRiskOff < 0 || hoursSinceRiskOff > config.reentryCooldownHoursAfterDefense) {
    return false;
  }
  return profile.score >= config.reentryNeedScoreAfterDefense
    && profile.adviceScore >= config.reentryNeedAdviceScoreAfterDefense;
}

function chooseScoreBand(profile, config) {
  if (profile.score >= config.scoreStrongThreshold) {
    return {
      id: "strong",
      threshold: config.scoreStrongThreshold,
      ratio: config.targetRatioStrong,
      decisionKind: "add-long",
      reasonSuffix: "进入强势仓位。",
    };
  }
  if (profile.score >= config.scoreBalancedThreshold) {
    return {
      id: "balanced",
      threshold: config.scoreBalancedThreshold,
      ratio: config.targetRatioBalanced,
      decisionKind: "balanced-long",
      reasonSuffix: "维持中等偏积极仓位。",
    };
  }
  if (profile.score >= config.scoreProbeThreshold) {
    return {
      id: "probe",
      threshold: config.scoreProbeThreshold,
      ratio: config.targetRatioProbe,
      decisionKind: "probe-long",
      reasonSuffix: "保留试探仓。",
    };
  }
  if (profile.score >= config.scoreExitThreshold) {
    return {
      id: "cautious",
      threshold: config.scoreExitThreshold,
      ratio: config.targetRatioCautious,
      decisionKind: "cautious-hold",
      reasonSuffix: "收缩到轻仓观察。",
    };
  }
  return {
    id: "stand-aside",
    threshold: 0,
    ratio: 0,
    decisionKind: "stand-aside",
    reasonSuffix: "暂时空仓等待。",
  };
}

function applyFlowAwareBandCap(band, profile, config) {
  if (!band || !profile) return band;
  if (profile.peakRolloverSevere) {
    if (band.id === "strong") {
      return chooseScoreBand({ score: config.scoreProbeThreshold }, config);
    }
    if (band.id === "balanced") {
      return chooseScoreBand({ score: config.scoreExitThreshold }, config);
    }
    return band;
  }
  if (profile.peakRolloverRiskOff) {
    if (band.id === "strong") {
      return chooseScoreBand({ score: config.scoreBalancedThreshold }, config);
    }
    if (band.id === "balanced") {
      return chooseScoreBand({ score: config.scoreProbeThreshold }, config);
    }
    return band;
  }
  if (profile.weakDomesticFlow) {
    if (band.id === "strong") {
      return chooseScoreBand({ score: config.scoreBalancedThreshold }, config);
    }
    if (band.id === "balanced" && profile.flowRiskOff) {
      return chooseScoreBand({ score: config.scoreProbeThreshold }, config);
    }
    return band;
  }
  if (profile.drawdownRiskOff) {
    if (band.id === "strong") {
      return chooseScoreBand({ score: config.scoreProbeThreshold }, config);
    }
    if (band.id === "balanced") {
      return chooseScoreBand({ score: config.scoreExitThreshold }, config);
    }
  }
  return band;
}

function inferPositionBand(currentRatio, config) {
  const cautiousBoundary = config.targetRatioCautious / 2;
  const probeBoundary = (config.targetRatioCautious + config.targetRatioProbe) / 2;
  const balancedBoundary = (config.targetRatioProbe + config.targetRatioBalanced) / 2;
  const strongBoundary = (config.targetRatioBalanced + config.targetRatioStrong) / 2;
  if (currentRatio >= strongBoundary) return chooseScoreBand({ score: config.scoreStrongThreshold }, config);
  if (currentRatio >= balancedBoundary) return chooseScoreBand({ score: config.scoreBalancedThreshold }, config);
  if (currentRatio >= probeBoundary) return chooseScoreBand({ score: config.scoreProbeThreshold }, config);
  if (currentRatio >= cautiousBoundary) return chooseScoreBand({ score: config.scoreExitThreshold }, config);
  return chooseScoreBand({ score: -1 }, config);
}

function stabilizeScoreBand(rawBand, currentBand, score, config) {
  if (!rawBand || !currentBand || rawBand.id === currentBand.id) return rawBand;
  const rank = {
    "stand-aside": 0,
    cautious: 1,
    probe: 2,
    balanced: 3,
    strong: 4,
  };
  const rawRank = rank[rawBand.id] ?? 0;
  const currentRank = rank[currentBand.id] ?? 0;
  if (rawRank > currentRank) {
    const upgradeThreshold = rawBand.threshold + config.bandUpgradeMarginPoints;
    return score >= upgradeThreshold ? rawBand : currentBand;
  }
  const holdThreshold = currentBand.threshold - config.bandDowngradeMarginPoints;
  return score < holdThreshold ? rawBand : currentBand;
}

function shouldSkipLowEdgeSell(decisionKind, realizedPnlCny, grams, config) {
  if (isRiskOffDecisionKind(decisionKind) || !Number.isFinite(realizedPnlCny) || !Number.isFinite(grams) || grams <= 0) {
    return false;
  }
  return realizedPnlCny < config.minNetTrimPnlCny
    || realizedPnlCny / grams < config.minNetTrimPnlPerGram;
}

function shouldDelayNormalTrim(decisionKind, latest, recentTrade, realizedPnlCny, grams, config) {
  if (isRiskOffDecisionKind(decisionKind) || !recentTrade || !isBuyAction(recentTrade.action)) {
    return false;
  }
  if (canBypassTrimCooldown(realizedPnlCny, grams, config)) {
    return false;
  }
  const hoursSinceTrade = diffHours(recentTrade.checkedAt, latest.checkedAt);
  return Number.isFinite(hoursSinceTrade) && hoursSinceTrade < config.minHoursBeforeNormalTrim;
}

function canBypassTrimCooldown(realizedPnlCny, grams, config) {
  if (!Number.isFinite(realizedPnlCny) || !Number.isFinite(grams) || grams <= 0) {
    return false;
  }
  return realizedPnlCny >= config.cooldownBypassNetTrimPnlCny
    && realizedPnlCny / grams >= config.cooldownBypassNetTrimPnlPerGram;
}

function isRiskOffDecisionKind(decisionKind) {
  return decisionKind === "exit"
    || decisionKind === "stand-aside"
    || decisionKind === "sharp-drop-defense";
}

function getLatestTrade(trades) {
  return Array.isArray(trades) && trades.length > 0 ? trades[trades.length - 1] : null;
}

function getLatestTradeMatching(trades, predicate) {
  if (!Array.isArray(trades) || trades.length === 0) return null;
  for (let index = trades.length - 1; index >= 0; index -= 1) {
    const trade = trades[index];
    if (predicate(trade)) return trade;
  }
  return null;
}

function diffHours(fromIso, toIso) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return (to - from) / 3600000;
}

function scoreTrend(row) {
  if (!row || !Number.isFinite(row.price) || !Number.isFinite(row.sma20) || !Number.isFinite(row.sma60) || !Number.isFinite(row.sma200)) return 0;
  let score = 0;
  if (row.price > row.sma200) score += 16;
  if (row.sma60 > row.sma200) score += 6;
  if (row.sma20 > row.sma60) score += 8;
  if (row.price > row.sma20) score += 4;
  if (Number.isFinite(row.prevSma20) && row.sma20 > row.prevSma20) score += 2;
  if (Number.isFinite(row.prevSma60) && row.sma60 > row.prevSma60) score += 2;
  if (row.price < row.sma60 * 0.985) score -= 8;
  if (row.price < row.sma200 * 0.995) score -= 12;
  return clamp(score, 0, 38);
}

function scoreMacro(row, config = CONFIG) {
  if (!row) return 0;
  let score = 6;
  const etfPrimaryStrong = Number.isFinite(row.cnGoldEtfRoc20)
    && row.cnGoldEtfRoc20 >= config.cnEtfStrongRoc20Pct
    && Number.isFinite(row.cnGoldEtfClose)
    && Number.isFinite(row.cnGoldEtfSma20)
    && row.cnGoldEtfClose >= row.cnGoldEtfSma20 * config.cnEtfPriceSupportPct;
  const etfAltStrong = Number.isFinite(row.cnGoldEtfAltRoc20)
    && row.cnGoldEtfAltRoc20 >= config.cnEtfAltStrongRoc20Pct
    && Number.isFinite(row.cnGoldEtfAltClose)
    && Number.isFinite(row.cnGoldEtfAltSma20)
    && row.cnGoldEtfAltClose >= row.cnGoldEtfAltSma20 * config.cnEtfPriceSupportPct;
  const shfeStrong = Number.isFinite(row.shfeAuMainRoc20)
    && row.shfeAuMainRoc20 >= config.shfeStrongRoc20Pct
    && Number.isFinite(row.shfeAuMainClose)
    && Number.isFinite(row.shfeAuMainSma20)
    && row.shfeAuMainClose >= row.shfeAuMainSma20
    && Number.isFinite(row.shfeSpotPremiumCnyPerGram)
    && row.shfeSpotPremiumCnyPerGram >= config.shfeStrongPremiumCny;
  const domesticStrongCount = [etfPrimaryStrong, etfAltStrong, shfeStrong].filter(Boolean).length;
  if (domesticStrongCount >= 2) score += 2;
  else if (domesticStrongCount === 1) score += 1;

  const domesticRiskOff = Number.isFinite(row.shfeSpotPremiumCnyPerGram)
    && row.shfeSpotPremiumCnyPerGram <= config.shfeWeakPremiumCny
    && Number.isFinite(row.shfeAuMainVolumeRatio20)
    && row.shfeAuMainVolumeRatio20 >= config.shfeRiskOffVolumeRatio20
    && Number.isFinite(row.shfeAuMainRoc20)
    && row.shfeAuMainRoc20 < 0;
  if (domesticRiskOff) score -= 2;

  if (Number.isFinite(row.uupRoc20)) score += row.uupRoc20 < -0.02 ? 1 : row.uupRoc20 > 0.05 ? -1 : 0;
  if (Number.isFinite(row.realYield10Y)) score += row.realYield10Y < 1.55 ? 1 : row.realYield10Y > 2.4 ? -1 : 0;
  return clamp(score, 0, 10);
}

function scoreIntraday(latest, intradayStats) {
  if (!latest || !Number.isFinite(latest.priceCnyPerGram) || !Number.isFinite(intradayStats.sma24)) return 8;
  const premium = latest.priceCnyPerGram / intradayStats.sma24 - 1;
  if (premium <= -0.0035) return 14;
  if (premium <= 0.003) return 10;
  if (premium <= 0.007) return 6;
  return 2;
}

function scoreAdvice(latest) {
  const adviceText = `${latest?.highFrequencyAdvice || ""} ${latest?.dailyAdvice || ""} ${latest?.direction || ""}`;
  let score = 1;
  if (adviceText.includes("中线偏多")) score += 1;
  if (adviceText.includes("偏多") || adviceText.includes("强势")) score += 1;
  if (adviceText.includes("观望") || adviceText.includes("等待确认")) score -= 1;
  if (adviceText.includes("偏空") || adviceText.includes("转弱")) score -= 1;
  return clamp(score, 0, 2);
}

function buildDashboardData({ latest, dailyRows, intradayRows, intradayTape, backtest, liveDecision, tradeLog, decisionHistory, portfolioHistory }) {
  const chartSeries = mergeChartSeries(dailyRows, intradayRows, intradayTape, latest);
  const normalizedTrades = normalizeTradeLog(tradeLog);
  const normalizedChartSeries = sampleDashboardSeries(chartSeries.map((row) => ({
    time: row.timestampLocal,
    date: row.timestampLocal.slice(0, 10),
    priceCnyPerGram: round4(row.price),
  })));
  const totalFeesCny = calculateTotalFees(normalizedTrades, CONFIG.sellFeePerGram);
  const summary = buildPortfolioSummary(liveDecision.portfolio, totalFeesCny, liveDecision.order.action);

  const tradeMarkers = normalizedTrades
    .map((trade) => toMarker(trade, normalizedChartSeries, "live"))
    .filter((item) => item.time && Number.isFinite(item.priceCnyPerGram));

  return {
    generatedAt: latest.checkedAt,
    latest,
    strategy: STRATEGY,
    strategyHistory: STRATEGY_HISTORY,
    backtest,
    summary,
    chart: {
      series: normalizedChartSeries,
      tradeMarkers,
      averageCostLine: Number.isFinite(liveDecision.portfolio.averageCostCnyPerGram)
        ? {
            label: "持仓成本",
            value: round4(liveDecision.portfolio.averageCostCnyPerGram),
          }
        : null,
    },
    trades: normalizedTrades,
    decisions: decisionHistory.slice(-50),
    portfolioHistory: portfolioHistory.slice(-200),
  };
}

function buildReport({ latest, backtest, liveDecision }) {
  return `# 虚拟黄金投资报告

## 项目状态

- 本项目已改为可重复运行的持仓续管版 agent。
- 每次运行都会读取最新黄金追踪数据，判断加仓、减仓或继续持有。
- 相同实时快照不会重复下单，只会刷新组合估值。

## 当前策略

- 版本：${STRATEGY.version}
- 名称：${STRATEGY.name}
- 核心思路：${STRATEGY.description}
- 买入条件：${STRATEGY.buyRule.join("；")}
- 卖出条件：${STRATEGY.sellRule.join("；")}
- 成本假设：买入 0 手续费，卖出 ${CONFIG.sellFeePerGram} 元/克。

## 策略版本记录

${STRATEGY_HISTORY.versions.map((item) => `- ${item.version}：${item.title}。更新内容：${item.changes.join("；")}。原因：${item.reason}`).join("\n")}

## 回测结果

- 样本区间：${backtest.sampleStart} 到 ${backtest.sampleEnd}
- 初始资金：${backtest.initialCapital} 元
- 期末权益：${backtest.finalEquity} 元
- 总收益率：${toPct(backtest.totalReturnPct)}
- 最大回撤：${toPct(backtest.maxDrawdownPct)}
- 交易次数：${backtest.tradeCount}
- 是否盈利：${backtest.profitable ? "是" : "否"}
- 买入并持有期末权益：${backtest.buyAndHoldEquity} 元

## 当前组合

- 最新时间：${latest.checkedAtLocal}
- 最新操作：${liveDecision.order.action}
- 现金：${liveDecision.portfolio.cashCny} 元
- 持有黄金：${liveDecision.portfolio.goldGrams} 克
- 黄金市值：${liveDecision.portfolio.goldMarketValueCny} 元
- 组合权益：${liveDecision.portfolio.equityCny} 元
- 总净盈亏：${liveDecision.portfolio.netTotalPnlCny} 元
- 持仓浮盈亏：${liveDecision.portfolio.unrealizedPnlCny} 元
- 决策原因：${liveDecision.order.reason}

## 可视化文件

- dashboard 数据：${FILES.dashboardData}
- 组合快照：${FILES.portfolio}
- 组合历史：${FILES.portfolioHistory}
- 交易记录：${FILES.tradeLog}
- 决策记录：${FILES.decisionHistory}
- 策略版本：${FILES.strategyHistory}
`;
}

function runBacktest(rows, config) {
  let cash = config.initialCapital;
  let goldGrams = 0;
  let averageCost = null;
  let maxEquity = config.initialCapital;
  let maxDrawdown = 0;
  const trades = [];

  for (let i = 200; i < rows.length; i += 1) {
    const row = rows[i];
    const decision = chooseBacktestDecision(row, config);
    const targetRatio = decision.ratio;
    if (goldGrams === 0 && targetRatio > 0.2) {
      goldGrams = cash / row.price;
      averageCost = row.price;
      trades.push({
        checkedAt: `${row.date}T00:00:00.000Z`,
        checkedAtLocal: row.date,
        action: "BUY",
        reason: decision.reason,
        priceCnyPerGram: round4(row.price),
        grams: round4(goldGrams),
        amountCny: round2(cash),
        profitable: null,
      });
      cash = 0;
    } else if (goldGrams > 0 && targetRatio === 0) {
      const amountCny = goldGrams * Math.max(0, row.price - config.sellFeePerGram);
      const realizedPnlCny = goldGrams * (row.price - config.sellFeePerGram - averageCost);
      trades.push({
        checkedAt: `${row.date}T00:00:00.000Z`,
        checkedAtLocal: row.date,
        action: "SELL",
        reason: decision.reason,
        priceCnyPerGram: round4(row.price),
        grams: round4(goldGrams),
        amountCny: round2(amountCny),
        realizedPnlCny: round2(realizedPnlCny),
        profitable: realizedPnlCny > 0,
      });
      cash = amountCny;
      goldGrams = 0;
      averageCost = null;
    }

    const equity = cash + goldGrams * Math.max(0, row.price - config.sellFeePerGram);
    maxEquity = Math.max(maxEquity, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / maxEquity - 1);
  }

  const finalPrice = rows.at(-1).price;
  const finalEquity = cash + goldGrams * Math.max(0, finalPrice - config.sellFeePerGram);
  const startDate = rows[200]?.date ?? rows[0]?.date ?? null;
  const endDate = rows.at(-1)?.date ?? null;
  const buyAndHold = rows[200]
    ? (config.initialCapital / rows[200].price) * Math.max(0, finalPrice - config.sellFeePerGram)
    : config.initialCapital;

  return {
    strategy: STRATEGY.id,
    version: STRATEGY.version,
    sampleStart: startDate,
    sampleEnd: endDate,
    initialCapital: config.initialCapital,
    finalEquity: round2(finalEquity),
    totalReturnPct: round4(finalEquity / config.initialCapital - 1),
    maxDrawdownPct: round4(maxDrawdown),
    tradeCount: trades.length,
    completedRoundTrips: trades.filter((item) => item.action === "SELL").length,
    buyAndHoldEquity: round2(buyAndHold),
    profitable: finalEquity > config.initialCapital,
    notes: [
      "Backtest uses the daily_history table from ../gold-dashboard/data/history.db.",
      "卖出估值始终按每克扣除 4 元手续费后的价格计算。",
      "v2.2.0 验证了这套综合评分分层阈值在卖出手续费约束下的可行性。",
    ],
    lastFiveTrades: trades.slice(-5),
  };
}

function loadDailyRows(dbPath) {
  const db = new DatabaseSync(dbPath, { readonly: true });
  try {
    return db.prepare(`
      SELECT
        date,
        price_cny_per_gram AS price,
        gld_close AS gldClose,
        uup_close AS uupClose,
        real_yield_10y AS realYield10Y,
        cn_gold_etf_close AS cnGoldEtfClose,
        cn_gold_etf_volume AS cnGoldEtfVolume,
        cn_gold_etf_turnover AS cnGoldEtfTurnover,
        cn_gold_etf_alt_close AS cnGoldEtfAltClose,
        cn_gold_etf_alt_volume AS cnGoldEtfAltVolume,
        cn_gold_etf_alt_turnover AS cnGoldEtfAltTurnover,
        shfe_au_main_close AS shfeAuMainClose,
        shfe_au_main_volume AS shfeAuMainVolume,
        shfe_au_main_open_interest AS shfeAuMainOpenInterest,
        shfe_au_main_open_interest_change AS shfeAuMainOpenInterestChange,
        shfe_spot_premium_cny_per_gram AS shfeSpotPremiumCnyPerGram
      FROM daily_history
      WHERE price_cny_per_gram IS NOT NULL
      ORDER BY date
    `).all();
  } finally {
    db.close();
  }
}

function loadIntradayRows(dbPath) {
  const db = new DatabaseSync(dbPath, { readonly: true });
  try {
    const recentCutoffUtc = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const mediumCutoffUtc = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
    return db.prepare(`
      WITH sampled AS (
        SELECT
          timestamp_local AS timestampLocal,
          price_cny_per_gram AS price,
          timestamp_utc AS timestampUtc
        FROM intraday_history
        WHERE price_cny_per_gram IS NOT NULL
          AND (
            timestamp_utc >= ?
            OR (
              timestamp_utc >= ?
              AND timestamp_utc < ?
              AND substr(timestamp_local, 12, 5) IN ('00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00')
            )
            OR (
              timestamp_local >= '2012-06-27 00:00:00'
              AND timestamp_utc < ?
              AND substr(timestamp_local, 12, 5) IN ('00:00', '12:00')
            )
          )
      )
      SELECT timestampLocal, price
      FROM sampled
      ORDER BY timestampUtc
    `).all(recentCutoffUtc, mediumCutoffUtc, recentCutoffUtc, mediumCutoffUtc);
  } finally {
    db.close();
  }
}

function sampleDashboardSeries(series) {
  if (!Array.isArray(series) || series.length <= 18000) return series;
  const intradayStartMs = Date.UTC(2012, 5, 27, 0, 0, 0);
  const lastTime = parseLocalTimestamp(series.at(-1)?.time).getTime();
  if (!Number.isFinite(lastTime)) return series;
  const recentFullCutoffMs = lastTime - 30 * 24 * 60 * 60 * 1000;
  const mediumCutoffMs = lastTime - 365 * 24 * 60 * 60 * 1000;
  return series.filter((point) => {
    const timeMs = parseLocalTimestamp(point?.time).getTime();
    if (!Number.isFinite(timeMs)) return false;
    if (timeMs < intradayStartMs) return true;
    const timePart = String(point?.time || "").slice(11, 16);
    if (timeMs >= recentFullCutoffMs) return true;
    if (timeMs >= mediumCutoffMs) {
      return [
        "00:00",
        "02:00",
        "04:00",
        "06:00",
        "08:00",
        "10:00",
        "12:00",
        "14:00",
        "16:00",
        "18:00",
        "20:00",
        "22:00",
      ].includes(timePart);
    }
    return timePart === "00:00" || timePart === "12:00";
  });
}

async function loadJsonLines(filePath) {
  const text = cleanText(await readFile(filePath, "utf8"));
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function enrichDailyRows(rows) {
  const filled = rows.map((row) => ({ ...row }));
  fillForward(filled, "realYield10Y");
  fillForward(filled, "cnGoldEtfClose");
  fillForward(filled, "cnGoldEtfTurnover");
  fillForward(filled, "cnGoldEtfAltClose");
  fillForward(filled, "cnGoldEtfAltTurnover");
  fillForward(filled, "shfeAuMainClose");
  fillForward(filled, "shfeAuMainVolume");
  fillForward(filled, "shfeAuMainOpenInterest");
  fillForward(filled, "shfeAuMainOpenInterestChange");
  fillForward(filled, "shfeSpotPremiumCnyPerGram");
  for (let i = 0; i < filled.length; i += 1) {
    const row = filled[i];
    row.recentHigh5 = movingHigh(filled, i, 5, "price");
    row.recentHigh10 = movingHigh(filled, i, 10, "price");
    row.sma5 = movingAverage(filled, i, 5, "price");
    row.sma20 = movingAverage(filled, i, 20, "price");
    row.sma60 = movingAverage(filled, i, 60, "price");
    row.sma200 = movingAverage(filled, i, 200, "price");
    row.prevSma20 = i > 0 ? filled[i - 1].sma20 : null;
    row.prevSma60 = i > 0 ? filled[i - 1].sma60 : null;
    row.gldRoc20 = rateOfChange(filled, i, 20, "gldClose");
    row.uupRoc20 = rateOfChange(filled, i, 20, "uupClose");
    row.cnGoldEtfSma20 = movingAverage(filled, i, 20, "cnGoldEtfClose");
    row.cnGoldEtfClose20Ago = i >= 20 ? filled[i - 20].cnGoldEtfClose : null;
    row.cnGoldEtfRoc20 = rateOfChange(filled, i, 20, "cnGoldEtfClose");
    row.cnGoldEtfRoc5 = rateOfChange(filled, i, 5, "cnGoldEtfClose");
    row.cnGoldEtfTurnoverMa20 = movingAverage(filled, i, 20, "cnGoldEtfTurnover");
    row.cnGoldEtfTurnoverRatio20 = Number.isFinite(row.cnGoldEtfTurnoverMa20) && row.cnGoldEtfTurnoverMa20 > 0 && Number.isFinite(row.cnGoldEtfTurnover)
      ? row.cnGoldEtfTurnover / row.cnGoldEtfTurnoverMa20
      : null;
    row.cnGoldEtfAltSma20 = movingAverage(filled, i, 20, "cnGoldEtfAltClose");
    row.cnGoldEtfAltClose20Ago = i >= 20 ? filled[i - 20].cnGoldEtfAltClose : null;
    row.cnGoldEtfAltRoc20 = rateOfChange(filled, i, 20, "cnGoldEtfAltClose");
    row.cnGoldEtfAltRoc5 = rateOfChange(filled, i, 5, "cnGoldEtfAltClose");
    row.cnGoldEtfAltTurnoverMa20 = movingAverage(filled, i, 20, "cnGoldEtfAltTurnover");
    row.cnGoldEtfAltTurnoverRatio20 = Number.isFinite(row.cnGoldEtfAltTurnoverMa20) && row.cnGoldEtfAltTurnoverMa20 > 0 && Number.isFinite(row.cnGoldEtfAltTurnover)
      ? row.cnGoldEtfAltTurnover / row.cnGoldEtfAltTurnoverMa20
      : null;
    row.shfeAuMainSma20 = movingAverage(filled, i, 20, "shfeAuMainClose");
    row.shfeAuMainClose20Ago = i >= 20 ? filled[i - 20].shfeAuMainClose : null;
    row.shfeAuMainRoc20 = rateOfChange(filled, i, 20, "shfeAuMainClose");
    row.shfeAuMainRoc5 = rateOfChange(filled, i, 5, "shfeAuMainClose");
    row.shfeAuMainVolumeMa20 = movingAverage(filled, i, 20, "shfeAuMainVolume");
    row.shfeAuMainVolumeRatio20 = Number.isFinite(row.shfeAuMainVolumeMa20) && row.shfeAuMainVolumeMa20 > 0 && Number.isFinite(row.shfeAuMainVolume)
      ? row.shfeAuMainVolume / row.shfeAuMainVolumeMa20
      : null;
    row.shfeSpotPremiumMa10 = movingAverage(filled, i, 10, "shfeSpotPremiumCnyPerGram");
  }
  return filled;
}

function movingHigh(rows, endIndex, length, key) {
  if (endIndex < 0 || !Array.isArray(rows) || rows.length === 0) return null;
  const startIndex = Math.max(0, endIndex - length + 1);
  let high = Number.NEGATIVE_INFINITY;
  for (let i = startIndex; i <= endIndex; i += 1) {
    const value = Number(rows[i]?.[key]);
    if (!Number.isFinite(value)) continue;
    if (value > high) high = value;
  }
  return Number.isFinite(high) ? high : null;
}

function buildMovingAverageOverlay(chartSeries, dailyRows) {
  const dailyByDate = new Map(
    dailyRows.map((row) => [
      row.date,
      {
        ma5: round4(row.sma5),
        ma20: round4(row.sma20),
        ma60: round4(row.sma60),
      },
    ])
  );

  const definitions = [
    { key: "ma5", label: "MA5", color: "#3b82f6" },
    { key: "ma20", label: "MA20", color: "#7c3aed" },
    { key: "ma60", label: "MA60", color: "#d97706" },
  ];

  return definitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    color: definition.color,
    series: chartSeries.map((point) => ({
      time: point.time,
      date: point.date,
      value: dailyByDate.get(point.date)?.[definition.key] ?? null,
    })),
  }));
}

function computeIntradayStats(rows) {
  const normalized = Array.isArray(rows) ? rows.slice(-144) : [];
  const smaSlice = normalized.slice(-24);
  const sma24 = smaSlice.length ? smaSlice.reduce((sum, row) => sum + row.price, 0) / smaSlice.length : null;
  const recentLow = normalized.reduce((min, row) => (Number.isFinite(row.price) && row.price < min ? row.price : min), Number.POSITIVE_INFINITY);
  return {
    sma24,
    recentLow: Number.isFinite(recentLow) ? recentLow : null,
    latestTimestampLocal: normalized.at(-1)?.timestampLocal ?? null,
  };
}

function isBullishDailySetup(row) {
  return Boolean(
    row &&
    Number.isFinite(row.price) &&
    Number.isFinite(row.sma20) &&
    Number.isFinite(row.sma60) &&
    Number.isFinite(row.sma200) &&
    row.price > row.sma200 &&
    row.sma20 > row.sma60 &&
    (row.uupRoc20 === null || row.uupRoc20 < 0.04) &&
    (row.gldRoc20 === null || row.gldRoc20 > -0.03)
  );
}

function isCrossDown(row) {
  return Boolean(
    row &&
    Number.isFinite(row.sma20) &&
    Number.isFinite(row.sma60) &&
    Number.isFinite(row.prevSma20) &&
    Number.isFinite(row.prevSma60) &&
    row.sma20 < row.sma60 &&
    row.prevSma20 >= row.prevSma60
  );
}

function chooseBacktestDecision(row, config) {
  const profile = buildCompositeSignalProfile(
    {
      priceCnyPerGram: row?.price,
      highFrequencyAdvice: "",
      dailyAdvice: "",
      direction: "",
    },
    row,
    { sma24: row?.price },
    config
  );
  return chooseTargetPositionFromProfile(profile, config);
}

function movingAverage(rows, endIndex, length, key) {
  if (endIndex + 1 < length) return null;
  let sum = 0;
  for (let i = endIndex - length + 1; i <= endIndex; i += 1) {
    if (!Number.isFinite(rows[i][key])) return null;
    sum += rows[i][key];
  }
  return sum / length;
}

function rateOfChange(rows, endIndex, length, key) {
  if (endIndex < length) return null;
  const current = rows[endIndex][key];
  const previous = rows[endIndex - length][key];
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return current / previous - 1;
}

function fillForward(rows, key) {
  let last = null;
  for (const row of rows) {
    if (Number.isFinite(row[key])) last = row[key];
    else if (last !== null) row[key] = last;
  }
}

function defaultAgentState() {
  return {
    lastProcessedCheckedAt: null,
    lastAction: null,
    lastDecisionKind: null,
    lastUpdatedAtLocal: null,
    initialCapital: CONFIG.initialCapital,
    sellFeePerGram: CONFIG.sellFeePerGram,
  };
}

function defaultPortfolio() {
  return {
    initialCapital: CONFIG.initialCapital,
    cashCny: CONFIG.initialCapital,
    goldGrams: 0,
    averageCostCnyPerGram: null,
    investedCapitalCny: 0,
  };
}

function normalizePortfolio(portfolio, initialCapital, inferredInvestedCapitalCny = 0) {
  return {
    initialCapital,
    cashCny: round2(Number.isFinite(portfolio.cashCny) ? portfolio.cashCny : initialCapital),
    goldGrams: round4(Number.isFinite(portfolio.goldGrams) ? portfolio.goldGrams : 0),
    averageCostCnyPerGram: Number.isFinite(portfolio.averageCostCnyPerGram) ? round4(portfolio.averageCostCnyPerGram) : null,
    investedCapitalCny: round2(
      Number.isFinite(portfolio.investedCapitalCny) && portfolio.investedCapitalCny > 0
        ? portfolio.investedCapitalCny
        : inferredInvestedCapitalCny
    ),
  };
}

function isBuyAction(action) {
  return action === "BUY" || action === "BUY_MORE";
}

function isSellAction(action) {
  return action === "SELL" || action === "SELL_PART" || action === "SELL_ALL";
}

function inferInvestedCapitalFromTrades(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return 0;

  let investedCapitalCny = 0;
  let runningGoldGrams = 0;

  for (const trade of trades) {
    const grams = Number.isFinite(trade.grams) ? trade.grams : 0;

    if (isBuyAction(trade.action)) {
      investedCapitalCny += Number.isFinite(trade.amountCny) ? trade.amountCny : 0;
      runningGoldGrams += grams;
      continue;
    }

    if (isSellAction(trade.action)) {
      const remainingGrams = Number.isFinite(trade.remainingGoldGrams)
        ? trade.remainingGoldGrams
        : Math.max(0, runningGoldGrams - grams);
      const preSellGrams = Math.max(runningGoldGrams, remainingGrams + grams);
      const soldRatio = preSellGrams > 0 ? Math.min(1, grams / preSellGrams) : 1;
      investedCapitalCny = Math.max(0, investedCapitalCny * (1 - soldRatio));
      runningGoldGrams = Math.max(0, preSellGrams - grams);
    }
  }

  return round2(investedCapitalCny);
}

function normalizeTradeLog(trades) {
  if (!Array.isArray(trades)) return [];
  const normalized = trades.map((item) => normalizeTradeRecord(item));
  let runningGoldGrams = 0;
  let runningAverageCost = null;
  return normalized.map((trade) => {
    const isBuy = isBuyAction(trade.action);
    const isSell = isSellAction(trade.action);
    let postBuyAverageCostCnyPerGram = trade.postBuyAverageCostCnyPerGram ?? null;
    let remainingGoldGrams = Number.isFinite(trade.remainingGoldGrams) ? trade.remainingGoldGrams : null;

    if (isBuy && Number.isFinite(trade.grams) && trade.grams > 0) {
      const totalCost = runningGoldGrams * (runningAverageCost || 0) + (trade.amountCny || 0);
      runningGoldGrams += trade.grams;
      runningAverageCost = runningGoldGrams > 0 ? totalCost / runningGoldGrams : null;
      postBuyAverageCostCnyPerGram = runningAverageCost;
      remainingGoldGrams = runningGoldGrams;
    } else if (isSell && Number.isFinite(trade.grams) && trade.grams > 0) {
      runningGoldGrams = Math.max(0, runningGoldGrams - trade.grams);
      if (runningGoldGrams === 0) {
        runningAverageCost = null;
      }
      remainingGoldGrams = runningGoldGrams;
    }

    return {
      ...trade,
      postBuyAverageCostCnyPerGram: postBuyAverageCostCnyPerGram === null ? null : round4(postBuyAverageCostCnyPerGram),
      remainingGoldGrams: remainingGoldGrams === null ? null : round4(remainingGoldGrams),
    };
  });
}

function normalizeTradeRecord(trade) {
  const amountCny = firstFinite(trade.amountCny, trade.capitalUsedCny, 0);
  const checkedAtLocal = trade.checkedAtLocal || trade.timestampLocal || trade.date || "-";
  const checkedAt = trade.checkedAt || localTimeToIsoDate(checkedAtLocal);
  const isSell = isSellAction(trade.action);
  const sellFeeCny = firstFinite(
    isSell ? trade.sellFeeCny : null,
    isSell && Number.isFinite(trade.sellFeePerGram) && Number.isFinite(trade.grams) ? trade.sellFeePerGram * trade.grams : null,
    0
  );
  const grossProceedsCny = firstFinite(
    isSell ? trade.grossProceedsCny : null,
    isSell && Number.isFinite(trade.priceCnyPerGram) && Number.isFinite(trade.grams) ? trade.priceCnyPerGram * trade.grams : null,
    null
  );
  const netProceedsCny = isSell ? firstFinite(trade.netProceedsCny, trade.amountCny, trade.capitalUsedCny, null) : null;
  const holdingAverageCostCnyPerGram = firstFinite(
    isSell ? trade.holdingAverageCostCnyPerGram : null,
    isSell && Number.isFinite(trade.priceCnyPerGram) && Number.isFinite(trade.realizedPnlCny) && Number.isFinite(trade.sellFeePerGram) && Number.isFinite(trade.grams) && trade.grams > 0
      ? trade.priceCnyPerGram - trade.sellFeePerGram - trade.realizedPnlCny / trade.grams
      : null,
    null
  );
  const grossPnlCny = firstFinite(
    isSell ? trade.grossPnlCny : null,
    isSell && Number.isFinite(trade.priceCnyPerGram) && Number.isFinite(holdingAverageCostCnyPerGram) && Number.isFinite(trade.grams)
      ? (trade.priceCnyPerGram - holdingAverageCostCnyPerGram) * trade.grams
      : null,
    null
  );
  const netPnlCny = firstFinite(isSell ? trade.netPnlCny : null, isSell ? trade.realizedPnlCny : null, null);
  const sellCostBasisCny = firstFinite(
    isSell ? trade.sellCostBasisCny : null,
    isSell && Number.isFinite(holdingAverageCostCnyPerGram) && Number.isFinite(trade.grams) ? holdingAverageCostCnyPerGram * trade.grams : null,
    null
  );
  return {
    ...trade,
    checkedAt,
    checkedAtLocal,
    amountCny: round2(amountCny),
    sellFeeCny: round2(sellFeeCny),
    grossProceedsCny: grossProceedsCny === null ? null : round2(grossProceedsCny),
    netProceedsCny: netProceedsCny === null ? null : round2(netProceedsCny),
    holdingAverageCostCnyPerGram: holdingAverageCostCnyPerGram === null ? null : round4(holdingAverageCostCnyPerGram),
    sellCostBasisCny: sellCostBasisCny === null ? null : round2(sellCostBasisCny),
    grossPnlCny: grossPnlCny === null ? null : round2(grossPnlCny),
    netPnlCny: netPnlCny === null ? null : round2(netPnlCny),
    reason: trade.reason || trade.rationale || "历史记录缺少原因字段",
    profitable: trade.profitable ?? (Number.isFinite(trade.realizedPnlCny) ? trade.realizedPnlCny > 0 : null),
  };
}

function buildPortfolioSummary(portfolio, totalFeesCny, latestAction) {
  return {
    initialCapital: portfolio.initialCapital,
    cashCny: portfolio.cashCny,
    goldGrams: portfolio.goldGrams,
    costBasisCny: portfolio.costBasisCny,
    averageCostCnyPerGram: portfolio.averageCostCnyPerGram,
    currentPriceCnyPerGram: portfolio.currentPriceCnyPerGram,
    goldMarketValueCny: portfolio.goldMarketValueCny,
    equityCny: portfolio.equityCny,
    netTotalPnlCny: portfolio.netTotalPnlCny,
    totalPnlCny: portfolio.netTotalPnlCny,
    totalFeesCny,
    unrealizedPnlCny: portfolio.unrealizedPnlCny,
    latestAction,
  };
}

function toMarker(trade, chartSeries, source) {
  const markerTime = trade.checkedAtLocal || trade.timestampLocal || trade.date;
  const markerDate = typeof markerTime === "string" ? markerTime.slice(0, 10) : trade.checkedAt?.slice(0, 10);
  return {
    time: markerTime,
    date: markerDate,
    checkedAtLocal: trade.checkedAtLocal,
    action: trade.action,
    priceCnyPerGram: priceForTime(chartSeries, markerTime) ?? priceForDate(chartSeries, markerDate) ?? trade.priceCnyPerGram,
    reason: trade.reason,
    amountCny: trade.amountCny,
    profitable: trade.profitable,
    symbol: trade.action.startsWith("SELL") ? "S" : "B",
    source,
  };
}

function mergeIntradaySeries(intradayRows, intradayTape, latest) {
  const map = new Map();

  for (const row of intradayRows) {
    if (!row?.timestampLocal || !Number.isFinite(row.price)) continue;
    map.set(normalizeLocalTimestamp(row.timestampLocal), {
      timestampLocal: normalizeLocalTimestamp(row.timestampLocal),
      price: row.price,
    });
  }

  for (const row of intradayTape) {
    const timestampLocal = normalizeLocalTimestamp(row.checkedAtLocal);
    const price = Number(row.priceCnyPerGram);
    if (!timestampLocal || !Number.isFinite(price)) continue;
    map.set(timestampLocal, { timestampLocal, price });
  }

  const latestTime = normalizeLocalTimestamp(latest.checkedAtLocal);
  if (latestTime && Number.isFinite(latest.priceCnyPerGram)) {
    map.set(latestTime, { timestampLocal: latestTime, price: Number(latest.priceCnyPerGram) });
  }

  return [...map.values()].sort((left, right) => parseLocalTimestamp(left.timestampLocal) - parseLocalTimestamp(right.timestampLocal));
}

function mergeChartSeries(dailyRows, intradayRows, intradayTape, latest) {
  const intradaySeries = mergeIntradaySeries(intradayRows, intradayTape, latest);
  const firstIntradayDate = intradaySeries[0]?.timestampLocal?.slice(0, 10) ?? null;
  const map = new Map();

  for (const row of dailyRows) {
    if (!row?.date || !Number.isFinite(row.price)) continue;
    if (firstIntradayDate && row.date >= firstIntradayDate) continue;
    const timestampLocal = `${row.date} 15:00:00`;
    map.set(timestampLocal, {
      timestampLocal,
      price: Number(row.price),
    });
  }

  for (const row of intradaySeries) {
    map.set(row.timestampLocal, row);
  }

  return [...map.values()].sort((left, right) => parseLocalTimestamp(left.timestampLocal) - parseLocalTimestamp(right.timestampLocal));
}

function appendIfNewSnapshot(history, entry) {
  const list = Array.isArray(history) ? history : [];
  if (list.at(-1)?.checkedAt === entry.checkedAt) return [...list.slice(0, -1), entry];
  return [...list, entry];
}

function currentPositionRatio(portfolio, currentPrice, sellFeePerGram) {
  const marked = markPortfolio(portfolio, currentPrice, sellFeePerGram);
  return marked.equityCny > 0 ? marked.goldMarketValueCny / marked.equityCny : 0;
}

function priceForDate(series, date) {
  const direct = series.find((item) => item.date === date);
  if (direct) return direct.priceCnyPerGram;
  const prior = [...series].reverse().find((item) => item.date <= date);
  return prior?.priceCnyPerGram ?? series.at(-1)?.priceCnyPerGram ?? null;
}

function priceForTime(series, time) {
  if (typeof time !== "string") return null;
  const exact = series.find((item) => item.time === time);
  if (exact) return exact.priceCnyPerGram;
  const prior = [...series].reverse().find((item) => item.time <= time);
  return prior?.priceCnyPerGram ?? series.at(-1)?.priceCnyPerGram ?? null;
}

function summarizeBacktest(backtest) {
  return {
    sampleStart: backtest.sampleStart,
    sampleEnd: backtest.sampleEnd,
    finalEquity: backtest.finalEquity,
    totalReturnPct: backtest.totalReturnPct,
    profitable: backtest.profitable,
  };
}

function calculateTotalFees(trades, sellFeePerGram) {
  if (!Array.isArray(trades)) return 0;
  let total = 0;
  for (const trade of trades) {
    if ((trade.action === "SELL_PART" || trade.action === "SELL_ALL" || trade.action === "SELL") && Number.isFinite(trade.grams)) {
      total += trade.grams * sellFeePerGram;
    }
  }
  return round2(total);
}

async function readJsonIfExists(filePath, fallbackValue) {
  try {
    return JSON.parse(cleanText(await readFile(filePath, "utf8")));
  } catch {
    return fallbackValue;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function firstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function localTimeToIsoDate(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`;
}

function normalizeLocalTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${hour}:${minute}:${second}`;
}

function parseLocalTimestamp(value) {
  return new Date(String(value).replace(" ", "T"));
}

function cleanText(value) {
  return String(value).replace(/^\uFEFF/, "");
}

function round2(value) {
  return round(value, 2);
}

function round4(value) {
  return round(value, 4);
}

function round(value, digits) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toPct(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${round(value * 100, 2)}%`;
}
