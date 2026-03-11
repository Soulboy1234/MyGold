import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveAgentsDir, resolveManagedOutputDir } from "../runtime/resolve-agent.mjs";

const DEFAULT_INITIAL_CAPITAL = 100000;
const DEFAULT_SELL_FEE_PER_GRAM = 4;

export const STATE_FILE_NAMES = {
  state: "agent-state.json",
  portfolio: "portfolio.json",
  portfolioHistory: "portfolio-history.json",
  tradeLog: "trade-log.json",
  decisionHistory: "decision-history.json",
  virtualTrade: "virtual-trade.json",
  manualOrder: "manual-order.json",
  pendingOrders: "pending-orders.json",
  backtest: "backtest-summary.json",
  strategyReport: "strategy-report.md",
  dashboardData: "dashboard-data.json",
  strategyHistory: "strategy-history.json",
};

export async function listAgentDirs() {
  const agentsDir = resolveAgentsDir();
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const agentDirs = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "backups") {
      continue;
    }

    const agentDir = path.join(agentsDir, entry.name);
    const metadata = await readJson(path.join(agentDir, "agent.json"), null);
    if (!metadata || typeof metadata !== "object") {
      continue;
    }

    agentDirs.push(agentDir);
  }

  return agentDirs.sort((left, right) => path.basename(left).localeCompare(path.basename(right), "zh-CN"));
}

export async function loadAgentConfig(agentDir) {
  const agentJsonPath = path.join(agentDir, "agent.json");
  const raw = await readJson(agentJsonPath, {});
  const outputDir = resolveManagedOutputDir(agentDir, raw.outputDir || "out");
  const outputDirName = path.relative(agentDir, outputDir) || "out";
  return {
    agentDir,
    agentJsonPath,
    outputDirName,
    outputDir,
    raw,
  };
}

export async function readJson(filePath, fallbackValue = null) {
  try {
    return JSON.parse(cleanText(await readFile(filePath, "utf8")));
  } catch {
    return fallbackValue;
  }
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function copyDirectory(sourceDir, targetDir) {
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

export function buildInitialPortfolio(initialCapital = DEFAULT_INITIAL_CAPITAL) {
  return {
    initialCapital,
    cashCny: initialCapital,
    goldGrams: 0,
    averageCostCnyPerGram: null,
    investedCapitalCny: 0,
    currentPriceCnyPerGram: null,
    markPriceCnyPerGramAfterExitFee: null,
    goldMarketValueCny: 0,
    costBasisCny: 0,
    equityCny: initialCapital,
    unrealizedPnlCny: 0,
    netTotalPnlCny: 0,
    totalPnlCny: 0,
  };
}

export function buildInitialAgentState(initialCapital = DEFAULT_INITIAL_CAPITAL, sellFeePerGram = DEFAULT_SELL_FEE_PER_GRAM) {
  return {
    lastProcessedCheckedAt: null,
    lastAction: null,
    lastDecisionKind: null,
    lastUpdatedAtLocal: null,
    initialCapital,
    sellFeePerGram,
  };
}

export function buildInitialVirtualTrade() {
  return {
    checkedAt: null,
    checkedAtLocal: null,
    action: "HOLD",
    decisionKind: "reset",
    reason: "State reset; waiting for the first post-reset run.",
    targetPositionRatio: 0,
    currentPositionRatio: 0,
    amountCny: 0,
    grams: 0,
    priceCnyPerGram: null,
    realizedPnlCny: null,
    profitable: null,
  };
}

export async function resetAgentOutputs(agentDir, options = {}) {
  const initialCapital = Number.isFinite(options.initialCapital) ? options.initialCapital : DEFAULT_INITIAL_CAPITAL;
  const sellFeePerGram = Number.isFinite(options.sellFeePerGram) ? options.sellFeePerGram : DEFAULT_SELL_FEE_PER_GRAM;
  const { outputDir } = await loadAgentConfig(agentDir);
  await mkdir(outputDir, { recursive: true });

  await Promise.all([
    writeJson(path.join(outputDir, STATE_FILE_NAMES.state), buildInitialAgentState(initialCapital, sellFeePerGram)),
    writeJson(path.join(outputDir, STATE_FILE_NAMES.portfolio), buildInitialPortfolio(initialCapital)),
    writeJson(path.join(outputDir, STATE_FILE_NAMES.portfolioHistory), []),
    writeJson(path.join(outputDir, STATE_FILE_NAMES.tradeLog), []),
    writeJson(path.join(outputDir, STATE_FILE_NAMES.decisionHistory), []),
    writeJson(path.join(outputDir, STATE_FILE_NAMES.virtualTrade), buildInitialVirtualTrade()),
    writeJson(path.join(outputDir, STATE_FILE_NAMES.manualOrder), null),
    writeJson(path.join(outputDir, STATE_FILE_NAMES.pendingOrders), []),
  ]);
}

export async function collectAgentSnapshot(agentDir) {
  const config = await loadAgentConfig(agentDir);
  const portfolio = await readJson(path.join(config.outputDir, STATE_FILE_NAMES.portfolio), null);
  const tradeLog = await readJson(path.join(config.outputDir, STATE_FILE_NAMES.tradeLog), []);
  const agentState = await readJson(path.join(config.outputDir, STATE_FILE_NAMES.state), null);
  return {
    agentDir,
    folderName: path.basename(agentDir),
    metadata: config.raw,
    portfolio,
    tradeCount: Array.isArray(tradeLog) ? tradeLog.length : 0,
    agentState,
  };
}

export function replayTrades(tradeLog, options = {}) {
  const initialCapital = Number.isFinite(options.initialCapital) ? options.initialCapital : DEFAULT_INITIAL_CAPITAL;
  const sellFeePerGram = Number.isFinite(options.sellFeePerGram) ? options.sellFeePerGram : DEFAULT_SELL_FEE_PER_GRAM;
  let cashCny = initialCapital;
  let goldGrams = 0;
  let investedCapitalCny = 0;
  let totalFeesCny = 0;
  let averageCostCnyPerGram = null;

  for (const trade of Array.isArray(tradeLog) ? tradeLog : []) {
    const action = String(trade?.action || "");
    const grams = finiteNumber(trade?.grams, 0);
    if (isBuyAction(action)) {
      const amountCny = finiteNumber(trade?.amountCny, finiteNumber(trade?.capitalUsedCny, 0));
      cashCny -= amountCny;
      goldGrams += grams;
      investedCapitalCny += amountCny;
      averageCostCnyPerGram = goldGrams > 0 ? investedCapitalCny / goldGrams : null;
      continue;
    }

    if (!isSellAction(action)) {
      continue;
    }

    const priceCnyPerGram = finiteNumber(trade?.priceCnyPerGram, 0);
    const grossProceedsCny = finiteNumber(trade?.grossProceedsCny, priceCnyPerGram * grams);
    const sellFeeCny = finiteNumber(trade?.sellFeeCny, grams * sellFeePerGram);
    const netProceedsCny = finiteNumber(trade?.netProceedsCny, grossProceedsCny - sellFeeCny);
    const sellCostBasisCny = finiteNumber(
      trade?.sellCostBasisCny,
      (averageCostCnyPerGram || 0) * grams
    );

    cashCny += netProceedsCny;
    goldGrams -= grams;
    investedCapitalCny -= sellCostBasisCny;
    totalFeesCny += sellFeeCny;

    if (goldGrams <= 1e-8) {
      goldGrams = 0;
      investedCapitalCny = 0;
      averageCostCnyPerGram = null;
    } else {
      averageCostCnyPerGram = investedCapitalCny / goldGrams;
    }
  }

  return {
    cashCny: round(cashCny, 2),
    goldGrams: round(goldGrams, 4),
    investedCapitalCny: round(investedCapitalCny, 2),
    averageCostCnyPerGram: averageCostCnyPerGram === null ? null : round(averageCostCnyPerGram, 4),
    totalFeesCny: round(totalFeesCny, 2),
  };
}

export function buildBackupLabel(date = new Date(), label = "snapshot") {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("-");
  return `${stamp}_${label}`;
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function isBuyAction(action) {
  return action === "BUY" || action === "BUY_MORE";
}

function isSellAction(action) {
  return action === "SELL" || action === "SELL_PART" || action === "SELL_ALL";
}

function cleanText(value) {
  return String(value).replace(/^\uFEFF/, "");
}
