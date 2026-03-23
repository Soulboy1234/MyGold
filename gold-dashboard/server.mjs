import { existsSync, readFileSync } from "node:fs";
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
const SERVER_BINDING = resolveServerBinding();
const HOST = SERVER_BINDING.host;
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

function resolveServerBinding() {
  const explicitHost = String(process.env.HOST || "").trim();
  if (explicitHost) {
    return {
      host: explicitHost,
      mode: isLoopbackHost(explicitHost) ? "local" : "custom",
    };
  }
  return {
    host: isSynologyEnvironment() ? "0.0.0.0" : "127.0.0.1",
    mode: isSynologyEnvironment() ? "nas" : "local",
  };
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

function isLoopbackHost(host) {
  const normalized = String(host || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

export function startServer() {
  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    try {
      if (!isRequestAllowed(req, SERVER_BINDING.mode)) {
        res.writeHead(403, buildHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
        res.end("Forbidden");
        return;
      }

      if (requestUrl.pathname === "/api/dashboard") {
        await serveDashboard(res);
        return;
      }
      await serveStatic(requestUrl.pathname, res);
    } catch (error) {
      res.writeHead(500, buildHeaders({ "Content-Type": "application/json; charset=utf-8" }));
      res.end(JSON.stringify({ error: error.message }));
    }
  }).listen(PORT, HOST, () => {
    console.log(`Gold dashboard running at http://${HOST}:${PORT} [mode=${SERVER_BINDING.mode}]`);
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
      historyAvailable: existsSync(HISTORY_DB_FILE),
      highresAvailable: existsSync(HIGHRES_DB_FILE),
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
      gcFrontOpenInterest: toNumber(row.gcFrontOpenInterest),
      gcFrontOpenInterestChange: toNumber(row.gcFrontOpenInterestChange),
      uupClose: toNumber(row.dollarProxyClose),
      dollarProxyVolume: toNumber(row.dollarProxyVolume),
      dxyProxy: toNumber(row.dollarProxyClose),
      cnGoldEtfClose: toNumber(row.cnGoldEtfClose),
      cnGoldEtfVolume: toNumber(row.cnGoldEtfVolume),
      cnGoldEtfTurnover: toNumber(row.cnGoldEtfTurnover),
      cnGoldEtfAltClose: toNumber(row.cnGoldEtfAltClose),
      cnGoldEtfAltVolume: toNumber(row.cnGoldEtfAltVolume),
      cnGoldEtfAltTurnover: toNumber(row.cnGoldEtfAltTurnover),
      shfeAuMainClose: toNumber(row.shfeAuMainClose),
      shfeAuMainVolume: toNumber(row.shfeAuMainVolume),
      shfeAuMainOpenInterest: toNumber(row.shfeAuMainOpenInterest),
      shfeAuMainOpenInterestChange: toNumber(row.shfeAuMainOpenInterestChange),
      sgeAu9999: toNumber(row.sgeAu9999),
      sgeAuTd: toNumber(row.sgeAuTd),
      sgeSpotPremiumCnyPerGram: toNumber(row.sgeSpotPremiumCnyPerGram),
      sgeTdSpreadCnyPerGram: toNumber(row.sgeTdSpreadCnyPerGram),
      shfeSpotPremiumCnyPerGram: toNumber(row.shfeSpotPremiumCnyPerGram),
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
        gcFrontOpenInterest: toNumber(cells[11]),
        gcFrontOpenInterestChange: toNumber(cells[12]),
        uupClose: toNumber(cells[6]),
        dollarProxyVolume: null,
        dxyProxy: toNumber(cells[7]),
        cnGoldEtfClose: toNumber(cells[13]),
        cnGoldEtfVolume: toNumber(cells[14]),
        cnGoldEtfTurnover: toNumber(cells[15]),
        sgeAu9999: toNumber(cells[16]),
        sgeAuTd: toNumber(cells[17]),
        shfeAuMainClose: toNumber(cells[18]),
        shfeAuMainVolume: toNumber(cells[19]),
        shfeAuMainOpenInterest: toNumber(cells[20]),
        shfeAuMainOpenInterestChange: toNumber(cells[21]),
        cnGoldEtfAltClose: toNumber(cells[22]),
        cnGoldEtfAltVolume: toNumber(cells[23]),
        cnGoldEtfAltTurnover: toNumber(cells[24]),
        sgeSpotPremiumCnyPerGram: toNumber(cells[25]),
        sgeTdSpreadCnyPerGram: toNumber(cells[26]),
        shfeSpotPremiumCnyPerGram: toNumber(cells[27]),
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
      cnGoldEtfClose: toNumber(row.cnGoldEtfClose),
      cnGoldEtfVolume: toNumber(row.cnGoldEtfVolume),
      cnGoldEtfTurnover: toNumber(row.cnGoldEtfTurnover),
      cnGoldEtfAltClose: toNumber(row.cnGoldEtfAltClose),
      cnGoldEtfAltVolume: toNumber(row.cnGoldEtfAltVolume),
      cnGoldEtfAltTurnover: toNumber(row.cnGoldEtfAltTurnover),
      shfeAuMainClose: toNumber(row.shfeAuMainClose),
      shfeAuMainVolume: toNumber(row.shfeAuMainVolume),
      shfeAuMainOpenInterest: toNumber(row.shfeAuMainOpenInterest),
      shfeAuMainOpenInterestChange: toNumber(row.shfeAuMainOpenInterestChange),
      sgeAu9999: toNumber(row.sgeAu9999),
      sgeAuTd: toNumber(row.sgeAuTd),
      sgeSpotPremiumCnyPerGram: toNumber(row.sgeSpotPremiumCnyPerGram),
      sgeTdSpreadCnyPerGram: toNumber(row.sgeTdSpreadCnyPerGram),
      shfeSpotPremiumCnyPerGram: toNumber(row.shfeSpotPremiumCnyPerGram),
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
        cnGoldEtfClose: toNumber(cells[10]),
        cnGoldEtfVolume: toNumber(cells[11]),
        cnGoldEtfTurnover: toNumber(cells[12]),
        sgeAu9999: toNumber(cells[13]),
        sgeAuTd: toNumber(cells[14]),
        shfeAuMainClose: toNumber(cells[15]),
        shfeAuMainVolume: toNumber(cells[16]),
        shfeAuMainOpenInterest: toNumber(cells[17]),
        shfeAuMainOpenInterestChange: toNumber(cells[18]),
        cnGoldEtfAltClose: toNumber(cells[19]),
        cnGoldEtfAltVolume: toNumber(cells[20]),
        cnGoldEtfAltTurnover: toNumber(cells[21]),
        sgeSpotPremiumCnyPerGram: toNumber(cells[22]),
        sgeTdSpreadCnyPerGram: toNumber(cells[23]),
        shfeSpotPremiumCnyPerGram: toNumber(cells[24]),
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
    ...buildHeaders(),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

async function serveStatic(requestPath, res) {
  const relativePath = requestPath === "/" ? "index.html" : path.normalize(decodeURIComponent(requestPath)).replace(/^([/\\])+/, "");
  const absolutePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, buildHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(absolutePath);
    const extension = path.extname(absolutePath);
    res.writeHead(200, buildHeaders({ "Content-Type": MIME_TYPES[extension] || "application/octet-stream" }));
    res.end(file);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      res.writeHead(404, buildHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
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
        shfe_spot_premium_cny_per_gram AS shfeSpotPremiumCnyPerGram,
        uup_close AS uupClose,
        uup_volume AS uupVolume,
        real_yield_10y AS realYield10Y,
        fx_carried_forward AS fxCarriedForward
      FROM daily_history
      ORDER BY date ASC
    `).all();
    db.close();

    const highResSeries = loadHighResSeries();
    const sampledDailyRows = sampleDailyHistoryRows(rows);
    return {
      summary: {
        startDate: rows[0]?.date || null,
        endDate: rows.at(-1)?.date || null,
        rowCount: rows.length,
        priceRange: buildRange(rows.map((row) => row.priceUsdPerOz)),
        cnyRange: buildRange(rows.map((row) => row.priceCnyPerGram)),
        fxRange: buildRange(rows.map((row) => row.usdCnyRate)),
        cnGoldEtfRange: buildRange(rows.map((row) => row.cnGoldEtfClose)),
        cnGoldEtfTurnoverRange: buildRange(rows.map((row) => row.cnGoldEtfTurnover)),
        cnGoldEtfAltRange: buildRange(rows.map((row) => row.cnGoldEtfAltClose)),
        cnGoldEtfAltTurnoverRange: buildRange(rows.map((row) => row.cnGoldEtfAltTurnover)),
        shfeAuMainRange: buildRange(rows.map((row) => row.shfeAuMainClose)),
          shfeAuMainVolumeRange: buildRange(rows.map((row) => row.shfeAuMainVolume)),
          shfeSpotPremiumRange: buildRange(rows.map((row) => row.shfeSpotPremiumCnyPerGram)),
          realYieldRange: buildRange(rows.map((row) => row.realYield10Y)),
          sampledRowCount: sampledDailyRows.length,
        },
        series: sampledDailyRows,
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
        cnGoldEtfRange: null,
        cnGoldEtfTurnoverRange: null,
        cnGoldEtfAltRange: null,
        cnGoldEtfAltTurnoverRange: null,
        shfeAuMainRange: null,
          shfeAuMainVolumeRange: null,
          shfeSpotPremiumRange: null,
          realYieldRange: null,
          sampledRowCount: 0,
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
    const recentCutoffUtc = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const mediumCutoffUtc = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
    const longCutoffUtc = Math.floor((Date.now() - 3 * 365 * 24 * 60 * 60 * 1000) / 1000);
    const rows = db.prepare(`
      WITH sampled AS (
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
          fx_carried_forward AS fxCarriedForward,
          timestamp_utc AS timestampUtc
        FROM intraday_history
        WHERE timestamp_utc >= ?
           OR (
              timestamp_utc >= ?
             AND timestamp_utc < ?
             AND substr(timestamp_local, 12, 5) IN ('00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00')
           )
           OR (
              timestamp_utc >= ?
              AND timestamp_utc < ?
              AND substr(timestamp_local, 12, 5) IN ('00:00', '12:00')
           )
           OR (
               timestamp_local >= '2012-06-27 00:00:00'
              AND timestamp_utc < ?
              AND substr(timestamp_local, 12, 5) = '00:00'
            )
      )
      SELECT
        time,
        priceSource,
        priceUsdPerOz,
        priceCnyPerGram,
        usdCnyRate,
        gcFrontClose,
        gcFrontVolume,
        gldClose,
        gldVolume,
        uupClose,
        uupVolume,
        fxCarriedForward
      FROM sampled
      ORDER BY timestampUtc ASC
    `).all(recentCutoffUtc, mediumCutoffUtc, recentCutoffUtc, longCutoffUtc, mediumCutoffUtc, longCutoffUtc);
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
      gcOpenInterestRange: buildRange(recentHighFrequency.map((row) => row.gcFrontOpenInterest)),
      cnGoldEtfRange: buildRange(recentHighFrequency.map((row) => row.cnGoldEtfClose)),
      cnGoldEtfTurnoverRange: buildRange(recentHighFrequency.map((row) => row.cnGoldEtfTurnover)),
      cnGoldEtfAltRange: buildRange(recentHighFrequency.map((row) => row.cnGoldEtfAltClose)),
      cnGoldEtfAltTurnoverRange: buildRange(recentHighFrequency.map((row) => row.cnGoldEtfAltTurnover)),
      shfeAuMainRange: buildRange(recentHighFrequency.map((row) => row.shfeAuMainClose)),
      shfeAuMainVolumeRange: buildRange(recentHighFrequency.map((row) => row.shfeAuMainVolume)),
      shfeAuMainOpenInterestRange: buildRange(recentHighFrequency.map((row) => row.shfeAuMainOpenInterest)),
      sgeAu9999Range: buildRange(recentHighFrequency.map((row) => row.sgeAu9999)),
      sgeAuTdRange: buildRange(recentHighFrequency.map((row) => row.sgeAuTd)),
      sgeSpotPremiumRange: buildRange(recentHighFrequency.map((row) => row.sgeSpotPremiumCnyPerGram)),
      sgeTdSpreadRange: buildRange(recentHighFrequency.map((row) => row.sgeTdSpreadCnyPerGram)),
      shfeSpotPremiumRange: buildRange(recentHighFrequency.map((row) => row.shfeSpotPremiumCnyPerGram)),
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

function sampleDailyHistoryRows(rows) {
  if (!Array.isArray(rows) || rows.length <= 2400) return rows;

  const now = new Date();
  const recentCutoff = shiftUtcDate(now, -365 * 2);
  const mediumCutoff = shiftUtcDate(now, -365 * 5);

  return rows.filter((row, index) => {
    const current = toUtcDate(row.date);
    if (!current) return index === 0 || index === rows.length - 1;
    if (current >= recentCutoff) return true;
    if (current >= mediumCutoff) return current.getUTCDay() === 1;
    return current.getUTCDate() <= 3;
  });
}

function toUtcDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function shiftUtcDate(baseDate, offsetDays) {
  return new Date(Date.UTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate() + offsetDays,
    0,
    0,
    0,
    0
  ));
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

function buildHeaders(overrides = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...overrides,
  };
}

function isRequestAllowed(req, mode) {
  const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress || "");
  if (!remoteAddress) return false;

  if (mode === "local") {
    return isLoopbackAddress(remoteAddress);
  }

  return isPrivateOrLoopbackAddress(remoteAddress);
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
