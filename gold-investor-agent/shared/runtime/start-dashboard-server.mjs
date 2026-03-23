import { createServer } from "node:http";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  cancelPendingOrder,
  listAgentMetas,
  loadAgentMeta,
  loadComparablePortfolioSnapshot,
  loadSharedMarketSnapshot,
  resetAgentState,
  runAgentOnce,
  setAgentAutoRun,
  submitManualTrade,
  submitPendingOrder,
} from "./agent-control.mjs";
import {
  resolveAgentName,
  resolveAgentDir,
  resolveManagedOutputPath,
  resolveProjectRoot,
} from "./resolve-agent.mjs";

const PORT = Number(process.env.PORT || 3080);
const SERVER_BINDING = resolveServerBinding();
const HOST = SERVER_BINDING.host;
const WRITE_TOKEN = crypto.randomUUID();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SHARED_CHART_CACHE_TTL_MS = 15 * 1000;
let sharedChartCache = {
  expiresAt: 0,
  series: null,
};

export function startDashboardServer() {
  const projectRoot = resolveProjectRoot();
  const publicDir = path.join(projectRoot, "public");
  const defaultAgent = resolveAgentName();

  const server = createServer(async (req, res) => {
    try {
      if (!isRequestAllowed(req, SERVER_BINDING.mode)) {
        res.writeHead(403, buildHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        }));
        res.end("Forbidden");
        return;
      }

      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

      if (req.method === "GET" && url.pathname === "/api/agents") {
        return respondJson(res, {
          defaultAgent,
          appVersion: await loadAppVersion(projectRoot),
          security: buildSecurityDescriptor(),
          agents: await listAgentMetas(),
        });
      }

      if (req.method === "GET" && url.pathname === "/api/dashboard") {
        const requestedAgent = url.searchParams.get("agent") || defaultAgent;
        const payload = await loadDashboardPayload(requestedAgent);
        if (!payload) return respondJson(res, { error: "Dashboard data not found" }, 404);
        return respondJson(res, payload);
      }

      if (req.method === "POST" && url.pathname === "/api/agents/start") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const meta = await setAgentAutoRun(agentName, true);
        await runAgentOnce(agentName);
        return respondJson(res, { ok: true, agent: await loadAgentMeta(meta.folderName) });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/stop") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const meta = await setAgentAutoRun(agentName, false);
        return respondJson(res, { ok: true, agent: meta });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/reset") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const meta = await resetAgentState(agentName, { initialCapital: 100000 });
        const payload = await loadDashboardPayload(meta.folderName);
        return respondJson(res, { ok: true, agent: meta, payload });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/manual-trade") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const requestBody = await readJsonBody(req);
        await submitManualTrade(agentName, requestBody);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, payload });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/pending-order") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const requestBody = await readJsonBody(req);
        const order = await submitPendingOrder(agentName, requestBody);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, order, payload });
      }

      if (req.method === "DELETE" && url.pathname === "/api/agents/pending-order") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        const orderId = url.searchParams.get("id");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        if (!orderId) return respondJson(res, { error: "Missing pending order id" }, 400);
        const result = await cancelPendingOrder(agentName, orderId);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, ...result, payload });
      }

      const filePath = resolvePublicPath(publicDir, url.pathname);
      return respondFile(res, filePath);
    } catch (error) {
      res.writeHead(error.statusCode || 500, buildHeaders({
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      }));
      res.end(`Server error: ${error.message}`);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Gold investor dashboard (${defaultAgent}) running at http://${HOST}:${PORT} [mode=${SERVER_BINDING.mode}]`);
  });

  return server;
}

async function loadDashboardPayload(agentName) {
  const market = await loadSharedMarketSnapshot();
  const agentMeta = await loadAgentMeta(agentName, { market });
  if (!agentMeta) return null;

  const dashboardFile = resolveManagedOutputPath(
    resolveAgentDir(agentMeta.folderName),
    agentMeta.outputDir || "out",
    "dashboard-data.json"
  );
  const pendingOrdersFile = resolveManagedOutputPath(
    resolveAgentDir(agentMeta.folderName),
    agentMeta.outputDir || "out",
    "pending-orders.json"
  );
  try {
    const payload = JSON.parse(cleanText(await readFile(dashboardFile, "utf8")));
    const pendingOrders = await readJsonFile(pendingOrdersFile, []);
    const comparableSummary = await loadComparablePortfolioSnapshot(agentMeta.folderName, { market });
    const latestAction = payload.summary?.latestAction || payload.latestAction || payload.agent?.lastAction || null;
    const sharedChartSeries = await loadSharedChartSeries();
    const chart = patchChartPayload(payload.chart, sharedChartSeries);
    return compactDashboardPayload({
      ...payload,
      chart,
      manualControls: {
        ...(payload.manualControls || {}),
        pendingOrders: Array.isArray(pendingOrders) ? pendingOrders : [],
      },
      latest: market ? {
        ...(payload.latest || {}),
        ...market,
        priceCnyPerGram: comparableSummary.currentPriceCnyPerGram,
      } : payload.latest,
      summary: {
        ...(payload.summary || {}),
        ...comparableSummary,
        latestAction,
        valuationCheckedAtLocal: market?.checkedAtLocal || null,
      },
      agent: agentMeta,
    });
  } catch {
    return { agent: agentMeta, missing: true };
  }
}

function patchChartPayload(chart, sharedSeries) {
  if (!chart || !Array.isArray(sharedSeries) || sharedSeries.length === 0) {
    return chart;
  }

  const patchedMarkers = Array.isArray(chart.tradeMarkers)
    ? chart.tradeMarkers.map((marker) => ({
        ...marker,
        priceCnyPerGram:
          findChartPrice(sharedSeries, marker.time) ??
          findChartPrice(sharedSeries, marker.date) ??
          marker.priceCnyPerGram ??
          null,
      }))
    : chart.tradeMarkers;

  return {
    ...chart,
    series: sharedSeries,
    tradeMarkers: patchedMarkers,
  };
}

function compactDashboardPayload(payload) {
  const chart = payload?.chart;
  if (!chart || !Array.isArray(chart.series)) return payload;
  return {
    ...payload,
    chart: {
      ...chart,
      series: sampleDashboardSeries(chart.series),
      movingAverages: undefined,
    },
  };
}

function sampleDashboardSeries(series) {
  if (!Array.isArray(series) || series.length <= 18000) return series;
  const intradayStartMs = Date.UTC(2012, 5, 27, 0, 0, 0);
  const lastTime = parseDashboardTime(series.at(-1)?.time);
  if (!Number.isFinite(lastTime)) return series;
  const recentFullCutoffMs = lastTime - 30 * 24 * 60 * 60 * 1000;
  const mediumCutoffMs = lastTime - 365 * 24 * 60 * 60 * 1000;
  return series.filter((point) => {
    const timeMs = parseDashboardTime(point?.time);
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

function parseDashboardTime(value) {
  if (typeof value !== "string") return Number.NaN;
  return new Date(String(value).replace(" ", "T")).getTime();
}

function findChartPrice(series, timeOrDate) {
  if (typeof timeOrDate !== "string" || !timeOrDate) return null;
  const target = timeOrDate.length === 10 ? `${timeOrDate} 23:59:59` : timeOrDate;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i]?.time <= target) return series[i]?.priceCnyPerGram ?? null;
  }
  return series.at(-1)?.priceCnyPerGram ?? null;
}

async function loadSharedChartSeries() {
  const now = Date.now();
  if (Array.isArray(sharedChartCache.series) && sharedChartCache.expiresAt > now) {
    return sharedChartCache.series;
  }

  const projectRoot = resolveProjectRoot();
  const workspaceRoot = path.resolve(projectRoot, "..");
  const dailyDbPath = path.join(workspaceRoot, "gold-dashboard", "data", "history.db");
  const intradayDbPath = path.join(workspaceRoot, "gold-dashboard", "data", "highres.db");
  const intradayJsonlPath = path.join(workspaceRoot, "gold-monitor", "state", "high_frequency_history.jsonl");
  const latestPath = path.join(workspaceRoot, "gold-monitor", "state", "latest.json");

  const [dailyRows, intradayRows, intradayTape, latest] = await Promise.all([
    loadDailyChartRows(dailyDbPath),
    loadIntradayChartRows(intradayDbPath),
    readJsonLinesFile(intradayJsonlPath),
    readJsonFile(latestPath, null),
  ]);

  const intradaySeries = mergeIntradayChartSeries(intradayRows, intradayTape, latest);
  const firstIntradayDate = intradaySeries[0]?.time?.slice(0, 10) ?? null;
  const series = [];

  for (const row of dailyRows) {
    if (firstIntradayDate && row.date >= firstIntradayDate) continue;
    series.push({
      time: `${row.date} 15:00:00`,
      date: row.date,
      priceCnyPerGram: row.priceCnyPerGram,
    });
  }

  for (const row of intradaySeries) {
    series.push(row);
  }

  const sampledSeries = sampleDashboardSeries(series);
  sharedChartCache = {
    expiresAt: now + SHARED_CHART_CACHE_TTL_MS,
    series: sampledSeries,
  };
  return sampledSeries;
}

async function loadDailyChartRows(dbPath) {
  if (!existsSync(dbPath)) {
    return [];
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readonly: true });
    return db.prepare(`
      SELECT
        date,
        price_cny_per_gram AS priceCnyPerGram
      FROM daily_history
      WHERE price_cny_per_gram IS NOT NULL
      ORDER BY date
    `).all();
  } finally {
    db?.close();
  }
}

async function loadIntradayChartRows(dbPath) {
  if (!existsSync(dbPath)) {
    return [];
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readonly: true });
    const recentCutoffUtc = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const mediumCutoffUtc = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);

    return db.prepare(`
      WITH sampled AS (
        SELECT
          timestamp_local AS timestampLocal,
          price_cny_per_gram AS priceCnyPerGram,
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
      SELECT timestampLocal, priceCnyPerGram
      FROM sampled
      ORDER BY timestampUtc
    `).all(recentCutoffUtc, mediumCutoffUtc, recentCutoffUtc, mediumCutoffUtc);
  } finally {
    db?.close();
  }
}

function mergeIntradayChartSeries(intradayRows, intradayTape, latest) {
  const map = new Map();

  for (const row of intradayRows) {
    const timestampLocal = normalizeLocalTimestamp(row?.timestampLocal);
    const priceCnyPerGram = Number(row?.priceCnyPerGram);
    if (!timestampLocal || !Number.isFinite(priceCnyPerGram)) continue;
    map.set(timestampLocal, {
      time: timestampLocal,
      date: timestampLocal.slice(0, 10),
      priceCnyPerGram,
    });
  }

  for (const row of Array.isArray(intradayTape) ? intradayTape : []) {
    const timestampLocal = normalizeLocalTimestamp(row?.checkedAtLocal);
    const priceCnyPerGram = Number(row?.priceCnyPerGram);
    if (!timestampLocal || !Number.isFinite(priceCnyPerGram)) continue;
    map.set(timestampLocal, {
      time: timestampLocal,
      date: timestampLocal.slice(0, 10),
      priceCnyPerGram,
    });
  }

  const latestTime = normalizeLocalTimestamp(latest?.checkedAtLocal);
  const latestPrice = Number(latest?.priceCnyPerGram);
  if (latestTime && Number.isFinite(latestPrice)) {
    map.set(latestTime, {
      time: latestTime,
      date: latestTime.slice(0, 10),
      priceCnyPerGram: latestPrice,
    });
  }

  return [...map.values()].sort((left, right) => parseDashboardTime(left.time) - parseDashboardTime(right.time));
}

async function readJsonLinesFile(filePath) {
  try {
    const text = cleanText(await readFile(filePath, "utf8"));
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function normalizeLocalTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${hour}:${minute}:${second}`;
}

function resolvePublicPath(publicDir, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalizedPath = path.normalize(relativePath);
  const resolvedPath = path.resolve(publicDir, normalizedPath);
  if (!resolvedPath.startsWith(path.resolve(publicDir))) return null;
  return resolvedPath;
}

async function respondFile(res, filePath) {
  if (!filePath) {
    res.writeHead(404, buildHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Not found");
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    const shouldDisableCache = [".html", ".js", ".css"].includes(ext);
    res.writeHead(200, buildHeaders({
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": shouldDisableCache ? "no-store" : "public, max-age=300",
    }));
    res.end(body);
  } catch {
    res.writeHead(404, buildHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Not found");
  }
}

async function readJsonBody(req) {
  ensureJsonContentType(req);
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > 64 * 1024) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function ensureJsonContentType(req) {
  const contentType = String(req.headers["content-type"] || "").trim().toLowerCase();
  if (!contentType) {
    const error = new Error("Missing content type; expected application/json");
    error.statusCode = 415;
    throw error;
  }
  if (contentType.startsWith("application/json")) return;
  const error = new Error("Unsupported content type; expected application/json");
  error.statusCode = 415;
  throw error;
}

function respondJson(res, payload, status = 200) {
  res.writeHead(status, buildHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }));
  res.end(JSON.stringify(payload));
}

function buildHeaders(overrides = {}) {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": CONTENT_SECURITY_POLICY,
    ...overrides,
  };
}

function cleanText(value) {
  return String(value).replace(/^\uFEFF/, "");
}

async function loadAppVersion(projectRoot) {
  try {
    const packageJson = JSON.parse(cleanText(await readFile(path.join(projectRoot, "package.json"), "utf8")));
    return packageJson.version || null;
  } catch {
    return null;
  }
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(cleanText(await readFile(filePath, "utf8")));
  } catch {
    return fallbackValue;
  }
}

function buildSecurityDescriptor() {
  return {
    bindMode: SERVER_BINDING.mode,
    requiresSameOrigin: true,
  };
}

function resolveServerBinding() {
  const explicitHost = String(process.env.HOST || "").trim();
  if (explicitHost) {
    return {
      host: explicitHost,
      mode: isLoopbackHost(explicitHost) ? "local" : "custom",
    };
  }

  if (isSynologyEnvironment()) {
    return {
      host: "0.0.0.0",
      mode: "nas",
    };
  }

  return {
    host: "127.0.0.1",
    mode: "local",
  };
}

function isLoopbackHost(host) {
  const normalized = String(host || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

function isSynologyEnvironment() {
  if (String(process.env.SYNOLOGY_DSM || "").trim() === "1") return true;
  if (String(process.env.SYNO_DSM || "").trim() === "1") return true;
  if (process.platform !== "linux") return false;
  if (existsSync("/etc/synoinfo.conf")) return true;
  if (existsSync("/etc.defaults/VERSION")) {
    try {
      const versionText = readFileSync("/etc.defaults/VERSION", "utf8");
      return /productversion|buildnumber/i.test(versionText);
    } catch {
      return false;
    }
  }
  return false;
}

function isRequestAllowed(req, mode) {
  const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress || "");
  if (!remoteAddress) return false;

  if (mode === "local") {
    return isLoopbackAddress(remoteAddress);
  }

  return isPrivateOrLoopbackAddress(remoteAddress);
}

function ensureMutationAuthorized(req) {
  const requestToken = String(req.headers["x-gold-investor-write-token"] || "").trim();
  if (isSameOriginMutationRequest(req)) {
    return;
  }
  if (requestToken && requestToken === WRITE_TOKEN) {
    return;
  }

  const error = new Error("Mutation requests must originate from the dashboard page or include a valid write token");
  error.statusCode = 403;
  throw error;
}

function isSameOriginMutationRequest(req) {
  const host = String(req.headers.host || "").trim().toLowerCase();
  if (!host) return false;

  const origin = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();
  const secFetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();

  const headerMatches = origin
    ? matchesHostHeader(origin, host)
    : referer
      ? matchesHostHeader(referer, host)
      : false;

  if (!headerMatches) return false;
  if (!secFetchSite) return true;
  return secFetchSite === "same-origin" || secFetchSite === "same-site";
}

function matchesHostHeader(candidateUrl, expectedHost) {
  try {
    const parsed = new URL(candidateUrl);
    return parsed.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function normalizeRemoteAddress(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1";
}

function isPrivateOrLoopbackAddress(address) {
  if (isLoopbackAddress(address)) return true;
  if (/^10\./.test(address)) return true;
  if (/^192\.168\./.test(address)) return true;
  const match172 = address.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^169\.254\./.test(address)) return true;
  if (/^(fc|fd)/i.test(address)) return true;
  if (/^fe80:/i.test(address)) return true;
  return false;
}
