import { spawn } from "node:child_process";
import { access, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_AGENT_NAME,
  normalizeAgentName,
  resolveAgentDir,
  resolveManagedOutputPath,
  resolveAgentMetadataPath,
  resolveAgentsDir,
  resolveProjectRoot,
} from "./resolve-agent.mjs";
import {
  buildBackupLabel,
  buildInitialPortfolio,
  copyDirectory,
  readJson as readToolJson,
  resetAgentOutputs,
} from "../tools/agent-state-utils.mjs";

const DEFAULT_SELL_FEE_PER_GRAM = 4;
const AGENT_RUN_TIMEOUT_MS = 5 * 60 * 1000;
const AGENT_FORCE_KILL_GRACE_MS = 5 * 1000;
const MAX_CAPTURED_OUTPUT_LENGTH = 16 * 1024;

export async function listAgentMetas() {
  await cleanupLegacyRootOutDir();
  const market = await loadSharedMarketSnapshot();
  const agentsDir = resolveAgentsDir();
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const agentEntries = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "backups") {
      continue;
    }
    const hasAgentJson = await exists(path.join(agentsDir, entry.name, "agent.json"));
    if (!hasAgentJson) {
      continue;
    }
    agentEntries.push(entry.name);
  }
  const metas = await Promise.all(agentEntries.map((entry) => loadAgentMeta(entry, { market })));
  return metas.sort((left, right) => left.folderName.localeCompare(right.folderName, "zh-CN"));
}

export async function loadAgentMeta(folderName, options = {}) {
  await cleanupLegacyRootOutDir();
  const canonicalFolderName = normalizeAgentName(folderName);
  const agentDir = resolveAgentDir(canonicalFolderName);
  const agentJsonPath = resolveAgentMetadataPath(canonicalFolderName);
  const raw = await readJsonIfExists(agentJsonPath, {});
  const outputDir = raw.outputDir || "out";
  const entry = raw.entry || "agent.mjs";
  const dashboardPath = resolveManagedOutputPath(agentDir, outputDir, "dashboard-data.json");
  const portfolioPath = resolveManagedOutputPath(agentDir, outputDir, "portfolio.json");
  const tradesPath = resolveManagedOutputPath(agentDir, outputDir, "trade-log.json");
  const hasDashboard = await exists(dashboardPath);
  const autoRunEnabled = typeof raw.autoRunEnabled === "boolean"
    ? raw.autoRunEnabled
    : canonicalFolderName === DEFAULT_AGENT_NAME;
  const portfolio = await readJsonIfExists(portfolioPath, null);
  const trades = await readJsonIfExists(tradesPath, []);
  const market = options.market || await loadSharedMarketSnapshot();
  const snapshot = buildAgentSnapshot(portfolio, market);
  const lastExecutedTrade = findLastExecutedTrade(trades);

  return {
    id: raw.id || canonicalFolderName,
    folderName: raw.folderName || canonicalFolderName,
    displayName: raw.displayName || canonicalFolderName,
    role: raw.role || "",
    entry,
    outputDir,
    status: raw.status || (hasDashboard ? "ready" : "empty"),
    strategyVersion: raw.strategyVersion || "",
    hasDashboard,
    autoRunEnabled,
    manualTradingEnabled: Boolean(raw.manualTradingEnabled),
    lastTradeAtLocal: lastExecutedTrade?.checkedAtLocal || lastExecutedTrade?.time || null,
    lastTradeAction: lastExecutedTrade?.action || null,
    ...snapshot,
  };
}

export async function setAgentAutoRun(folderName, enabled) {
  await cleanupLegacyRootOutDir();
  const canonicalFolderName = normalizeAgentName(folderName);
  const agentJsonPath = resolveAgentMetadataPath(canonicalFolderName);
  const current = await readJsonIfExists(agentJsonPath, {});
  const next = {
    ...current,
    folderName: current.folderName || canonicalFolderName,
    displayName: current.displayName || canonicalFolderName,
    outputDir: current.outputDir || "out",
    entry: current.entry || "agent.mjs",
    autoRunEnabled: enabled,
  };
  await writeFile(agentJsonPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  return loadAgentMeta(canonicalFolderName);
}

export async function resetAgentState(folderName, options = {}) {
  await cleanupLegacyRootOutDir();
  const canonicalFolderName = normalizeAgentName(folderName);
  const meta = await loadAgentMeta(canonicalFolderName);
  const agentDir = resolveAgentDir(canonicalFolderName);
  const initialCapital = Number.isFinite(options.initialCapital) ? options.initialCapital : 100000;
  const sellFeePerGram = Number.isFinite(options.sellFeePerGram) ? options.sellFeePerGram : DEFAULT_SELL_FEE_PER_GRAM;

  await createResetSafetyBackup(meta);
  await resetAgentOutputs(agentDir, { initialCapital, sellFeePerGram });
  await refreshDashboardDataAfterReset(meta, { initialCapital, sellFeePerGram });
  return loadAgentMeta(canonicalFolderName);
}

export async function runAgentOnce(agentName) {
  await cleanupLegacyRootOutDir();
  const meta = await loadAgentMeta(normalizeAgentName(agentName));
  const agentFile = path.join(resolveAgentDir(meta.folderName), meta.entry);
  await runAgentProcess(agentFile, meta.folderName);
}

export async function submitManualTrade(agentName, request) {
  const meta = await loadAgentMeta(normalizeAgentName(agentName));
  if (!meta.manualTradingEnabled) {
    throw new Error("Manual trading is not enabled for this agent");
  }

  const instruction = normalizeManualTradeRequest(request);
  const manualOrderPath = resolveManagedOutputPath(
    resolveAgentDir(meta.folderName),
    meta.outputDir,
    "manual-order.json"
  );

  await writeFile(manualOrderPath, JSON.stringify(instruction, null, 2) + "\n", "utf8");
  await runAgentOnce(meta.folderName);
  return loadAgentMeta(meta.folderName);
}

export async function submitPendingOrder(agentName, request) {
  const meta = await loadAgentMeta(normalizeAgentName(agentName));
  if (!meta.manualTradingEnabled) {
    throw new Error("Pending orders are not enabled for this agent");
  }

  const pendingOrdersPath = resolveManagedOutputPath(
    resolveAgentDir(meta.folderName),
    meta.outputDir,
    "pending-orders.json"
  );
  const current = await readJsonIfExists(pendingOrdersPath, []);
  const nextOrder = normalizePendingOrderRequest(request);
  const nextList = Array.isArray(current) ? [...current, nextOrder] : [nextOrder];
  await writeFile(pendingOrdersPath, JSON.stringify(nextList, null, 2) + "\n", "utf8");
  return nextOrder;
}

export async function cancelPendingOrder(agentName, orderId) {
  const meta = await loadAgentMeta(normalizeAgentName(agentName));
  if (!meta.manualTradingEnabled) {
    throw new Error("Pending orders are not enabled for this agent");
  }
  if (!orderId) {
    throw new Error("Missing pending order id");
  }

  const pendingOrdersPath = resolveManagedOutputPath(
    resolveAgentDir(meta.folderName),
    meta.outputDir,
    "pending-orders.json"
  );
  const current = await readJsonIfExists(pendingOrdersPath, []);
  const nextList = Array.isArray(current) ? current.filter((item) => item?.id !== orderId) : [];
  await writeFile(pendingOrdersPath, JSON.stringify(nextList, null, 2) + "\n", "utf8");
  return { removed: Array.isArray(current) ? current.length !== nextList.length : false };
}

export async function loadComparablePortfolioSnapshot(folderName, options = {}) {
  const meta = await loadAgentMeta(normalizeAgentName(folderName), options);
  const portfolioPath = resolveManagedOutputPath(resolveAgentDir(meta.folderName), meta.outputDir, "portfolio.json");
  const portfolio = await readJsonIfExists(portfolioPath, null);
  const market = options.market || await loadSharedMarketSnapshot();
  return buildAgentSnapshot(portfolio, market);
}

export async function loadSharedMarketSnapshot() {
  const latestPath = path.join(resolveProjectRoot(), "..", "gold-monitor", "state", "latest.json");
  const latest = await readJsonIfExists(latestPath, null);
  if (!latest || !Number.isFinite(latest.priceCnyPerGram)) return null;
  return {
    checkedAt: latest.checkedAt || null,
    checkedAtLocal: latest.checkedAtLocal || null,
    symbol: latest.symbol || null,
    priceUsdPerOz: Number.isFinite(latest.priceUsdPerOz) ? Number(latest.priceUsdPerOz) : null,
    priceCnyPerGram: Number(latest.priceCnyPerGram),
    usdCnyRate: Number.isFinite(latest.usdCnyRate) ? Number(latest.usdCnyRate) : null,
    changePct: Number.isFinite(latest.changePct) ? Number(latest.changePct) : null,
    direction: latest.direction || null,
    isAlert: Boolean(latest.isAlert),
    message: latest.message || null,
  };
}

function buildAgentSnapshot(portfolio, market = null) {
  if (!portfolio || typeof portfolio !== "object") {
    return {
      netTotalPnlCny: null,
      equityCny: null,
      cashCny: null,
      goldGrams: null,
      goldMarketValueCny: null,
      averageCostCnyPerGram: null,
      costBasisCny: null,
      currentPriceCnyPerGram: market?.priceCnyPerGram ?? null,
      valuationCheckedAtLocal: market?.checkedAtLocal ?? null,
    };
  }

  const marked = remarkPortfolioWithMarket(portfolio, market);
  return {
    netTotalPnlCny: marked.netTotalPnlCny,
    equityCny: marked.equityCny,
    cashCny: marked.cashCny,
    goldGrams: marked.goldGrams,
    goldMarketValueCny: marked.goldMarketValueCny,
    averageCostCnyPerGram: marked.averageCostCnyPerGram,
    costBasisCny: marked.costBasisCny,
    currentPriceCnyPerGram: marked.currentPriceCnyPerGram,
    valuationCheckedAtLocal: market?.checkedAtLocal ?? null,
  };
}

function remarkPortfolioWithMarket(portfolio, market) {
  if (!market || !Number.isFinite(market.priceCnyPerGram)) {
    return {
      netTotalPnlCny: Number.isFinite(portfolio.netTotalPnlCny) ? portfolio.netTotalPnlCny : null,
      equityCny: Number.isFinite(portfolio.equityCny) ? portfolio.equityCny : null,
      cashCny: Number.isFinite(portfolio.cashCny) ? portfolio.cashCny : null,
      goldGrams: Number.isFinite(portfolio.goldGrams) ? portfolio.goldGrams : null,
      currentPriceCnyPerGram: Number.isFinite(portfolio.currentPriceCnyPerGram) ? portfolio.currentPriceCnyPerGram : null,
      goldMarketValueCny: Number.isFinite(portfolio.goldMarketValueCny) ? portfolio.goldMarketValueCny : null,
      averageCostCnyPerGram: Number.isFinite(portfolio.averageCostCnyPerGram) ? portfolio.averageCostCnyPerGram : null,
      costBasisCny: Number.isFinite(portfolio.costBasisCny) ? portfolio.costBasisCny : null,
      unrealizedPnlCny: Number.isFinite(portfolio.unrealizedPnlCny) ? portfolio.unrealizedPnlCny : null,
    };
  }

  const cashCny = Number.isFinite(portfolio.cashCny) ? round2(portfolio.cashCny) : null;
  const goldGrams = Number.isFinite(portfolio.goldGrams) ? round4(portfolio.goldGrams) : null;
  const averageCostCnyPerGram = Number.isFinite(portfolio.averageCostCnyPerGram)
    ? round4(portfolio.averageCostCnyPerGram)
    : null;
  const investedCapitalCny = Number.isFinite(portfolio.investedCapitalCny)
    ? portfolio.investedCapitalCny
    : Number.isFinite(portfolio.costBasisCny)
      ? portfolio.costBasisCny
      : (goldGrams || 0) * (averageCostCnyPerGram || 0);
  const initialCapital = Number.isFinite(portfolio.initialCapital) ? portfolio.initialCapital : 100000;
  const sellFeePerGram = inferSellFeePerGram(portfolio);
  const markPriceCnyPerGramAfterExitFee = round4(Math.max(0, market.priceCnyPerGram - sellFeePerGram));
  const goldMarketValueCny = round2((goldGrams || 0) * markPriceCnyPerGramAfterExitFee);
  const equityCny = round2((cashCny || 0) + goldMarketValueCny);
  const netTotalPnlCny = round2(equityCny - initialCapital);
  const unrealizedPnlCny = round2(goldMarketValueCny - round2(investedCapitalCny));

  return {
    cashCny,
    goldGrams,
    averageCostCnyPerGram,
    costBasisCny: round2(investedCapitalCny),
    currentPriceCnyPerGram: round4(market.priceCnyPerGram),
    goldMarketValueCny,
    equityCny,
    netTotalPnlCny,
    unrealizedPnlCny,
    markPriceCnyPerGramAfterExitFee,
  };
}

function inferSellFeePerGram(portfolio) {
  const current = Number(portfolio?.currentPriceCnyPerGram);
  const marked = Number(portfolio?.markPriceCnyPerGramAfterExitFee);
  const inferred = current - marked;
  return Number.isFinite(inferred) && inferred >= 0 ? inferred : DEFAULT_SELL_FEE_PER_GRAM;
}

function findLastExecutedTrade(trades) {
  if (!Array.isArray(trades)) return null;
  for (let index = trades.length - 1; index >= 0; index -= 1) {
    const trade = trades[index];
    if (!trade || typeof trade !== "object") continue;
    const action = String(trade.action || "").toUpperCase();
    if (action.startsWith("BUY") || action.startsWith("SELL")) {
      return trade;
    }
  }
  return null;
}

function normalizeManualTradeRequest(request) {
  const action = String(request?.action || "").toUpperCase();
  const mode = request?.mode === "grams" ? "grams" : request?.mode === "amountCny" ? "amountCny" : null;
  const value = Number(request?.value);

  if (!["BUY", "SELL"].includes(action)) {
    throw new Error("Invalid manual trade action");
  }
  if (!mode) {
    throw new Error("Invalid manual trade mode");
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Manual trade value must be greater than 0");
  }

  return {
    action,
    mode,
    value: round(mode === "grams" ? value : value, mode === "grams" ? 4 : 2),
    requestedAt: new Date().toISOString(),
  };
}

function normalizePendingOrderRequest(request) {
  const base = normalizeManualTradeRequest(request);
  const triggerPriceCnyPerGram = Number(request?.triggerPriceCnyPerGram);
  if (!Number.isFinite(triggerPriceCnyPerGram) || triggerPriceCnyPerGram <= 0) {
    throw new Error("Pending order trigger price must be greater than 0");
  }

  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...base,
    triggerPriceCnyPerGram: round4(triggerPriceCnyPerGram),
    createdAt: new Date().toISOString(),
  };
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

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupLegacyRootOutDir() {
  const legacyOutDir = path.join(resolveProjectRoot(), "out");
  if (!await exists(legacyOutDir)) {
    return;
  }

  try {
    const entries = await readdir(legacyOutDir);
    if (entries.length === 0) {
      await rm(legacyOutDir, { recursive: true, force: true });
    }
  } catch {
  }
}

async function refreshDashboardDataAfterReset(meta, options = {}) {
  const agentDir = resolveAgentDir(meta.folderName);
  const dashboardPath = resolveManagedOutputPath(agentDir, meta.outputDir, "dashboard-data.json");
  const existingDashboard = await readToolJson(dashboardPath, {});
  const market = await loadSharedMarketSnapshot();
  const initialPortfolio = buildInitialPortfolio(options.initialCapital);
  const summary = buildAgentSnapshot(initialPortfolio, market);

  const nextDashboard = {
    ...existingDashboard,
    generatedAt: new Date().toISOString(),
    latest: market
      ? {
          ...(existingDashboard?.latest || {}),
          ...market,
        }
      : (existingDashboard?.latest || null),
    summary: {
      ...(existingDashboard?.summary || {}),
      ...summary,
      latestAction: "HOLD",
      totalFeesCny: 0,
      realizedPnlCny: 0,
      unrealizedPnlCny: 0,
      totalPnlCny: 0,
      netTotalPnlCny: summary.netTotalPnlCny ?? 0,
      valuationCheckedAtLocal: market?.checkedAtLocal || null,
    },
    latestAction: "HOLD",
    trades: [],
    tradeMarkers: [],
    decisionHistory: [],
    manualControls: {
      ...(existingDashboard?.manualControls || {}),
      pendingOrders: [],
    },
    chart: existingDashboard?.chart
      ? {
          ...existingDashboard.chart,
          tradeMarkers: [],
          averageCostLine: null,
        }
      : existingDashboard?.chart,
  };

  await writeFile(dashboardPath, JSON.stringify(nextDashboard, null, 2) + "\n", "utf8");
}

async function createResetSafetyBackup(meta) {
  const agentDir = resolveAgentDir(meta.folderName);
  const sourceOutDir = resolveManagedOutputPath(agentDir, meta.outputDir);
  if (!await exists(sourceOutDir)) {
    return;
  }

  const backupRoot = path.join(resolveAgentsDir(), "backups");
  const backupLabel = buildBackupLabel(new Date(), `${meta.folderName}-pre-reset`);
  const targetDir = path.join(backupRoot, backupLabel, "out");
  await copyDirectory(sourceOutDir, targetDir);
}

async function runAgentProcess(agentFile, folderName) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [agentFile], {
      cwd: path.dirname(agentFile),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let timedOut = false;
    let stdout = "";
    let stderr = "";
    let forceKillHandle = null;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillHandle = setTimeout(() => {
        child.kill("SIGKILL");
      }, AGENT_FORCE_KILL_GRACE_MS);
    }, AGENT_RUN_TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout = appendCapturedOutput(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendCapturedOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      clearTimeout(forceKillHandle);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeoutHandle);
      clearTimeout(forceKillHandle);
      if (timedOut) {
        reject(new Error(`Agent run timed out after ${Math.round(AGENT_RUN_TIMEOUT_MS / 1000)}s: ${folderName}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }

      const details = [stderr.trim(), stdout.trim()].find(Boolean);
      const suffix = details ? `\n${details}` : signal ? ` (signal: ${signal})` : "";
      reject(new Error(`Agent run failed: ${folderName}${suffix}`));
    });
  });
}

function appendCapturedOutput(current, chunk) {
  const next = `${current}${chunk}`;
  if (next.length <= MAX_CAPTURED_OUTPUT_LENGTH) {
    return next;
  }
  return next.slice(-MAX_CAPTURED_OUTPUT_LENGTH);
}

async function readJsonIfExists(filePath, fallbackValue) {
  try {
    return JSON.parse(cleanText(await readFile(filePath, "utf8")));
  } catch {
    return fallbackValue;
  }
}

function cleanText(value) {
  return String(value).replace(/^\uFEFF/, "");
}
