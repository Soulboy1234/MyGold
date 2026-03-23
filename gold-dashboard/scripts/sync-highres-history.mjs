import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { loadDukascopyBackfill } from "./dukascopy-highres-backfill.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_FILE = path.join(DATA_DIR, "highres.db");
const SUMMARY_FILE = path.join(DATA_DIR, "highres-summary.json");
const USER_AGENT = "codex-gold-dashboard/1.0";
const TROY_OUNCE_TO_GRAMS = 31.1034768;

const SERIES = [
  {
    key: "gold",
    role: "priceUsdPerOz",
    candidates: [
      { symbol: "XAUUSD=X", interval: "5m", range: "60d", label: "Yahoo XAUUSD spot" },
      { symbol: "GC=F", interval: "5m", range: "60d", label: "Yahoo GC=F proxy" },
      { symbol: "GC=F", interval: "15m", range: "60d", label: "Yahoo GC=F proxy" },
      { symbol: "GC=F", interval: "60m", range: "730d", label: "Yahoo GC=F proxy" },
    ],
  },
  {
    key: "usdCnyRate",
    role: "usdCnyRate",
    candidates: [
      { symbol: "CNY=X", interval: "5m", range: "60d", label: "Yahoo CNY=X" },
      { symbol: "CNY=X", interval: "15m", range: "60d", label: "Yahoo CNY=X" },
      { symbol: "CNY=X", interval: "60m", range: "730d", label: "Yahoo CNY=X" },
    ],
  },
  {
    key: "gc",
    role: "gcFrontClose",
    volumeRole: "gcFrontVolume",
    candidates: [
      { symbol: "GC=F", interval: "5m", range: "60d", label: "Yahoo GC=F" },
      { symbol: "GC=F", interval: "15m", range: "60d", label: "Yahoo GC=F" },
      { symbol: "GC=F", interval: "60m", range: "730d", label: "Yahoo GC=F" },
    ],
  },
  {
    key: "gld",
    role: "gldClose",
    volumeRole: "gldVolume",
    candidates: [
      { symbol: "GLD", interval: "5m", range: "60d", label: "Yahoo GLD" },
      { symbol: "GLD", interval: "15m", range: "60d", label: "Yahoo GLD" },
      { symbol: "GLD", interval: "60m", range: "730d", label: "Yahoo GLD" },
    ],
  },
  {
    key: "uup",
    role: "uupClose",
    volumeRole: "uupVolume",
    candidates: [
      { symbol: "UUP", interval: "5m", range: "60d", label: "Yahoo UUP" },
      { symbol: "UUP", interval: "15m", range: "60d", label: "Yahoo UUP" },
      { symbol: "UUP", interval: "60m", range: "730d", label: "Yahoo UUP" },
    ],
  },
];

await mkdir(DATA_DIR, { recursive: true });

const dukascopyBackfill = await loadDukascopyBackfill(DATA_DIR);
const resolvedSeries = {};
const sourceSummary = {};
for (const config of SERIES) {
  const resolved = await resolveSeries(config, dukascopyBackfill);
  if (!resolved) {
    throw new Error(`No high-resolution source available for ${config.key}`);
  }
  resolvedSeries[config.key] = resolved.rows;
  sourceSummary[config.key] = resolved.meta;
}

const mergedRows = mergeIntradaySeries(resolvedSeries, sourceSummary);
const updatedAt = new Date().toISOString();

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS intraday_history (
    timestamp_utc INTEGER PRIMARY KEY,
    timestamp_local TEXT NOT NULL,
    granularity TEXT,
    price_source TEXT,
    price_usd_per_oz REAL,
    price_cny_per_gram REAL,
    usd_cny_rate REAL,
    gc_front_close REAL,
    gc_front_volume INTEGER,
    gld_close REAL,
    gld_volume INTEGER,
    uup_close REAL,
    uup_volume INTEGER,
    fx_carried_forward INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  DELETE FROM intraday_history;
`);
try {
  db.exec(`ALTER TABLE intraday_history ADD COLUMN fx_carried_forward INTEGER DEFAULT 0;`);
} catch {
}

const insert = db.prepare(`
  INSERT INTO intraday_history (
    timestamp_utc, timestamp_local, granularity, price_source,
    price_usd_per_oz, price_cny_per_gram, usd_cny_rate,
    gc_front_close, gc_front_volume, gld_close, gld_volume, uup_close, uup_volume, fx_carried_forward, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec("BEGIN");
try {
  for (const row of mergedRows) {
    insert.run(
      row.timestampUtc,
      row.timestampLocal,
      row.granularity,
      row.priceSource,
      row.priceUsdPerOz,
      row.priceCnyPerGram,
      row.usdCnyRate,
      row.gcFrontClose,
      row.gcFrontVolume,
      row.gldClose,
      row.gldVolume,
      row.uupClose,
      row.uupVolume,
      row.fxCarriedForward ? 1 : 0,
      updatedAt,
    );
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
db.close();

const summary = {
  updatedAt,
  rowCount: mergedRows.length,
  startTime: mergedRows[0]?.timestampLocal || null,
  endTime: mergedRows.at(-1)?.timestampLocal || null,
  backfill: dukascopyBackfill.meta,
  sources: sourceSummary,
};
await writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));

async function resolveSeries(config, dukascopyBackfill) {
  const resolvedCandidates = [];
  const backfillRows = config.key === "gold"
    ? dukascopyBackfill?.goldRows
    : config.key === "usdCnyRate"
      ? dukascopyBackfill?.fxRows
      : null;
  if (Array.isArray(backfillRows) && backfillRows.length) {
    resolvedCandidates.push({
      candidate: {
        symbol: config.key === "gold" ? "xauusd" : "usdcnh",
        label: config.key === "gold" ? "Dukascopy XAUUSD" : "Dukascopy USDCNH",
        interval: "mixed",
        range: "cached",
      },
      rows: backfillRows,
      meta: {
        symbol: config.key === "gold" ? "xauusd" : "usdcnh",
        label: config.key === "gold" ? "Dukascopy XAUUSD" : "Dukascopy USDCNH",
        interval: "mixed",
        range: "cached",
        points: backfillRows.length,
        firstTime: backfillRows[0]?.timestampLocal || null,
        lastTime: backfillRows.at(-1)?.timestampLocal || null,
      },
    });
  }
  for (const candidate of config.candidates) {
    const payload = await fetchYahooChart(candidate.symbol, candidate.interval, candidate.range);
    const rows = parseYahooIntraday(payload, candidate.interval);
    if (rows.length) {
      resolvedCandidates.push({
        candidate,
        rows,
        meta: {
          symbol: candidate.symbol,
          label: candidate.label,
          interval: payload?.chart?.result?.[0]?.meta?.dataGranularity || candidate.interval,
          range: candidate.range,
          points: rows.length,
          firstTime: rows[0]?.timestampLocal || null,
          lastTime: rows.at(-1)?.timestampLocal || null,
        },
      });
    }
  }
  if (!resolvedCandidates.length) return null;

  const mergedRows = mergeCandidateRows(resolvedCandidates);
  return {
    rows: mergedRows,
    meta: {
      symbol: resolvedCandidates[0].meta.symbol,
      label: resolvedCandidates[0].meta.label,
      interval: resolvedCandidates[0].meta.interval,
      range: resolvedCandidates[0].meta.range,
      points: mergedRows.length,
      firstTime: mergedRows[0]?.timestampLocal || null,
      lastTime: mergedRows.at(-1)?.timestampLocal || null,
      candidates: resolvedCandidates.map((item) => item.meta),
    },
  };
}

async function fetchYahooChart(symbol, interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function parseYahooIntraday(payload, fallbackInterval = "5m") {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const granularity = result?.meta?.dataGranularity || fallbackInterval;
  return timestamps.map((timestamp, index) => ({
    timestampUtc: Number(timestamp),
    timestampLocal: formatLocalDateTime(new Date(Number(timestamp) * 1000)),
    granularity,
    close: toPositiveNumber(quote.close?.[index]),
    volume: toPositiveInteger(quote.volume?.[index]),
  })).filter((row) => row.timestampUtc && (row.close !== null || row.volume !== null));
}

function mergeCandidateRows(candidates) {
  const byTimestamp = new Map();
  const orderedCandidates = [...candidates].sort(
    (left, right) => intervalToMinutes(right.meta.interval) - intervalToMinutes(left.meta.interval)
  );

  for (const candidate of orderedCandidates) {
    for (const row of candidate.rows) {
      const current = byTimestamp.get(row.timestampUtc);
      if (!current || intervalToMinutes(row.granularity) <= intervalToMinutes(current.granularity)) {
        byTimestamp.set(row.timestampUtc, {
          ...row,
          sourceLabel: candidate.meta.label,
        });
      }
    }
  }

  return [...byTimestamp.values()].sort((left, right) => left.timestampUtc - right.timestampUtc);
}

function intervalToMinutes(interval) {
  if (typeof interval !== "string") return Number.POSITIVE_INFINITY;
  const match = interval.match(/^(\d+)([mhd])$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m") return value;
  if (unit === "h") return value * 60;
  if (unit === "d") return value * 1440;
  return Number.POSITIVE_INFINITY;
}

function mergeIntradaySeries(seriesMap, sourceSummary) {
  const byTimestamp = new Map();
  const priceSource = sourceSummary.gold?.symbol === "XAUUSD=X" ? "XAUUSD spot" : "GC=F proxy";

  const assign = (timestampUtc, patch) => {
    const current = byTimestamp.get(timestampUtc) || {
      timestampUtc,
      timestampLocal: formatLocalDateTime(new Date(timestampUtc * 1000)),
      granularity: patch.granularity || "5m",
      priceSource,
      priceUsdPerOz: null,
      priceCnyPerGram: null,
      usdCnyRate: null,
      gcFrontClose: null,
      gcFrontVolume: null,
      gldClose: null,
      gldVolume: null,
      uupClose: null,
      uupVolume: null,
      fxCarriedForward: false,
    };
    const nextGranularity = current.granularity && patch.granularity
      ? (intervalToMinutes(patch.granularity) < intervalToMinutes(current.granularity) ? patch.granularity : current.granularity)
      : (patch.granularity || current.granularity);
    byTimestamp.set(timestampUtc, { ...current, ...patch, granularity: nextGranularity });
  };

  for (const row of seriesMap.gold || []) assign(row.timestampUtc, {
    timestampLocal: row.timestampLocal,
    granularity: row.granularity,
    priceUsdPerOz: row.close,
    priceSource: row.sourceLabel || priceSource,
  });
  for (const row of seriesMap.usdCnyRate || []) assign(row.timestampUtc, { timestampLocal: row.timestampLocal, granularity: row.granularity, usdCnyRate: row.close });
  for (const row of seriesMap.gc || []) assign(row.timestampUtc, { timestampLocal: row.timestampLocal, granularity: row.granularity, gcFrontClose: row.close, gcFrontVolume: row.volume });
  for (const row of seriesMap.gld || []) assign(row.timestampUtc, { timestampLocal: row.timestampLocal, granularity: row.granularity, gldClose: row.close, gldVolume: row.volume });
  for (const row of seriesMap.uup || []) assign(row.timestampUtc, { timestampLocal: row.timestampLocal, granularity: row.granularity, uupClose: row.close, uupVolume: row.volume });

  const rows = [...byTimestamp.values()].sort((left, right) => left.timestampUtc - right.timestampUtc);
  fillForward(rows, "usdCnyRate", "fxCarriedForward");
  for (const row of rows) {
    row.priceUsdPerOz = row.priceUsdPerOz ?? row.gcFrontClose ?? null;
    row.priceCnyPerGram = computeCnyPerGram(row.priceUsdPerOz, row.usdCnyRate);
  }
  return rows;
}

function computeCnyPerGram(priceUsdPerOz, usdCnyRate) {
  if (!Number.isFinite(priceUsdPerOz) || !Number.isFinite(usdCnyRate)) return null;
  return round((priceUsdPerOz * usdCnyRate) / TROY_OUNCE_TO_GRAMS, 4);
}

function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fillForward(rows, key, flagKey = null) {
  let last = null;
  for (const row of rows) {
    if (Number.isFinite(row[key])) {
      last = row[key];
    } else if (last !== null) {
      row[key] = last;
      if (flagKey) row[flagKey] = true;
    }
  }
}
