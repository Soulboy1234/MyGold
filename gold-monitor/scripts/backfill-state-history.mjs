import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STATE_DIR = path.join(ROOT_DIR, "state");
const WORKSPACE_ROOT = path.resolve(ROOT_DIR, "..");
const HIGHRES_DB_FILE = path.join(WORKSPACE_ROOT, "gold-dashboard", "data", "highres.db");
const DAILY_DB_FILE = path.join(WORKSPACE_ROOT, "gold-dashboard", "data", "history.db");
const HF_STATE_FILE = path.join(STATE_DIR, "high_frequency_history.jsonl");
const DAILY_STATE_FILE = path.join(STATE_DIR, "daily_context_history.jsonl");
const MAX_HIGH_FREQUENCY_HISTORY_ROWS = 60000;
const MAX_DAILY_HISTORY_ROWS = 8000;

await mkdir(STATE_DIR, { recursive: true });

const existingHighFrequency = await readJsonLines(HF_STATE_FILE);
const existingDaily = await readJsonLines(DAILY_STATE_FILE);

const existingHighFrequencyByTime = new Map(
  existingHighFrequency
    .filter((row) => typeof row?.checkedAtLocal === "string" && row.checkedAtLocal.trim())
    .map((row) => [row.checkedAtLocal, row])
);

const existingDailyByDate = new Map(
  existingDaily
    .filter((row) => typeof row?.date === "string" && row.date.trim())
    .map((row) => [row.date, row])
);

const highFrequencyBackfill = loadHighFrequencyRows();
const dailyBackfill = loadDailyRows();

const mergedHighFrequency = mergeHighFrequencyHistory(highFrequencyBackfill, existingHighFrequencyByTime)
  .slice(-MAX_HIGH_FREQUENCY_HISTORY_ROWS);
const mergedDaily = mergeDailyHistory(dailyBackfill, existingDailyByDate)
  .slice(-MAX_DAILY_HISTORY_ROWS);

await writeJsonLines(HF_STATE_FILE, mergedHighFrequency);
await writeJsonLines(DAILY_STATE_FILE, mergedDaily);

console.log(JSON.stringify({
  highFrequency: {
    file: HF_STATE_FILE,
    rows: mergedHighFrequency.length,
    first: mergedHighFrequency[0]?.checkedAtLocal ?? null,
    last: mergedHighFrequency.at(-1)?.checkedAtLocal ?? null,
  },
  dailyContext: {
    file: DAILY_STATE_FILE,
    rows: mergedDaily.length,
    first: mergedDaily[0]?.date ?? null,
    last: mergedDaily.at(-1)?.date ?? null,
  },
}, null, 2));

function loadHighFrequencyRows() {
  const db = new DatabaseSync(HIGHRES_DB_FILE, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT
        timestamp_local AS checkedAtLocal,
        timestamp_utc AS timestampUtc,
        price_usd_per_oz AS priceUsdPerOz,
        price_cny_per_gram AS priceCnyPerGram,
        usd_cny_rate AS usdCnyRate,
        gc_front_close AS gcFrontClose,
        gc_front_volume AS gcFrontVolume,
        uup_close AS dollarProxyClose,
        uup_volume AS dollarProxyVolume
      FROM intraday_history
      ORDER BY timestamp_utc ASC
    `).all();

    return rows.map((row, index) => {
      const checkedAtLocal = String(row.checkedAtLocal || "").trim();
      return {
        checkedAt: Number.isFinite(row.timestampUtc) ? new Date(Number(row.timestampUtc) * 1000).toISOString() : null,
        checkedAtLocal,
        priceUsdPerOz: toNumber(row.priceUsdPerOz, 2),
        priceCnyPerGram: toNumber(row.priceCnyPerGram, 2),
        usdCnyRate: toNumber(row.usdCnyRate, 4),
        gcFrontClose: toNumber(row.gcFrontClose, 2),
        gcFrontVolume: toInteger(row.gcFrontVolume),
        dollarProxyClose: toNumber(row.dollarProxyClose, 2),
        dollarProxyVolume: toInteger(row.dollarProxyVolume),
        changePct: null,
        direction: "",
        highFrequencyAdvice: "",
        missing: [],
        _order: index,
      };
    });
  } finally {
    db.close();
  }
}

function loadDailyRows() {
  const db = new DatabaseSync(DAILY_DB_FILE, { readOnly: true });
  try {
    return db.prepare(`
      SELECT
        date,
        gc_front_close AS gcFrontClose,
        gc_front_volume AS gcFrontVolume,
        gld_close AS gldClose,
        gld_volume AS gldVolume,
        uup_close AS dollarProxyClose,
        uup_volume AS dollarProxyVolume,
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
      ORDER BY date ASC
    `).all().map((row) => ({
      date: row.date,
      gcFrontClose: toNumber(row.gcFrontClose, 2),
      gcFrontVolume: toInteger(row.gcFrontVolume),
      gcFrontOpenInterest: null,
      gldClose: toNumber(row.gldClose, 2),
      gldVolume: toInteger(row.gldVolume),
      dollarProxyClose: toNumber(row.dollarProxyClose, 2),
      dollarProxyVolume: toInteger(row.dollarProxyVolume),
      realYield10Y: toNumber(row.realYield10Y, 2),
      cnGoldEtfClose: toNumber(row.cnGoldEtfClose, 3),
      cnGoldEtfVolume: toInteger(row.cnGoldEtfVolume),
      cnGoldEtfTurnover: toInteger(row.cnGoldEtfTurnover),
      cnGoldEtfAltClose: toNumber(row.cnGoldEtfAltClose, 3),
      cnGoldEtfAltVolume: toInteger(row.cnGoldEtfAltVolume),
      cnGoldEtfAltTurnover: toInteger(row.cnGoldEtfAltTurnover),
      shfeAuMainClose: toNumber(row.shfeAuMainClose, 2),
      shfeAuMainVolume: toInteger(row.shfeAuMainVolume),
      shfeAuMainOpenInterest: toInteger(row.shfeAuMainOpenInterest),
      shfeAuMainOpenInterestChange: toInteger(row.shfeAuMainOpenInterestChange),
      sgeAu9999: null,
      sgeAuTd: null,
      sgeSpotPremiumCnyPerGram: null,
      sgeTdSpreadCnyPerGram: null,
      shfeSpotPremiumCnyPerGram: toNumber(row.shfeSpotPremiumCnyPerGram, 2),
      commentary: "",
      dailyAdvice: "",
    }));
  } finally {
    db.close();
  }
}

function mergeHighFrequencyHistory(backfillRows, existingRowsByTime) {
  return backfillRows
    .map((row) => {
      const existing = existingRowsByTime.get(row.checkedAtLocal);
      if (!existing) return sanitizeJson(row);
      return sanitizeJson({
        ...row,
        ...pickExistingHighFrequencyFields(existing),
        checkedAt: existing.checkedAt || row.checkedAt,
        checkedAtLocal: row.checkedAtLocal,
      });
    })
    .filter((row) => row.checkedAtLocal && Number.isFinite(row.priceCnyPerGram));
}

function mergeDailyHistory(backfillRows, existingRowsByDate) {
  return backfillRows
    .map((row) => {
      const existing = existingRowsByDate.get(row.date);
      if (!existing) return sanitizeJson(row);
      return sanitizeJson({
        ...row,
        ...pickExistingDailyFields(existing),
        date: row.date,
      });
    })
    .filter((row) => row.date);
}

async function readJsonLines(filePath) {
  try {
    const raw = String(await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
    return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonLines(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(filePath, `${body}${body ? "\n" : ""}`, "utf8");
}

function sanitizeJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value, digits = 2) {
  return Number.isFinite(value) ? round(Number(value), digits) : null;
}

function toInteger(value) {
  return Number.isFinite(value) ? Math.round(Number(value)) : null;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function pickExistingHighFrequencyFields(existing) {
  return {
    changePct: Number.isFinite(existing.changePct) ? existing.changePct : null,
    direction: "",
    highFrequencyAdvice: "",
    missing: Array.isArray(existing.missing) ? existing.missing : [],
  };
}

function pickExistingDailyFields(existing) {
  return {
    gcFrontOpenInterest: toInteger(existing.gcFrontOpenInterest),
    sgeAu9999: toNumber(existing.sgeAu9999, 2),
    sgeAuTd: toNumber(existing.sgeAuTd, 2),
    sgeSpotPremiumCnyPerGram: toNumber(existing.sgeSpotPremiumCnyPerGram, 2),
    sgeTdSpreadCnyPerGram: toNumber(existing.sgeTdSpreadCnyPerGram, 2),
    commentary: "",
    dailyAdvice: "",
  };
}
