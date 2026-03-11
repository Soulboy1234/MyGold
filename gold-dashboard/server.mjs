import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_DB_FILE = path.join(DATA_DIR, "history.db");
const HIGHRES_DB_FILE = path.join(DATA_DIR, "highres.db");
const MONITOR_DIR = path.resolve(__dirname, "..", "gold-monitor");
const DAEMON_FILE = path.join(MONITOR_DIR, "state", "daemon.json");
const STATE_FILE = path.join(MONITOR_DIR, "state", "latest.json");
const HF_STATE_FILE = path.join(MONITOR_DIR, "state", "high_frequency_history.jsonl");
const DAILY_STATE_FILE = path.join(MONITOR_DIR, "state", "daily_context_history.jsonl");
const HIGH_FREQUENCY_FILE = path.join(MONITOR_DIR, "out", "high_frequency.csv");
const DAILY_FILE = path.join(MONITOR_DIR, "out", "daily_context.csv");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3099);
const POLL_INTERVAL_MS = 5000;
const LIVE_STALE_AFTER_MS = 20 * 60 * 1000;
let cachedPayload = null;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export function startServer() {
  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    try {
      if (requestUrl.pathname === "/api/dashboard") {
        await serveDashboard(res);
        return;
      }
      await serveStatic(requestUrl.pathname, res);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error.message }));
    }
  }).listen(PORT, HOST, () => {
    console.log(`Gold dashboard running at http://${HOST}:${PORT}`);
  });
}

if (process.argv[1] === __filename) {
  startServer();
}

export async function loadDashboardData() {
  const [state, highFrequencyRows, dailyRows, monitorHealth] = await Promise.all([
    readJsonFile(STATE_FILE, {}),
    loadHighFrequencyRows(),
    loadDailyRows(),
    loadMonitorHealth(),
  ]);
  const livePayload = buildLivePayload(state, highFrequencyRows, dailyRows);
  const historyPayload = loadHistoryPayload();
  const liveAgeMs = getLiveAgeMs(livePayload.summary?.latestTime, state.checkedAt);
  return {
    meta: {
      pollIntervalMs: POLL_INTERVAL_MS,
      sourceDir: MONITOR_DIR,
      historyDbFile: HISTORY_DB_FILE,
      generatedAt: new Date().toISOString(),
      lastSuccessfulLoadAt: new Date().toISOString(),
      staleThresholdMs: LIVE_STALE_AFTER_MS,
      liveAgeMs,
      liveStatus: liveAgeMs === null ? "unknown" : liveAgeMs > LIVE_STALE_AFTER_MS ? "stale" : "fresh",
      monitor: monitorHealth,
    },
    history: historyPayload,
    live: livePayload,
  };
}

async function loadHighFrequencyRows() {
  const stateRows = await readJsonLines(HF_STATE_FILE);
  if (stateRows.length) {
    return stateRows.map((row) => ({
      time: row.checkedAtLocal || null,
      priceUsdPerOz: toNumber(row.priceUsdPerOz),
      priceCnyPerGram: toNumber(row.priceCnyPerGram),
      usdCnyRate: toNumber(row.usdCnyRate),
      gcFrontClose: toNumber(row.gcFrontClose),
      gcFrontVolume: toNumber(row.gcFrontVolume),
      uupClose: toNumber(row.dollarProxyClose),
      dollarProxyVolume: toNumber(row.dollarProxyVolume),
      dxyProxy: toNumber(row.dollarProxyClose),
      changePct: toNumber(row.changePct),
      direction: row.direction || "",
      advice: row.highFrequencyAdvice || "",
    }));
  }

  try {
    const highFrequencyRaw = await readUtf8File(HIGH_FREQUENCY_FILE);
    return parseCsv(stripBom(highFrequencyRaw)).slice(-120).map((row) => {
      const cells = Object.values(row);
      return {
        time: cells[0] || null,
        priceUsdPerOz: toNumber(cells[1]),
        priceCnyPerGram: toNumber(cells[2]),
        usdCnyRate: toNumber(cells[3]),
        gcFrontClose: toNumber(cells[4]),
        gcFrontVolume: toNumber(cells[5]),
        uupClose: toNumber(cells[6]),
        dollarProxyVolume: null,
        dxyProxy: toNumber(cells[7]),
        changePct: toPercent(cells[8]),
        direction: cells[9] || "",
        advice: cells[10] || "",
      };
    });
  } catch {
    return [];
  }
}

async function loadDailyRows() {
  const stateRows = await readJsonLines(DAILY_STATE_FILE);
  if (stateRows.length) {
    return stateRows.map((row) => ({
      date: row.date || null,
      gcFrontClose: toNumber(row.gcFrontClose),
      gcFrontVolume: toNumber(row.gcFrontVolume),
      gldClose: toNumber(row.gldClose),
      gldVolume: toNumber(row.gldVolume),
      uupClose: toNumber(row.dollarProxyClose),
      uupVolume: toNumber(row.dollarProxyVolume),
      realYield10Y: toNumber(row.realYield10Y),
      commentary: row.commentary || "",
      advice: row.dailyAdvice || "",
    }));
  }

  try {
    const dailyRaw = await readUtf8File(DAILY_FILE);
    return parseCsv(stripBom(dailyRaw)).slice(-120).map((row) => {
      const cells = Object.values(row);
      return {
        date: cells[0] || null,
        gcFrontClose: toNumber(cells[1]),
        gcFrontVolume: toNumber(cells[2]),
        gldClose: toNumber(cells[3]),
        gldVolume: toNumber(cells[4]),
        uupClose: toNumber(cells[5]),
        uupVolume: toNumber(cells[6]),
        realYield10Y: toNumber(cells[7]),
        commentary: cells[8] || "",
        advice: cells[9] || "",
      };
    });
  } catch {
    return [];
  }
}

async function serveDashboard(res) {
  let payload;
  try {
    payload = await loadDashboardData();
    cachedPayload = payload;
  } catch (error) {
    if (!cachedPayload) {
      throw error;
    }
    payload = {
      ...cachedPayload,
      meta: {
        ...cachedPayload.meta,
        generatedAt: new Date().toISOString(),
        servedFromCache: true,
        loadError: error.message,
      },
    };
  }
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

async function serveStatic(requestPath, res) {
  const relativePath = requestPath === "/" ? "index.html" : path.normalize(decodeURIComponent(requestPath)).replace(/^([/\\])+/, "");
  const absolutePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(absolutePath);
    const extension = path.extname(absolutePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    res.end(file);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    throw error;
  }
}

function loadHistoryPayload() {
  try {
    const db = new DatabaseSync(HISTORY_DB_FILE, { readOnly: true });
    const rows = db.prepare(`
      SELECT
        date,
        xauusd_close AS priceUsdPerOz,
        price_cny_per_gram AS priceCnyPerGram,
        usdcny_close AS usdCnyRate,
        gc_front_close AS gcFrontClose,
        gc_front_volume AS gcFrontVolume,
        gld_close AS gldClose,
        gld_volume AS gldVolume,
        uup_close AS uupClose,
        uup_volume AS uupVolume,
        real_yield_10y AS realYield10Y,
        fx_carried_forward AS fxCarriedForward
      FROM daily_history
      ORDER BY date ASC
    `).all();
    db.close();

    const highResSeries = loadHighResSeries();
    return {
      summary: {
        startDate: rows[0]?.date || null,
        endDate: rows.at(-1)?.date || null,
        rowCount: rows.length,
        priceRange: buildRange(rows.map((row) => row.priceUsdPerOz)),
        cnyRange: buildRange(rows.map((row) => row.priceCnyPerGram)),
        fxRange: buildRange(rows.map((row) => row.usdCnyRate)),
        realYieldRange: buildRange(rows.map((row) => row.realYield10Y)),
      },
      series: rows,
      highres: {
        summary: {
          startTime: highResSeries[0]?.time || null,
          endTime: highResSeries.at(-1)?.time || null,
          rowCount: highResSeries.length,
        },
        series: highResSeries,
      },
    };
  } catch {
    return {
      summary: {
        startDate: null,
        endDate: null,
        rowCount: 0,
        priceRange: null,
        cnyRange: null,
        fxRange: null,
        realYieldRange: null,
      },
      series: [],
      highres: {
        summary: { startTime: null, endTime: null, rowCount: 0 },
        series: [],
      },
    };
  }
}

function loadHighResSeries() {
  try {
    const db = new DatabaseSync(HIGHRES_DB_FILE, { readOnly: true });
    const rows = db.prepare(`
      SELECT
        timestamp_local AS time,
        price_source AS priceSource,
        price_usd_per_oz AS priceUsdPerOz,
        price_cny_per_gram AS priceCnyPerGram,
        usd_cny_rate AS usdCnyRate,
        gc_front_close AS gcFrontClose,
        gc_front_volume AS gcFrontVolume,
        gld_close AS gldClose,
        gld_volume AS gldVolume,
        uup_close AS uupClose,
        uup_volume AS uupVolume,
        fx_carried_forward AS fxCarriedForward
      FROM intraday_history
      ORDER BY timestamp_utc ASC
    `).all();
    db.close();
    return rows;
  } catch {
    return [];
  }
}

function buildLivePayload(state, highFrequencyRows, dailyRows) {
  const recentHighFrequency = highFrequencyRows.slice(-120);
  const dailySeries = dailyRows.slice(-120);

  const latest = recentHighFrequency.at(-1) || null;
  const previous = recentHighFrequency.at(-2) || null;
  return {
    snapshot: state,
    summary: {
      latestTime: latest?.time || state.checkedAtLocal,
      latestDirection: state.direction,
      trendLabel: buildTrendLabel(latest, previous),
      intradayRange: buildRange(recentHighFrequency.map((row) => row.priceUsdPerOz)),
      cnyRange: buildRange(recentHighFrequency.map((row) => row.priceCnyPerGram)),
      gcVolumeRange: buildRange(recentHighFrequency.map((row) => row.gcFrontVolume)),
      realYieldRange: buildRange(dailySeries.map((row) => row.realYield10Y)),
    },
    highFrequency: recentHighFrequency,
    daily: dailySeries,
  };
}

async function readJsonLines(filePath) {
  try {
    const rows = [];
    for (const line of stripBom(await readUtf8File(filePath)).split(/\r?\n/).filter(Boolean)) {
      try {
        rows.push(JSON.parse(line));
      } catch {
      }
    }
    return rows;
  } catch {
    return [];
  }
}

async function readUtf8File(filePath) {
  return readFile(filePath, "utf8");
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(stripBom(await readUtf8File(filePath)));
  } catch {
    return fallback;
  }
}

async function loadMonitorHealth() {
  const daemon = await readJsonFile(DAEMON_FILE, {});
  const state = await readJsonFile(STATE_FILE, {});
  const lastDataAt = state.checkedAt || daemon.lastSuccessAt || null;
  const ageMs = getLiveAgeMs(state.checkedAtLocal, lastDataAt);
  const pid = Number.isFinite(Number(daemon.pid)) ? Number(daemon.pid) : null;
  const processAlive = pid ? isProcessAlive(pid) : false;
  const normalizedStatus = !processAlive && ["running", "retrying"].includes(daemon.status) ? "stopped" : (daemon.status || "unknown");
  return {
    status: normalizedStatus,
    pid,
    processAlive,
    intervalMs: daemon.intervalMs || null,
    runCount: daemon.runCount || 0,
    consecutiveFailures: daemon.consecutiveFailures || 0,
    lastSuccessAt: daemon.lastSuccessAt || null,
    lastFailureAt: daemon.lastFailureAt || null,
    lastError: daemon.lastError || "",
    nextRunAt: daemon.nextRunAt || null,
    heartbeatAt: daemon.heartbeatAt || null,
    dataAgeMs: ageMs,
    dataStatus: ageMs === null ? "unknown" : ageMs > LIVE_STALE_AFTER_MS ? "stale" : "fresh",
  };
}

function stripBom(text) {
  return typeof text === "string" && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const cells = splitCsvLine(line);
    return cells.length > 1 && cells.every((cell) => cell !== "");
  });
  if (headerIndex < 0 || headerIndex === lines.length - 1) return [];
  const headers = splitCsvLine(lines[headerIndex]);
  return lines.slice(headerIndex + 1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function buildTrendLabel(latest, previous) {
  if (!latest) return "暂无数据";
  if (!previous || latest.priceUsdPerOz === previous.priceUsdPerOz) return "横盘";
  return latest.priceUsdPerOz > previous.priceUsdPerOz ? "上行" : "下行";
}

function buildRange(values) {
  const numbers = values.filter(Number.isFinite);
  if (!numbers.length) return null;
  return {
    min: round(Math.min(...numbers), 4),
    max: round(Math.max(...numbers), 4),
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getLiveAgeMs(localValue, isoValue) {
  const parsed = parseTimestamp(localValue) || parseTimestamp(isoValue);
  if (!parsed) return null;
  return Math.max(0, Date.now() - parsed.getTime());
}

function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)) {
    const normalized = text.length === 16 ? `${text}:00` : text;
    const parsed = new Date(normalized.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
