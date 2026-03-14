import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { loadStrategyConfig } from "../../shared/runtime/strategy-config.mjs";

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
  minTradeCny: 1800,
  rebalanceBufferRatio: 0.03,
  targetRatioCautious: 0.14,
  targetRatioProbe: 0.32,
  targetRatioBalanced: 0.5,
  targetRatioStrong: 0.64,
  scoreExitThreshold: 26,
  scoreProbeThreshold: 46,
  scoreBalancedThreshold: 56,
  scoreStrongThreshold: 68,
  longTrendExitPct: 0.978,
  shortTermDipPremium: -0.0032,
  shortTermStrongDipPremium: -0.0052,
  shortTermTrimPremium: 0.0075,
  shortTermHardTrimPremium: 0.0115,
  minTrendScoreForTacticalAdd: 24,
  minMacroScoreForTacticalAdd: 14,
  maxRatioWhenTrendWeak: 0.18,
  maxRatioWhenMacroHeavy: 0.32,
  maxRatioOnCrossDown: 0.14,
  minNetTrimPnlCny: 120,
  minNetTrimPnlPerGram: 2.2,
  minProfitTakeTrimPnlCny: 180,
  minProfitTakeTrimPnlPerGram: 3,
  minHoursBeforeProfitTakeTrim: 2,
  dashboardLookbackDays: 180,
};

const STRATEGY_HISTORY = {
  currentVersion: "v3.4.0",
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
      version: "v3.0.0",
      createdAt: "2026-03-10 14:35:00",
      updatedAt: "2026-03-10 14:35:00",
      title: "Aggressive Short-Swing Composite Trader",
      titleZh: "短线增强版",
      changes: [
        "Copy the live state and historical strategy baseline from Agent1 before branching.",
        "Lower score thresholds and raise target-position tiers for faster exposure changes.",
        "Add intraday dip-buy and overheat-trim rules around SMA6 and SMA24 for shorter swing trading.",
      ],
      changesZh: [
        "先复制 Agent1 的实时状态和历史策略基线，再独立分叉。",
        "降低评分阈值并提高目标仓位档位，让仓位变化更快。",
        "围绕 SMA6 和 SMA24 增加盘中回撤加仓与过热减仓规则。",
      ],
      reason: "Agent2 is intended to trade more actively from the same starting state, so it needs faster and more intraday-sensitive regime rules than Agent1.",
      reasonZh: "Agent2 需要在相同起点下做得更主动，因此需要比 Agent1 更快、更看重盘中变化的短线规则。",
    },
    {
      version: "v3.1.0",
      createdAt: "2026-03-10 15:00:00",
      updatedAt: "2026-03-10 15:00:00",
      title: "Aggressive Short-Swing Composite Trader",
      titleZh: "短线增强版",
      changes: [
        "Keep Agent2 more active than Agent1, but lift thresholds and narrow target tiers after fee-aware validation.",
        "Only allow tactical dip-buy upgrades when trend and macro scores are healthy enough.",
        "Convert overheated trims and weak-trend pressure into capped exposure instead of jumping straight into aggressive churn.",
      ],
      changesZh: [
        "让 Agent2 保持比 Agent1 更活跃，但在手续费验证后适当抬高阈值并收窄仓位档位。",
        "只有在趋势分和宏观分都足够健康时，才允许战术性回撤加仓。",
        "过热减仓和弱趋势压力都会先转成仓位上限控制，避免演变成过度交易。",
      ],
      reason: "The first aggressive branch traded too often and lost heavily after exit fees. v3.1.0 keeps the short-swing behavior, but only inside healthier higher-level regimes.",
      reasonZh: "第一版激进策略交易过多，在扣除手续费后表现很差。v3.1.0 保留短线特征，但只在更健康的高层级环境下发力。",
    },
    {
      version: "v3.2.0",
      createdAt: "2026-03-10 15:30:00",
      updatedAt: "2026-03-10 15:30:00",
      title: "Short-Swing Fee-Aware Gold Trader",
      titleZh: "短线手续费约束交易者",
      changes: [
        "Rename Agent2 into the short-swing player and keep the strategy identity aligned.",
        "Keep the short-swing add/trim rules, but reject tactical trims that would still lose money after fees.",
        "Expose the strategy and score method in Chinese for the dashboard.",
      ],
      changesZh: [
        "把 Agent2 正式命名为短线选手，并统一策略身份和展示文案。",
        "保留短线加减仓逻辑，但会拦截掉扣完手续费后仍然亏钱的战术性减仓。",
        "把策略说明、买卖条件和评分计算方式改成中文展示。",
      ],
      reason: "A short-swing trader should be more active than the base agent, but should not make fee-negative tactical trims that ordinary discretionary traders would avoid.",
      reasonZh: "短线选手可以比基础版更积极，但不应该为了追求节奏而做出扣掉手续费后仍然亏钱的战术性减仓。",
    },
    {
      version: "v3.3.0",
      createdAt: "2026-03-11 07:10:00",
      updatedAt: "2026-03-11 07:10:00",
      title: "Short-Swing Profit-Take And Defensive Split",
      titleZh: "短线止盈与防守减仓分流",
      changes: [
        "Split profit-taking trims from protective reductions so the sell threshold matches the trade intent.",
        "Raise the minimum net-profit requirement for overheated tactical trims after fees.",
        "Block counter-directional buybacks while the market is still giving trim or defensive signals.",
      ],
      changesZh: [
        "把止盈型减仓和防守型减仓拆开处理，让卖出门槛和交易动机一致。",
        "提高盘中过热止盈减仓的手续费后最低净收益要求。",
        "当市场仍处在过热或防守信号里时，禁止反向追回仓位。",
      ],
      reason: "A short-swing trader should take quick profits only when the edge is large enough, while still preserving the ability to cut exposure for protection.",
      reasonZh: "短线交易应该只在利润边际足够厚时做止盈，同时继续保留真正的保护性减仓能力。",
    },
    {
      version: "v3.4.0",
      createdAt: "2026-03-11 07:25:00",
      updatedAt: "2026-03-11 07:25:00",
      title: "Short-Swing Profit Quality Upgrade",
      titleZh: "短线利润质量升级",
      changes: [
        "Add a short cooldown after fresh buys before allowing profit-taking trims.",
        "Separate profit-taking thresholds from defensive sell thresholds more clearly.",
        "Keep short-term agility, but avoid overtrading when the price is merely hot rather than truly worth trimming.",
      ],
      changesZh: [
        "在刚买入后增加短冷却，避免马上为了小利润去止盈减仓。",
        "把止盈型卖出门槛和防守型卖出门槛进一步拉开。",
        "保留短线灵活性，但避免因为价格只是偏热就过度交易。",
      ],
      reason: "A short-swing strategy should actively trade the best edges, not turn every intraday overheat reading into a hurried low-quality trim.",
      reasonZh: "短线策略应该主动抓最有质量的利润边际，而不是把每一次盘中过热都变成匆忙、质量不高的止盈减仓。",
    },
  ],
};

const STRATEGY = {
  id: "short-swing-fee-aware-gold-trader",
  version: STRATEGY_HISTORY.currentVersion,
  createdAt: "2026-03-10 15:30:00",
  name: "Short-Swing Fee-Aware Gold Trader",
  nameZh: "短线手续费约束黄金交易策略",
  description: "Start from Agent1's composite model, then react more actively to intraday dips and overheated extensions while filtering out low-quality fee-negative trims.",
  descriptionZh: "在 Agent1 的综合评分模型基础上，针对盘中回撤和过热做更积极的短线处理，同时过滤掉扣完手续费后仍然不划算的低质量减仓。",
  buyRule: [
    "daily composite score >= 46 for an active probe, >= 56 for balanced size, >= 68 for strong size",
    "price stays above the long-term trend floor",
    "intraday dip below SMA24 can lift one position tier only when trend and macro scores are healthy",
    "deeper dip can lift to the strongest tier only inside already constructive higher-level regimes",
  ],
  sellRule: [
    "daily composite score < 26",
    "or price < SMA200 * 0.978",
    "or overheated intraday extension triggers a tactical trim",
    "or short-term trend rolls over and exposure gets capped instead of staying aggressive",
  ],
  buyRuleZh: [
    "综合评分达到 46 分以上，允许建立短线试探仓；56 分以上进入平衡仓；68 分以上进入强势仓。",
    "价格必须维持在长期趋势底线之上。",
    "只有当趋势分和宏观分都足够健康时，盘中跌破 SMA24 才允许加一个仓位档位。",
    "更深的盘中回撤只会在高层级环境已经偏强时才提升到最强仓位。",
  ],
  sellRuleZh: [
    "综合评分跌破 26 分。",
    "或者价格跌破 SMA200 的 97.8%。",
    "或者盘中过热时触发战术性减仓。",
    "或者短期趋势转弱，此时会把仓位上限压回更保守的区间。",
    "如果只是止盈型减仓，但扣掉手续费后的净收益不够厚，则不卖出。",
    "如果当前仍是减仓或防守信号，即使仓位偏低，也不会立刻反手追回。",
  ],
  scoreMethodZh: [
    "综合评分 = 趋势分 + 宏观分 + 盘中位置分 + 追踪建议分，最终截断在 0 到 100 分。",
    "趋势分 0 到 38：价格站上 SMA200、SMA20 高于 SMA60、价格高于 SMA20 会加分；长期趋势被破坏会明显扣分。",
    "宏观分 0 到 32：综合 UUP、GLD 和 10 年期实际利率，美元弱、GLD 强、实际利率低时更有利于黄金。",
    "盘中位置分 0 到 18：同时比较实时金价相对 SMA24 和 SMA6 的偏离，回撤越充分越容易加分，过热越明显越减分。",
    "追踪建议分 0 到 14：读取高频建议、日频建议和方向描述，偏多加分，观望或转弱减分。",
    "仓位映射：46 分以上建立试探仓，56 分以上进入平衡仓，68 分以上进入强势仓；但短线增强只在趋势分和宏观分同时达标时才生效。",
    "卖出分流：过热止盈要满足更高的净收益门槛；趋势转弱、宏观转差和风控退出仍然允许保护性减仓。",
  ],
};

applyChineseStrategyText();

await mkdir(OUT_DIR, { recursive: true });

const CONFIG = await loadStrategyConfig(FILES.strategyConfig, DEFAULT_CONFIG, {
  agentName: "agent2-短线选手",
  strategyVersion: STRATEGY_HISTORY.currentVersion,
  description: "短线选手自动策略参数。修改后会同时影响历史回测与实时决策。",
});

const latest = JSON.parse(cleanText(await readFile(INPUTS.latest, "utf8")));
const intradayTape = await loadJsonLines(INPUTS.intradayJsonl);
const dailyRows = enrichDailyRows(loadDailyRows(INPUTS.dailyDb));
const intradayRows = loadIntradayRows(INPUTS.intradayDb);

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
    ["v3.0.0", {
      title: "短线增强版",
      changes: [
        "先复制 Agent1 的实时状态和历史策略基线，再独立分叉。",
        "降低评分阈值并提高目标仓位档位，让仓位变化更快。",
        "围绕 SMA6 和 SMA24 增加盘中回撤加仓与过热减仓规则。",
      ],
      reason: "Agent2 需要在相同起点下做得更主动，因此需要比 Agent1 更快、更看重盘中变化的短线规则。",
    }],
    ["v3.1.0", {
      title: "短线增强版",
      changes: [
        "让 Agent2 保持比 Agent1 更活跃，但在手续费验证后适当抬高阈值并收窄仓位档位。",
        "只有在趋势分和宏观分都足够健康时，才允许战术性回撤加仓。",
        "过热减仓和弱趋势压力都会先转成仓位上限控制，避免演变成过度交易。",
      ],
      reason: "第一版激进策略交易过多，在扣除手续费后表现很差。v3.1.0 保留短线特征，但只在更健康的高层级环境下发力。",
    }],
    ["v3.2.0", {
      title: "短线手续费约束交易者",
      changes: [
        "把 Agent2 正式命名为短线选手，并统一策略身份和展示文案。",
        "保留短线加减仓逻辑，但会拦截掉扣完手续费后仍然亏钱的战术性减仓。",
        "把策略说明、买卖条件和评分计算方式改成中文展示。",
      ],
      reason: "短线选手可以比基础版更积极，但不应该为了追求节奏而做出扣掉手续费后仍然亏钱的战术性减仓。",
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
    "综合评分 = 趋势分 + 宏观分 + 盘中位置分 + 追踪建议分，最终截断在 0 到 100 分。",
    "趋势分 0 到 38：价格站上 SMA200、SMA20 高于 SMA60、价格高于 SMA20 会加分；长期趋势被破坏会明显扣分。",
    "宏观分 0 到 32：综合 UUP、GLD 和 10 年期实际利率，美元弱、GLD 强、实际利率低时更有利于黄金。",
    "盘中位置分 0 到 18：同时比较实时金价相对 SMA24 和 SMA6 的偏离，回撤越充分越容易加分，过热越明显越减分。",
    "追踪建议分 0 到 14：读取高频建议、日频建议和方向描述，偏多加分，观望或转弱减分。",
    "仓位映射：26 分以下以退出和压缩仓位为主，46 分以上建立试探仓，56 分以上进入平衡仓，68 分以上进入强势仓；短线加减仓只在趋势分和宏观分同时达标时才生效。",
  ];

  Object.assign(STRATEGY, {
    name: "短线手续费约束黄金交易策略",
    nameZh: "短线手续费约束黄金交易策略",
    description: "在 Agent1 的综合评分模型基础上，针对盘中回撤和过热做更积极的短线处理，同时过滤掉扣完手续费后仍然不划算的低质量减仓。",
    descriptionZh: "在 Agent1 的综合评分模型基础上，针对盘中回撤和过热做更积极的短线处理，同时过滤掉扣完手续费后仍然不划算的低质量减仓。",
    buyRule: [
      "综合评分达到 46 分以上，允许建立短线试探仓；56 分以上进入平衡仓；68 分以上进入强势仓。",
      "价格必须维持在长期趋势底线之上。",
      "只有当趋势分和宏观分都足够健康时，盘中跌破 SMA24 才允许加一个仓位档位。",
      "更深的盘中回撤只会在高层级环境已经偏强时才提升到最强仓位。",
    ],
    sellRule: [
      "综合评分跌破 26 分。",
      "或者价格跌破 SMA200 的 97.8%。",
      "或者盘中过热时触发战术性减仓。",
      "或者短期趋势转弱，此时会把仓位上限压回更保守的区间。",
      "如果只是战术性减仓，但扣掉手续费后仍然亏钱，则不卖出。",
    ],
    buyRuleZh: [
      "综合评分达到 46 分以上，允许建立短线试探仓；56 分以上进入平衡仓；68 分以上进入强势仓。",
      "价格必须维持在长期趋势底线之上。",
      "只有当趋势分和宏观分都足够健康时，盘中跌破 SMA24 才允许加一个仓位档位。",
      "更深的盘中回撤只会在高层级环境已经偏强时才提升到最强仓位。",
    ],
    sellRuleZh: [
      "综合评分跌破 26 分。",
      "或者价格跌破 SMA200 的 97.8%。",
      "或者盘中过热时触发战术性减仓。",
      "或者短期趋势转弱，此时会把仓位上限压回更保守的区间。",
      "如果只是战术性减仓，但扣掉手续费后仍然亏钱，则不卖出。",
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
  const latestDaily = context.dailyRows.at(-1);
  const intradayStats = computeIntradayStats(context.intradayRows);
  const currentPortfolio = normalizePortfolio(context.persisted.portfolio, context.config.initialCapital);
  const currentPrice = round4(context.latest.priceCnyPerGram);
  const processedAlready = context.persisted.agentState.lastProcessedCheckedAt === context.latest.checkedAt;

  const order = processedAlready
    ? buildHoldOrder({
        latest: context.latest,
        reason: "同一条实时快照已经处理过，本次不重复下单，只刷新组合估值。",
        targetPositionRatio: currentPositionRatio(currentPortfolio, currentPrice, context.config.sellFeePerGram),
        decisionKind: "duplicate-snapshot",
        diagnostics: buildDiagnostics(context.latest, latestDaily, intradayStats),
        backtest: context.backtest,
      })
    : buildRebalanceOrder({
        latest: context.latest,
        portfolio: currentPortfolio,
        currentPrice,
        target: chooseCompositeTargetPositionRatio(context.latest, latestDaily, intradayStats, context.config),
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
    if (isSellBiasDecisionKind(target.decisionKind)) {
      return buildHoldOrder({
        latest,
        reason: `${target.reason} 当前处在减仓或防守信号里，不反向追回仓位。`,
        targetPositionRatio: currentRatio,
        decisionKind: "skip-counter-buy",
        diagnostics,
        backtest,
      });
    }
    const budget = Math.min(deltaValue, portfolio.cashCny);
    if (budget < config.minTradeCny) {
      return buildHoldOrder({
        latest,
        reason: `${target.reason} 但可用现金不足，暂时不加仓。`,
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
      reason: `${target.reason} 但本次应减仓金额太小，暂时不卖出。`,
      targetPositionRatio: target.ratio,
      decisionKind: "sell-too-small",
      diagnostics,
      backtest,
    });
  }

  const grossPnlCny = grams * (currentPrice - portfolio.averageCostCnyPerGram);
  const realizedPnlCny = grossPnlCny - grams * config.sellFeePerGram;

  if (shouldDelayProfitTakeTrim(target.decisionKind, latest, recentTrade, realizedPnlCny, grams, config)) {
    return buildHoldOrder({
      latest,
      reason: `${target.reason} 但距离上一次买入还太近，短线止盈先不急着落袋。`,
      targetPositionRatio: currentRatio,
      decisionKind: "cooldown-hold",
      diagnostics,
      backtest,
    });
  }
  if (shouldSkipLowEdgeSell(target.decisionKind, realizedPnlCny, grams, config)) {
    return buildHoldOrder({
      latest,
      reason: `${target.reason} 但这笔短线减仓在扣除手续费后净收益偏低，暂时不卖出。`,
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
    intradaySma6: intradayStats.sma6 ? round4(intradayStats.sma6) : null,
    intradaySma24: intradayStats.sma24 ? round4(intradayStats.sma24) : null,
    bullishDaily: isBullishDailySetup(latestDaily),
    crossDown: isCrossDown(latestDaily),
    compositeScore: profile.score,
    trendScore: profile.trendScore,
    macroScore: profile.macroScore,
    intradayScore: profile.intradayScore,
    adviceScore: profile.adviceScore,
    intradayPremiumToSma24: Number.isFinite(profile.intradayPremiumToSma24) ? round4(profile.intradayPremiumToSma24) : null,
    intradayPremiumToSma6: Number.isFinite(profile.intradayPremiumToSma6) ? round4(profile.intradayPremiumToSma6) : null,
    shortTermDipBuy: profile.shortTermDipBuy,
    shortTermOverheatTrim: profile.shortTermOverheatTrim,
    summary: profile.summary,
  };
}

function chooseCompositeTargetPositionRatio(latest, latestDaily, intradayStats, config) {
  const profile = buildCompositeSignalProfile(latest, latestDaily, intradayStats, config);
  return chooseTargetPositionFromProfile(profile, config);
}

function buildCompositeSignalProfile(latest, latestDaily, intradayStats, config = CONFIG) {
  const trendScore = scoreTrend(latestDaily);
  const macroScore = scoreMacro(latestDaily);
  const intradayScore = scoreIntraday(latest, intradayStats);
  const adviceScore = scoreAdvice(latest);
  const score = clamp(Math.round(trendScore + macroScore + intradayScore + adviceScore), 0, 100);
  const crossDown = isCrossDown(latestDaily);
  const intradayPremiumToSma24 = Number.isFinite(intradayStats.sma24) ? latest.priceCnyPerGram / intradayStats.sma24 - 1 : null;
  const intradayPremiumToSma6 = Number.isFinite(intradayStats.sma6) ? latest.priceCnyPerGram / intradayStats.sma6 - 1 : null;
  const longTrendBroken = Boolean(
    latestDaily
      && Number.isFinite(latestDaily.sma200)
      && latestDaily.price < latestDaily.sma200 * config.longTrendExitPct
  );
  const hardExit = longTrendBroken || (crossDown && score < config.scoreProbeThreshold);
  const shortTermDipBuy = Number.isFinite(intradayPremiumToSma24)
    && intradayPremiumToSma24 <= config.shortTermDipPremium
    && score >= config.scoreExitThreshold;
  const shortTermStrongDipBuy = Number.isFinite(intradayPremiumToSma24)
    && intradayPremiumToSma24 <= config.shortTermStrongDipPremium
    && score >= config.scoreProbeThreshold;
  const shortTermOverheatTrim = Number.isFinite(intradayPremiumToSma24)
    && intradayPremiumToSma24 >= config.shortTermTrimPremium
    && score >= config.scoreProbeThreshold;
  const shortTermHardTrim = Number.isFinite(intradayPremiumToSma24)
    && intradayPremiumToSma24 >= config.shortTermHardTrimPremium
    && score >= config.scoreBalancedThreshold;

  return {
    score,
    trendScore,
    macroScore,
    intradayScore,
    adviceScore,
    crossDown,
    longTrendBroken,
    hardExit,
    intradayPremiumToSma24,
    intradayPremiumToSma6,
    shortTermDipBuy,
    shortTermStrongDipBuy,
    shortTermOverheatTrim,
    shortTermHardTrim,
    summary: [
      trendScore >= 28 ? "日线趋势偏强" : trendScore >= 18 ? "日线趋势中性" : "日线趋势偏弱",
      macroScore >= 20 ? "宏观压制较轻" : macroScore >= 12 ? "宏观中性" : "宏观压力偏大",
      intradayScore >= 12 ? "盘中回撤可买" : intradayScore >= 8 ? "盘中位置中性" : "盘中过热",
      adviceScore >= 10 ? "追踪建议偏多" : adviceScore >= 6 ? "追踪建议中性" : "追踪建议谨慎",
    ].join("，"),
  };
}

function chooseTargetPositionFromProfile(profile, config) {
  if (profile.hardExit) {
    return {
      ratio: 0,
      decisionKind: "exit",
      reason: `综合评分 ${profile.score} 分，${profile.summary}，风控退出条件已触发，目标仓位降到 0%。`,
      profile,
    };
  }

  const base = chooseBaseAggressiveTier(profile, config);
  if (base.ratio === 0) {
    return {
      ratio: 0,
      decisionKind: "stand-aside",
      reason: `综合评分 ${profile.score} 分，${profile.summary}，暂时空仓等待。`,
      profile,
    };
  }

  let ratio = base.ratio;
  let decisionKind = base.decisionKind;
  const notes = [base.reason];

  if (profile.crossDown) {
    const capped = Math.min(ratio, config.maxRatioOnCrossDown);
    if (capped < ratio) {
      ratio = capped;
      decisionKind = "crossdown-cap";
      notes.push("短期趋势开始转弱，仓位上限压回谨慎档。");
    }
  } else if (profile.trendScore < config.minTrendScoreForTacticalAdd) {
    const capped = Math.min(ratio, config.maxRatioWhenTrendWeak);
    if (capped < ratio) {
      ratio = capped;
      decisionKind = "weak-trend-cap";
      notes.push("日线趋势不够强，不能继续维持偏激进的短线仓位。");
    }
  } else if (profile.macroScore < config.minMacroScoreForTacticalAdd) {
    const capped = Math.min(ratio, config.maxRatioWhenMacroHeavy);
    if (capped < ratio) {
      ratio = capped;
      decisionKind = "macro-cap";
      notes.push("宏观压力仍然存在，激进仓位需要被压缩。");
    }
  }

  if (profile.shortTermHardTrim) {
    const trimmed = stepDownAggressiveTier(ratio, config, 2);
    if (trimmed < ratio) {
      ratio = trimmed;
      decisionKind = "hard-trim-overheat";
      notes.push("盘中过热非常明显，战术性下调两个仓位档。");
    }
  } else if (profile.shortTermOverheatTrim) {
    const trimmed = stepDownAggressiveTier(ratio, config, 1);
    if (trimmed < ratio) {
      ratio = trimmed;
      decisionKind = "trim-overheat";
      notes.push("盘中过热，先下调一个仓位档而不是继续追价。");
    }
  } else {
    const tacticalAddAllowed = !profile.crossDown
      && profile.trendScore >= config.minTrendScoreForTacticalAdd
      && profile.macroScore >= config.minMacroScoreForTacticalAdd;

    if (tacticalAddAllowed && profile.shortTermStrongDipBuy) {
      const boosted = stepUpAggressiveTier(ratio, config, 1);
      if (boosted > ratio) {
        ratio = boosted;
        decisionKind = "buy-strong-dip";
        notes.push("盘中出现较深回撤，短线加仓性价比提高，因此上调一个仓位档。");
      }
    } else if (tacticalAddAllowed && profile.shortTermDipBuy && ratio >= config.targetRatioProbe) {
      const boosted = stepUpAggressiveTier(ratio, config, 1);
      if (boosted > ratio) {
        ratio = boosted;
        decisionKind = "buy-dip";
        notes.push("盘中出现可控回撤，允许做一次短线战术加仓。");
      }
    }
  }

  return {
    ratio,
    decisionKind,
    reason: `综合评分 ${profile.score} 分，${profile.summary}。${notes.join("")}`,
    profile,
  };
}

function chooseBaseAggressiveTier(profile, config) {
  if (profile.score >= config.scoreStrongThreshold) {
    return {
      ratio: config.targetRatioStrong,
      decisionKind: "add-long",
      reason: "高层级环境偏强，允许进入短线强势仓。",
    };
  }

  if (profile.score >= config.scoreBalancedThreshold) {
    return {
      ratio: config.targetRatioBalanced,
      decisionKind: "balanced-long",
      reason: "高层级环境稳定，维持短线平衡仓。",
    };
  }

  if (profile.score >= config.scoreProbeThreshold) {
    return {
      ratio: config.targetRatioProbe,
      decisionKind: "probe-long",
      reason: "高层级环境允许保留短线试探仓。",
    };
  }

  if (profile.score >= config.scoreExitThreshold) {
    return {
      ratio: config.targetRatioCautious,
      decisionKind: "cautious-hold",
      reason: "当前只适合保留谨慎轻仓。",
    };
  }

  return {
    ratio: 0,
    decisionKind: "stand-aside",
    reason: "当前不适合持有多头仓位。",
  };
}

function stepUpAggressiveTier(ratio, config, steps = 1) {
  const tiers = [
    0,
    config.targetRatioCautious,
    config.targetRatioProbe,
    config.targetRatioBalanced,
    config.targetRatioStrong,
  ];
  const currentIndex = nearestTierIndex(tiers, ratio);
  const nextIndex = Math.min(tiers.length - 1, currentIndex + steps);
  return tiers[nextIndex];
}

function stepDownAggressiveTier(ratio, config, steps = 1) {
  const tiers = [
    0,
    config.targetRatioCautious,
    config.targetRatioProbe,
    config.targetRatioBalanced,
    config.targetRatioStrong,
  ];
  const currentIndex = nearestTierIndex(tiers, ratio);
  const nextIndex = Math.max(0, currentIndex - steps);
  return tiers[nextIndex];
}

function nearestTierIndex(tiers, ratio) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < tiers.length; index += 1) {
    const distance = Math.abs(tiers[index] - ratio);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function shouldSkipLowEdgeSell(decisionKind, realizedPnlCny, grams, config) {
  if (isProtectiveDecisionKind(decisionKind) || !Number.isFinite(realizedPnlCny) || !Number.isFinite(grams) || grams <= 0) {
    return false;
  }
  if (isProfitTakeDecisionKind(decisionKind)) {
    return realizedPnlCny < config.minProfitTakeTrimPnlCny
      || realizedPnlCny / grams < config.minProfitTakeTrimPnlPerGram;
  }
  return realizedPnlCny < config.minNetTrimPnlCny
    || realizedPnlCny / grams < config.minNetTrimPnlPerGram;
}

function shouldDelayProfitTakeTrim(decisionKind, latest, recentTrade, realizedPnlCny, grams, config) {
  if (!isProfitTakeDecisionKind(decisionKind) || !recentTrade || !isBuyAction(recentTrade.action)) {
    return false;
  }
  if (canBypassProfitTakeCooldown(decisionKind, realizedPnlCny, grams, config)) {
    return false;
  }
  const hoursSinceTrade = diffHours(recentTrade.checkedAt, latest.checkedAt);
  return Number.isFinite(hoursSinceTrade) && hoursSinceTrade < config.minHoursBeforeProfitTakeTrim;
}

function canBypassProfitTakeCooldown(decisionKind, realizedPnlCny, grams, config) {
  if (!isProfitTakeDecisionKind(decisionKind) || !Number.isFinite(realizedPnlCny) || !Number.isFinite(grams) || grams <= 0) {
    return false;
  }
  return realizedPnlCny >= config.cooldownBypassProfitTakePnlCny
    && realizedPnlCny / grams >= config.cooldownBypassProfitTakePnlPerGram;
}

function isProfitTakeDecisionKind(decisionKind) {
  return decisionKind === "trim-overheat" || decisionKind === "hard-trim-overheat";
}

function isSellBiasDecisionKind(decisionKind) {
  return isProfitTakeDecisionKind(decisionKind) || isProtectiveDecisionKind(decisionKind);
}

function isProtectiveDecisionKind(decisionKind) {
  return decisionKind === "exit"
    || decisionKind === "stand-aside"
    || decisionKind === "cautious-hold"
    || decisionKind === "crossdown-cap"
    || decisionKind === "weak-trend-cap"
    || decisionKind === "macro-cap";
}

function getLatestTrade(trades) {
  return Array.isArray(trades) && trades.length > 0 ? trades[trades.length - 1] : null;
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
  if (row.sma20 > row.sma60) score += 12;
  if (row.price > row.sma20) score += 6;
  if (Number.isFinite(row.prevSma20) && Number.isFinite(row.prevSma60) && row.prevSma20 <= row.prevSma60 && row.sma20 > row.sma60) score += 4;
  if (row.price < row.sma200 * 0.99) score -= 12;
  return clamp(score, 0, 38);
}

function scoreMacro(row) {
  if (!row) return 0;
  let score = 14;
  if (Number.isFinite(row.uupRoc20)) score += row.uupRoc20 < -0.01 ? 7 : row.uupRoc20 < 0.03 ? 3 : -8;
  if (Number.isFinite(row.gldRoc20)) score += row.gldRoc20 > 0.01 ? 6 : row.gldRoc20 > -0.02 ? 2 : -6;
  if (Number.isFinite(row.realYield10Y)) score += row.realYield10Y < 1.7 ? 5 : row.realYield10Y < 2.05 ? 1 : -7;
  return clamp(score, 0, 32);
}

function scoreIntraday(latest, intradayStats) {
  if (!latest || !Number.isFinite(latest.priceCnyPerGram)) return 9;
  let score = 9;
  const premium24 = Number.isFinite(intradayStats.sma24) ? latest.priceCnyPerGram / intradayStats.sma24 - 1 : 0;
  const premium6 = Number.isFinite(intradayStats.sma6) ? latest.priceCnyPerGram / intradayStats.sma6 - 1 : 0;

  if (premium24 <= -0.0045) score += 6;
  else if (premium24 <= -0.0025) score += 4;
  else if (premium24 >= 0.0105) score -= 7;
  else if (premium24 >= 0.0065) score -= 4;

  if (premium6 <= -0.002) score += 2;
  else if (premium6 >= 0.004) score -= 2;

  if (Number.isFinite(intradayStats.sma6) && Number.isFinite(intradayStats.sma24)) {
    if (intradayStats.sma6 > intradayStats.sma24 * 1.0008) score += 1;
    if (intradayStats.sma6 < intradayStats.sma24 * 0.9992) score -= 1;
  }

  return clamp(score, 0, 18);
}

function scoreAdvice(latest) {
  const adviceText = `${latest?.highFrequencyAdvice || ""} ${latest?.dailyAdvice || ""} ${latest?.direction || ""}`;
  let score = 8;
  if (adviceText.includes("偏多")) score += 4;
  if (adviceText.includes("中线偏多")) score += 2;
  if (adviceText.includes("观望") || adviceText.includes("等待确认")) score -= 3;
  if (adviceText.includes("偏空") || adviceText.includes("转弱")) score -= 6;
  return clamp(score, 0, 14);
}

function buildDashboardData({ latest, dailyRows, intradayRows, intradayTape, backtest, liveDecision, tradeLog, decisionHistory, portfolioHistory }) {
  const chartSeries = mergeChartSeries(dailyRows, intradayRows, intradayTape, latest);
  const normalizedTrades = normalizeTradeLog(tradeLog);
  const normalizedChartSeries = chartSeries.map((row) => ({
    time: row.timestampLocal,
    date: row.timestampLocal.slice(0, 10),
    priceCnyPerGram: round4(row.price),
  }));
  const movingAverageSeries = buildMovingAverageOverlay(normalizedChartSeries, dailyRows);
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
            label: "持仓成本金价",
            value: round4(liveDecision.portfolio.averageCostCnyPerGram),
          }
        : null,
      movingAverages: movingAverageSeries,
    },
    trades: normalizedTrades,
    decisions: decisionHistory.slice(-50),
    portfolioHistory: portfolioHistory.slice(-200),
  };
}

function buildReport({ latest, backtest, liveDecision }) {
  return `# 虚拟黄金投资报告

## 项目状态
- 本项目已改为可重复运行的持仓续管型 agent。
- 每次运行都会读取最新黄金追踪数据，判断加仓、减仓或继续持有。
- 相同实时快照不会重复下单，只会刷新组合估值。

## 当前策略
- 版本：${STRATEGY.version}
- 名称：${STRATEGY.nameZh || STRATEGY.name}
- 核心思路：${STRATEGY.descriptionZh || STRATEGY.description}
- 买入条件：${(STRATEGY.buyRuleZh || STRATEGY.buyRule).join("；")}
- 卖出条件：${(STRATEGY.sellRuleZh || STRATEGY.sellRule).join("；")}
- 成本假设：买入 0 手续费，卖出 ${CONFIG.sellFeePerGram} 元/克。

## 策略版本记录
${STRATEGY_HISTORY.versions.map((item) => `- ${item.version}：${item.titleZh || item.title}。更新内容：${(item.changesZh || item.changes).join("；")}。原因：${item.reasonZh || item.reason}`).join("\n")}

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
- 最新动作：${liveDecision.order.action}
- 现金：${liveDecision.portfolio.cashCny} 元
- 持有黄金：${liveDecision.portfolio.goldGrams} 克
- 持仓黄金价值：${liveDecision.portfolio.goldMarketValueCny} 元
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
      "v3.2.0 验证了这套短线手续费约束阈值在卖出手续费约束下的可行性。",
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
        real_yield_10y AS realYield10Y
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
    return db.prepare(`
      SELECT
        timestamp_local AS timestampLocal,
        price_cny_per_gram AS price
      FROM intraday_history
      WHERE price_cny_per_gram IS NOT NULL
      ORDER BY timestamp_utc
    `).all();
  } finally {
    db.close();
  }
}

async function loadJsonLines(filePath) {
  const text = cleanText(await readFile(filePath, "utf8"));
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function enrichDailyRows(rows) {
  const filled = rows.map((row) => ({ ...row }));
  fillForward(filled, "realYield10Y");
  for (let i = 0; i < filled.length; i += 1) {
    const row = filled[i];
    row.sma5 = movingAverage(filled, i, 5, "price");
    row.sma20 = movingAverage(filled, i, 20, "price");
    row.sma60 = movingAverage(filled, i, 60, "price");
    row.sma200 = movingAverage(filled, i, 200, "price");
    row.prevSma20 = i > 0 ? filled[i - 1].sma20 : null;
    row.prevSma60 = i > 0 ? filled[i - 1].sma60 : null;
    row.gldRoc20 = rateOfChange(filled, i, 20, "gldClose");
    row.uupRoc20 = rateOfChange(filled, i, 20, "uupClose");
  }
  return filled;
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
  const normalized = Array.isArray(rows) ? rows.slice(-288) : [];
  return {
    sma6: timedMovingAverage(normalized, 6 * 60),
    sma24: timedMovingAverage(normalized, 24 * 60),
  };
}

function timedMovingAverage(rows, windowMinutes) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latestEpoch = parseLocalTimestampEpoch(rows.at(-1)?.timestampLocal);
  if (!Number.isFinite(latestEpoch)) return simpleAverage(rows, 24);

  const windowMs = windowMinutes * 60 * 1000;
  let sum = 0;
  let count = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const epoch = parseLocalTimestampEpoch(row.timestampLocal);
    if (!Number.isFinite(epoch)) continue;
    if (latestEpoch - epoch > windowMs) break;
    if (Number.isFinite(row.price)) {
      sum += row.price;
      count += 1;
    }
  }
  return count > 0 ? sum / count : simpleAverage(rows, 24);
}

function parseLocalTimestampEpoch(value) {
  if (!value || typeof value !== "string") return null;
  const isoText = value.includes("T") ? value : value.replace(" ", "T");
  const epoch = Date.parse(isoText);
  return Number.isFinite(epoch) ? epoch : null;
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

