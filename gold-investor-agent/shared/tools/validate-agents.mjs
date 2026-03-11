import path from "node:path";
import {
  STATE_FILE_NAMES,
  collectAgentSnapshot,
  listAgentDirs,
  loadAgentConfig,
  readJson,
  replayTrades,
  round,
} from "./agent-state-utils.mjs";

const EPSILON_CNY = 0.08;
const EPSILON_GRAMS = 0.0002;
const EPSILON_COST_PER_GRAM = 0.0025;

const agentDirs = await listAgentDirs();
const reports = [];
let hasFailures = false;

for (const agentDir of agentDirs) {
  const config = await loadAgentConfig(agentDir);
  const snapshot = await collectAgentSnapshot(agentDir);
  const tradeLog = await readJson(path.join(config.outputDir, STATE_FILE_NAMES.tradeLog), []);
  const portfolio = snapshot.portfolio;
  const sellFeePerGram = Number.isFinite(snapshot.agentState?.sellFeePerGram)
    ? Number(snapshot.agentState.sellFeePerGram)
    : 4;
  const initialCapital = Number.isFinite(portfolio?.initialCapital)
    ? Number(portfolio.initialCapital)
    : Number.isFinite(snapshot.agentState?.initialCapital)
      ? Number(snapshot.agentState.initialCapital)
      : 100000;
  const replay = replayTrades(tradeLog, { initialCapital, sellFeePerGram });
  const failures = [];
  const warnings = [];

  if (!portfolio || typeof portfolio !== "object") {
    failures.push("missing portfolio.json");
  } else {
    compareNumber(failures, "cashCny", replay.cashCny, portfolio.cashCny, EPSILON_CNY);
    compareNumber(failures, "goldGrams", replay.goldGrams, portfolio.goldGrams, EPSILON_GRAMS);
    compareNumber(failures, "investedCapitalCny", replay.investedCapitalCny, portfolio.investedCapitalCny, EPSILON_CNY);

    const currentPrice = numberOrNull(portfolio.currentPriceCnyPerGram);
    const markPrice = numberOrNull(portfolio.markPriceCnyPerGramAfterExitFee);
    if (currentPrice !== null && markPrice !== null) {
      compareNumber(failures, "markPriceCnyPerGramAfterExitFee", round(currentPrice - sellFeePerGram, 4), markPrice, 0.0002);
    }

    if ((portfolio.goldGrams || 0) > 0 && portfolio.averageCostCnyPerGram !== null) {
      compareNumber(failures, "averageCostCnyPerGram", replay.averageCostCnyPerGram, portfolio.averageCostCnyPerGram, EPSILON_COST_PER_GRAM);
    }

    const expectedGoldMarketValue = round((numberOrZero(portfolio.goldGrams)) * (numberOrZero(portfolio.markPriceCnyPerGramAfterExitFee)), 2);
    compareNumber(failures, "goldMarketValueCny", expectedGoldMarketValue, portfolio.goldMarketValueCny, EPSILON_CNY);

    const expectedEquity = round(numberOrZero(portfolio.cashCny) + expectedGoldMarketValue, 2);
    compareNumber(failures, "equityCny", expectedEquity, portfolio.equityCny, EPSILON_CNY);

    const expectedNetPnl = round(numberOrZero(portfolio.equityCny) - initialCapital, 2);
    compareNumber(failures, "netTotalPnlCny", expectedNetPnl, portfolio.netTotalPnlCny, EPSILON_CNY);

    const expectedUnrealized = round(expectedGoldMarketValue - numberOrZero(portfolio.investedCapitalCny), 2);
    compareNumber(failures, "unrealizedPnlCny", expectedUnrealized, portfolio.unrealizedPnlCny, EPSILON_CNY);

    compareNumber(failures, "costBasisCny", portfolio.investedCapitalCny, portfolio.costBasisCny, EPSILON_CNY);
  }

  const recordedFees = round((Array.isArray(tradeLog) ? tradeLog : []).reduce(
    (sum, trade) => sum + numberOrZero(trade?.sellFeeCny),
    0
  ), 2);
  if (portfolio?.totalFeesCny !== undefined) {
    compareNumber(failures, "totalFeesCny", recordedFees, portfolio.totalFeesCny, EPSILON_CNY);
  }

  if (snapshot.metadata?.id === "agent5-manual-player" && Array.isArray(tradeLog) && tradeLog.some((trade) => trade?.decisionKind === "manual-only" && trade?.action !== "HOLD")) {
    warnings.push("manual agent has non-HOLD trade entries marked as manual-only");
  }

  reports.push({
    folderName: snapshot.folderName,
    status: failures.length ? "failed" : "ok",
    failures,
    warnings,
    summary: portfolio ? {
      cashCny: portfolio.cashCny,
      goldGrams: portfolio.goldGrams,
      equityCny: portfolio.equityCny,
      netTotalPnlCny: portfolio.netTotalPnlCny,
      tradeCount: snapshot.tradeCount,
    } : null,
  });

  if (failures.length) hasFailures = true;
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  agentCount: reports.length,
  ok: !hasFailures,
  reports,
}, null, 2));

if (hasFailures) {
  process.exitCode = 1;
}

function compareNumber(failures, label, expected, actual, tolerance) {
  const left = numberOrNull(expected);
  const right = numberOrNull(actual);
  if (left === null && right === null) return;
  if (left === null || right === null) {
    failures.push(`${label} mismatch: expected ${left}, got ${right}`);
    return;
  }
  if (Math.abs(left - right) > tolerance) {
    failures.push(`${label} mismatch: expected ${left}, got ${right}`);
  }
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
