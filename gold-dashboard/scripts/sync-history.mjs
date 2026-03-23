import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_FILE = path.join(DATA_DIR, "history.db");
const SUMMARY_FILE = path.join(DATA_DIR, "history-summary.json");
const START_DATE = "2000-01-01";
const END_DATE = formatDate(new Date());
const TROY_OUNCE_TO_GRAMS = 31.1034768;

const USER_AGENT = "codex-gold-dashboard/1.0";
const YAHOO_START_SECONDS = Math.floor(Date.parse(`${START_DATE}T00:00:00Z`) / 1000);
const YAHOO_END_SECONDS = Math.floor(Date.parse(`${END_DATE}T23:59:59Z`) / 1000);
const SOURCES = {
  xauusd: "https://stooq.com/q/d/l/?s=xauusd&i=d",
  usdcny: "https://stooq.com/q/d/l/?s=usdcny&i=d",
  gc: `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?period1=${YAHOO_START_SECONDS}&period2=${YAHOO_END_SECONDS}&interval=1d&includePrePost=false&events=div%2Csplits`,
  gld: `https://query1.finance.yahoo.com/v8/finance/chart/GLD?period1=${YAHOO_START_SECONDS}&period2=${YAHOO_END_SECONDS}&interval=1d&includePrePost=false&events=div%2Csplits`,
  uup: `https://query1.finance.yahoo.com/v8/finance/chart/UUP?period1=${YAHOO_START_SECONDS}&period2=${YAHOO_END_SECONDS}&interval=1d&includePrePost=false&events=div%2Csplits`,
  realYield: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=FII10",
  cnGoldEtf: `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.518880&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${START_DATE.replaceAll("-", "")}&end=${END_DATE.replaceAll("-", "")}&ut=fa5fd1943c7b386f172d6893dbfba10b`,
  cnGoldEtfAlt: `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.518890&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${START_DATE.replaceAll("-", "")}&end=${END_DATE.replaceAll("-", "")}&ut=fa5fd1943c7b386f172d6893dbfba10b`,
  shfeAuMain: `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=113.aum&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${START_DATE.replaceAll("-", "")}&end=${END_DATE.replaceAll("-", "")}&ut=fa5fd1943c7b386f172d6893dbfba10b`,
};

await mkdir(DATA_DIR, { recursive: true });

const [xauusdText, usdcnyText, gcPayload, gldPayload, uupPayload, realYieldText, cnGoldEtfPayload, cnGoldEtfAltPayload, shfeAuMainPayload] = await Promise.all([
  fetchText(SOURCES.xauusd),
  fetchText(SOURCES.usdcny),
  fetchJson(SOURCES.gc),
  fetchJson(SOURCES.gld),
  fetchJson(SOURCES.uup),
  fetchText(SOURCES.realYield),
  fetchJson(SOURCES.cnGoldEtf),
  fetchJson(SOURCES.cnGoldEtfAlt),
  fetchJson(SOURCES.shfeAuMain),
]);

const xauusdRows = parseStooqHistory(xauusdText);
const usdcnyRows = parseStooqHistory(usdcnyText);
const gcRows = parseYahooHistory(gcPayload);
const gldRows = parseYahooHistory(gldPayload);
const uupRows = parseYahooHistory(uupPayload);
const realYieldRows = parseFredHistory(realYieldText);
const cnGoldEtfRows = parseEastmoneyKlineHistory(cnGoldEtfPayload);
const cnGoldEtfAltRows = parseEastmoneyKlineHistory(cnGoldEtfAltPayload);
const shfeAuMainRows = parseEastmoneyKlineHistory(shfeAuMainPayload);

const mergedRows = mergeDailySeries({
  xauusdRows,
  usdcnyRows,
  gcRows,
  gldRows,
  uupRows,
  realYieldRows,
  cnGoldEtfRows,
  cnGoldEtfAltRows,
  shfeAuMainRows,
});

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS daily_history (
    date TEXT PRIMARY KEY,
    xauusd_open REAL,
    xauusd_high REAL,
    xauusd_low REAL,
    xauusd_close REAL,
    usdcny_open REAL,
    usdcny_high REAL,
    usdcny_low REAL,
    usdcny_close REAL,
    price_cny_per_gram REAL,
    gc_front_close REAL,
    gc_front_volume INTEGER,
    gld_close REAL,
    gld_volume INTEGER,
    cn_gold_etf_close REAL,
    cn_gold_etf_volume INTEGER,
    cn_gold_etf_turnover REAL,
    cn_gold_etf_alt_close REAL,
    cn_gold_etf_alt_volume INTEGER,
    cn_gold_etf_alt_turnover REAL,
    shfe_au_main_close REAL,
    shfe_au_main_volume INTEGER,
    shfe_au_main_open_interest INTEGER,
    shfe_au_main_open_interest_change INTEGER,
    shfe_spot_premium_cny_per_gram REAL,
    uup_close REAL,
    uup_volume INTEGER,
    real_yield_10y REAL,
    fx_carried_forward INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
  );
`);
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN fx_carried_forward INTEGER DEFAULT 0;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN cn_gold_etf_close REAL;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN cn_gold_etf_volume INTEGER;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN cn_gold_etf_turnover REAL;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN cn_gold_etf_alt_close REAL;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN cn_gold_etf_alt_volume INTEGER;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN cn_gold_etf_alt_turnover REAL;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN shfe_au_main_close REAL;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN shfe_au_main_volume INTEGER;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN shfe_au_main_open_interest INTEGER;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN shfe_au_main_open_interest_change INTEGER;`);
} catch {
}
try {
  db.exec(`ALTER TABLE daily_history ADD COLUMN shfe_spot_premium_cny_per_gram REAL;`);
} catch {
}

db.prepare("DELETE FROM daily_history WHERE date > ?").run(END_DATE);

const insert = db.prepare(`
  INSERT INTO daily_history (
    date, xauusd_open, xauusd_high, xauusd_low, xauusd_close,
    usdcny_open, usdcny_high, usdcny_low, usdcny_close, price_cny_per_gram,
    gc_front_close, gc_front_volume, gld_close, gld_volume,
    cn_gold_etf_close, cn_gold_etf_volume, cn_gold_etf_turnover,
    cn_gold_etf_alt_close, cn_gold_etf_alt_volume, cn_gold_etf_alt_turnover,
    shfe_au_main_close, shfe_au_main_volume, shfe_au_main_open_interest, shfe_au_main_open_interest_change, shfe_spot_premium_cny_per_gram,
    uup_close, uup_volume,
    real_yield_10y, fx_carried_forward, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?
  )
  ON CONFLICT(date) DO UPDATE SET
    xauusd_open = excluded.xauusd_open,
    xauusd_high = excluded.xauusd_high,
    xauusd_low = excluded.xauusd_low,
    xauusd_close = excluded.xauusd_close,
    usdcny_open = excluded.usdcny_open,
    usdcny_high = excluded.usdcny_high,
    usdcny_low = excluded.usdcny_low,
    usdcny_close = excluded.usdcny_close,
    price_cny_per_gram = excluded.price_cny_per_gram,
    gc_front_close = excluded.gc_front_close,
    gc_front_volume = excluded.gc_front_volume,
    gld_close = excluded.gld_close,
    gld_volume = excluded.gld_volume,
    cn_gold_etf_close = excluded.cn_gold_etf_close,
    cn_gold_etf_volume = excluded.cn_gold_etf_volume,
    cn_gold_etf_turnover = excluded.cn_gold_etf_turnover,
    cn_gold_etf_alt_close = excluded.cn_gold_etf_alt_close,
    cn_gold_etf_alt_volume = excluded.cn_gold_etf_alt_volume,
    cn_gold_etf_alt_turnover = excluded.cn_gold_etf_alt_turnover,
    shfe_au_main_close = excluded.shfe_au_main_close,
    shfe_au_main_volume = excluded.shfe_au_main_volume,
    shfe_au_main_open_interest = excluded.shfe_au_main_open_interest,
    shfe_au_main_open_interest_change = excluded.shfe_au_main_open_interest_change,
    shfe_spot_premium_cny_per_gram = excluded.shfe_spot_premium_cny_per_gram,
    uup_close = excluded.uup_close,
    uup_volume = excluded.uup_volume,
    real_yield_10y = excluded.real_yield_10y,
    fx_carried_forward = excluded.fx_carried_forward,
    updated_at = excluded.updated_at
`);

const updatedAt = new Date().toISOString();
db.exec("BEGIN");
try {
  for (const row of mergedRows) {
    insert.run(
      row.date,
      row.xauusdOpen,
      row.xauusdHigh,
      row.xauusdLow,
      row.xauusdClose,
      row.usdcnyOpen,
      row.usdcnyHigh,
      row.usdcnyLow,
      row.usdcnyClose,
      row.priceCnyPerGram,
      row.gcFrontClose,
      row.gcFrontVolume,
      row.gldClose,
      row.gldVolume,
      row.cnGoldEtfClose,
      row.cnGoldEtfVolume,
      row.cnGoldEtfTurnover,
      row.cnGoldEtfAltClose,
      row.cnGoldEtfAltVolume,
      row.cnGoldEtfAltTurnover,
      row.shfeAuMainClose,
      row.shfeAuMainVolume,
      row.shfeAuMainOpenInterest,
      row.shfeAuMainOpenInterestChange,
      row.shfeSpotPremiumCnyPerGram,
      row.uupClose,
      row.uupVolume,
      row.realYield10Y,
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
  startDate: mergedRows[0]?.date || null,
  endDate: mergedRows.at(-1)?.date || null,
  rowCount: mergedRows.length,
  sources: SOURCES,
};
await writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/plain,text/csv,application/json,*/*" } });
  if (!response.ok) throw new Error(`Request failed for ${url}: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json,text/plain,*/*" } });
  if (!response.ok) throw new Error(`Request failed for ${url}: ${response.status}`);
  return response.json();
}

function parseStooqHistory(csvText) {
  const [headerLine, ...dataLines] = String(csvText).trim().split(/\r?\n/).filter(Boolean);
  if (!headerLine) return [];
  return dataLines.map((line) => {
    const [date, open, high, low, close] = line.split(",");
    return {
      date,
      open: toNumber(open),
      high: toNumber(high),
      low: toNumber(low),
      close: toNumber(close),
    };
  }).filter((row) => row.date >= START_DATE && row.date <= END_DATE);
}

function parseYahooHistory(payload) {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  return timestamps.map((timestamp, index) => ({
    date: toDateString(timestamp),
    close: toPositiveNumber(quote.close?.[index]),
    volume: toPositiveInteger(quote.volume?.[index]),
  })).filter((row) => row.date >= START_DATE && row.date <= END_DATE);
}

function parseFredHistory(csvText) {
  const rows = String(csvText).trim().split(/\r?\n/).slice(1).filter(Boolean);
  return rows.map((line) => {
    const [date, value] = line.split(",");
    return { date, value: toNumber(value) };
  }).filter((row) => row.date >= START_DATE && row.date <= END_DATE);
}

function parseEastmoneyKlineHistory(payload) {
  const scale = Number(payload?.data?.decimal);
  const divisor = Number.isFinite(scale) ? 10 ** scale : 1;
  const rows = payload?.data?.klines || [];
  return rows.map((line) => {
    const [date, open, close, high, low, volume, turnover] = String(line).split(",");
    return {
      date,
      open: toNumber(open),
      close: toNumber(close),
      high: toNumber(high),
      low: toNumber(low),
      volume: toPositiveInteger(volume),
      turnover: toPositiveNumber(turnover),
      divisor,
    };
  }).filter((row) => row.date >= START_DATE && row.date <= END_DATE).map((row) => ({
    date: row.date,
    close: Number.isFinite(row.close) ? round(row.close, 3) : null,
    volume: row.volume,
    turnover: row.turnover,
  }));
}

function mergeDailySeries(seriesMap) {
  const dates = new Set([
    ...seriesMap.xauusdRows.map((row) => row.date),
    ...seriesMap.usdcnyRows.map((row) => row.date),
    ...seriesMap.gcRows.map((row) => row.date),
    ...seriesMap.gldRows.map((row) => row.date),
    ...seriesMap.cnGoldEtfRows.map((row) => row.date),
    ...seriesMap.cnGoldEtfAltRows.map((row) => row.date),
    ...seriesMap.shfeAuMainRows.map((row) => row.date),
    ...seriesMap.uupRows.map((row) => row.date),
    ...seriesMap.realYieldRows.map((row) => row.date),
  ]);

  const xauusdByDate = new Map(seriesMap.xauusdRows.map((row) => [row.date, row]));
  const usdcnyByDate = new Map(seriesMap.usdcnyRows.map((row) => [row.date, row]));
  const gcByDate = new Map(seriesMap.gcRows.map((row) => [row.date, row]));
  const gldByDate = new Map(seriesMap.gldRows.map((row) => [row.date, row]));
  const cnGoldEtfByDate = new Map(seriesMap.cnGoldEtfRows.map((row) => [row.date, row]));
  const cnGoldEtfAltByDate = new Map(seriesMap.cnGoldEtfAltRows.map((row) => [row.date, row]));
  const shfeAuMainByDate = new Map(seriesMap.shfeAuMainRows.map((row) => [row.date, row]));
  const uupByDate = new Map(seriesMap.uupRows.map((row) => [row.date, row]));
  const realYieldByDate = new Map(seriesMap.realYieldRows.map((row) => [row.date, row]));

  const rows = [...dates].sort().map((date) => {
    const xauusd = xauusdByDate.get(date) || {};
    const usdcny = usdcnyByDate.get(date) || {};
    const gc = gcByDate.get(date) || {};
    const gld = gldByDate.get(date) || {};
    const cnGoldEtf = cnGoldEtfByDate.get(date) || {};
    const cnGoldEtfAlt = cnGoldEtfAltByDate.get(date) || {};
    const shfeAuMain = shfeAuMainByDate.get(date) || {};
    const uup = uupByDate.get(date) || {};
    const realYield = realYieldByDate.get(date) || {};
    const priceCnyPerGram = computeCnyPerGram(xauusd.close, usdcny.close);
    return {
      date,
      xauusdOpen: xauusd.open ?? null,
      xauusdHigh: xauusd.high ?? null,
      xauusdLow: xauusd.low ?? null,
      xauusdClose: xauusd.close ?? null,
      usdcnyOpen: usdcny.open ?? null,
      usdcnyHigh: usdcny.high ?? null,
      usdcnyLow: usdcny.low ?? null,
      usdcnyClose: usdcny.close ?? null,
      priceCnyPerGram,
      gcFrontClose: gc.close ?? null,
      gcFrontVolume: gc.volume ?? null,
      gldClose: gld.close ?? null,
      gldVolume: gld.volume ?? null,
      cnGoldEtfClose: cnGoldEtf.close ?? null,
      cnGoldEtfVolume: cnGoldEtf.volume ?? null,
      cnGoldEtfTurnover: cnGoldEtf.turnover ?? null,
      cnGoldEtfAltClose: cnGoldEtfAlt.close ?? null,
      cnGoldEtfAltVolume: cnGoldEtfAlt.volume ?? null,
      cnGoldEtfAltTurnover: cnGoldEtfAlt.turnover ?? null,
      shfeAuMainClose: shfeAuMain.close ?? null,
      shfeAuMainVolume: shfeAuMain.volume ?? null,
      shfeAuMainOpenInterest: null,
      shfeAuMainOpenInterestChange: null,
      shfeSpotPremiumCnyPerGram: Number.isFinite(shfeAuMain.close) && Number.isFinite(priceCnyPerGram) ? round(shfeAuMain.close - priceCnyPerGram, 4) : null,
      uupClose: uup.close ?? null,
      uupVolume: uup.volume ?? null,
      realYield10Y: realYield.value ?? null,
      fxCarriedForward: false,
    };
  });
  fillForward(rows, "usdcnyOpen", "fxCarriedForward");
  fillForward(rows, "usdcnyHigh", "fxCarriedForward");
  fillForward(rows, "usdcnyLow", "fxCarriedForward");
  fillForward(rows, "usdcnyClose", "fxCarriedForward");
  for (const row of rows) {
    row.priceCnyPerGram = computeCnyPerGram(row.xauusdClose, row.usdcnyClose);
    row.shfeSpotPremiumCnyPerGram = Number.isFinite(row.shfeAuMainClose) && Number.isFinite(row.priceCnyPerGram)
      ? round(row.shfeAuMainClose - row.priceCnyPerGram, 4)
      : null;
  }
  return rows;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computeCnyPerGram(priceUsdPerOz, usdCnyRate) {
  if (!Number.isFinite(priceUsdPerOz) || !Number.isFinite(usdCnyRate)) return null;
  return round((priceUsdPerOz * usdCnyRate) / TROY_OUNCE_TO_GRAMS, 4);
}

function toDateString(timestampSeconds) {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
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
