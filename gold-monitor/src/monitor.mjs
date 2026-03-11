import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STATE_DIR = path.join(ROOT_DIR, "state");
const OUT_DIR = path.join(ROOT_DIR, "out");
const SNAPSHOT_DIR = path.join(OUT_DIR, "snapshots");
const CONFIG_FILE = path.join(ROOT_DIR, "config.json");
const STATE_FILE = path.join(STATE_DIR, "latest.json");
const HF_STATE_FILE = path.join(STATE_DIR, "high_frequency_history.jsonl");
const DAILY_STATE_FILE = path.join(STATE_DIR, "daily_context_history.jsonl");
const RECORD_FILE = path.join(OUT_DIR, "records.csv");
const ALERT_RECORD_FILE = path.join(OUT_DIR, "alerts.csv");
const HF_FILE = path.join(OUT_DIR, "high_frequency.csv");
const HF_LATEST_FILE = path.join(OUT_DIR, "high_frequency_latest.txt");
const DAILY_FILE = path.join(OUT_DIR, "daily_context.csv");
const DAILY_LATEST_FILE = path.join(OUT_DIR, "daily_context_latest.txt");
const ADVICE_LATEST_FILE = path.join(OUT_DIR, "investment_advice_latest.txt");
const SNAPSHOT_INDEX_FILE = path.join(OUT_DIR, "snapshot_status.txt");
const SOURCE_DIAGNOSTICS_FILE = path.join(OUT_DIR, "source_diagnostics_latest.txt");
const LATEST_FILE = path.join(OUT_DIR, "latest.txt");
const ALERT_FILE = path.join(OUT_DIR, "last-alert.txt");
const UTF8_BOM = "\uFEFF";
const TROY_OUNCE_TO_GRAMS = 31.1034768;
const FETCH_TIMEOUT_MS = 12000;
const FETCH_RETRY_DELAYS_MS = [1500, 3000, 5000];
const FILE_RETRY_DELAYS_MS = [150, 350, 700, 1200];
const MAX_HIGH_FREQUENCY_HISTORY_ROWS = 5000;
const MAX_DAILY_HISTORY_ROWS = 4000;
const ALERT_HEADER = "时间,XAU/USD(美元/盎司),人民币价格(元/克),美元兑人民币汇率,相较上一次涨跌幅,评价,报警原因\n";
const HF_HEADER = "时间,XAU/USD(美元/盎司),人民币价格(元/克),美元兑人民币汇率,GC近月收盘,GC近月成交量,UUP收盘,DXY代理,相较上一次涨跌幅,评价,建议\n";
const DAILY_HEADER = "日期,GC近月收盘,GC近月成交量,GLD收盘,GLD成交量,UUP收盘,UUP成交量,10年实际利率,点评,建议\n";
const HIGH_FREQUENCY_ROW_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},/;
const DAILY_ROW_PATTERN = /^\d{4}-\d{2}-\d{2},/;
const DEFAULT_CONFIG = {
  symbol: "XAU/USD",
  schedule: { intervalMinutes: 5 },
  dataSource: {
    provider: "validated-multi-source",
    goldSymbol: "xauusd",
    fxSymbol: "usdcny",
    goldFuturesSymbol: "GC=F",
    eastmoneyGcQuoteCode: "101_GC00Y",
    goldEtfSymbol: "GLD",
    eastmoneyGldSecid: "107.GLD",
    dollarProxySymbol: "UUP",
    eastmoneyDollarProxySecid: "107.UUP",
    realYieldFredSeries: "FII10",
    goldApiSymbol: "XAU",
    yahooFxSymbol: "USDCNY=X",
    stooqGldSymbol: "gld.us",
    stooqDollarProxySymbol: "uup.us",
    treasuryRealYieldUrl: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_real_yield_curve",
    cnGoldSymbols: ["hf_XAU", "hf_GC"],
    cnFxSymbols: ["fx_susdcny", "USDCNY", "fx_USDCNY"],
    cnGoldFuturesSymbols: ["hf_GC"],
  },
  thresholds: { upperUsd: 5500, lowerUsd: 5000 },
};

export function parseStooqCsv(csvText) {
  const line = String(csvText).trim();
  if (!line) throw new Error("行情返回为空");
  const parts = line.split(",");
  if (parts.length < 7) throw new Error(`行情格式异常: ${line}`);
  const [symbol, datePart, timePart, openPart, highPart, lowPart, closePart, volumePart] = parts;
  const open = Number(openPart);
  const high = Number(highPart);
  const low = Number(lowPart);
  const close = Number(closePart);
  if (![open, high, low, close].every(Number.isFinite)) throw new Error(`行情数值异常: ${line}`);
  const volume = Number(volumePart);
  return { source: "Stooq", symbol, date: datePart, time: timePart, open, high, low, close, volume: Number.isFinite(volume) ? volume : null };
}

export function parseYahooChart(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !quote) throw new Error("Yahoo 图表数据为空");
  const closes = (quote.close || []).filter((value) => Number.isFinite(value));
  const volumes = (quote.volume || []).filter((value) => Number.isFinite(value));
  return { symbol: result?.meta?.symbol || null, close: closes.at(-1) ?? null, volume: volumes.at(-1) ?? null, source: "Yahoo" };
}

export function parseFredCsv(csvText) {
  const lines = String(csvText).trim().split(/\r?\n/).slice(1).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const [date, valueText] = lines[index].split(",");
    const value = Number(valueText);
    if (date && Number.isFinite(value)) return { date, value, source: "FRED" };
  }
  throw new Error("FRED 数据为空");
}

export function parseGoldApiJson(payload) {
  const price = Number(payload?.price);
  if (!Number.isFinite(price)) throw new Error("Gold-API 数据为空");
  return {
    source: "Gold-API",
    symbol: payload?.symbol || "XAU",
    open: price,
    high: price,
    low: price,
    close: price,
  };
}

export function parseEastmoneyFuturesQtJson(payload) {
  const quote = payload?.qt;
  const close = Number(quote?.p);
  if (!Number.isFinite(close)) throw new Error("东方财富期货数据为空");
  const open = Number(quote?.o);
  const high = Number(quote?.h);
  const low = Number(quote?.l);
  const volume = Number(quote?.vol);
  return {
    source: "Eastmoney",
    symbol: quote?.dm || null,
    open: Number.isFinite(open) ? open : close,
    high: Number.isFinite(high) ? high : close,
    low: Number.isFinite(low) ? low : close,
    close,
    volume: Number.isFinite(volume) ? volume : null,
  };
}

export function parseEastmoneyStockQuoteJson(payload) {
  const quote = payload?.data;
  const scale = Number(quote?.f59);
  const divisor = Number.isFinite(scale) ? 10 ** scale : 1;
  const closeRaw = Number(quote?.f43);
  if (!Number.isFinite(closeRaw)) throw new Error("东方财富证券数据为空");
  const openRaw = Number(quote?.f46);
  const highRaw = Number(quote?.f44);
  const lowRaw = Number(quote?.f45);
  const volume = Number(quote?.f47);
  return {
    source: "Eastmoney",
    symbol: quote?.f57 || null,
    open: Number.isFinite(openRaw) ? openRaw / divisor : closeRaw / divisor,
    high: Number.isFinite(highRaw) ? highRaw / divisor : closeRaw / divisor,
    low: Number.isFinite(lowRaw) ? lowRaw / divisor : closeRaw / divisor,
    close: closeRaw / divisor,
    volume: Number.isFinite(volume) ? volume : null,
  };
}

export function parseTreasuryRealYieldCsv(csvText) {
  const lines = String(csvText).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("Treasury 实际利率数据为空");
  const header = lines[0].split(",");
  const valueIndex = header.findIndex((item) => item.replace(/"/g, "").trim() === "10 YR");
  if (valueIndex < 0) throw new Error("Treasury 数据缺少 10 YR 列");
  for (let index = 1; index < lines.length; index += 1) {
    const parts = lines[index].split(",");
    const rawDate = parts[0]?.replace(/"/g, "").trim();
    const value = Number(parts[valueIndex]?.replace(/"/g, "").trim());
    if (rawDate && Number.isFinite(value)) {
      const [month, day, year] = rawDate.split("/");
      return {
        source: "Treasury",
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        value,
      };
    }
  }
  throw new Error("Treasury 10年实际利率为空");
}

export function parseSinaHqText(text) {
  const match = String(text).match(/var\s+hq_str_([^=]+)="([\s\S]*?)";/);
  if (!match) throw new Error("新浪行情格式异常");
  const [, symbol, body] = match;
  const parts = body.split(",").map((part) => part.trim());
  if (symbol.startsWith("hf_")) {
    const close = Number(parts[0]);
    const open = Number(parts[2] || parts[0]);
    const high = Number(parts[4] || Math.max(close, open));
    const low = Number(parts[5] || Math.min(close, open));
    if (![close, open, high, low].every(Number.isFinite)) throw new Error("新浪期货/贵金属数值异常");
    return { source: "Sina", symbol, open, high, low, close };
  }
  if (symbol.startsWith("fx_") || symbol.toUpperCase().includes("USDCNY")) {
    const close = Number(parts[1]);
    const open = Number(parts[8] || parts[1]);
    const high = Number(parts[5] || Math.max(close, open));
    const low = Number(parts[6] || Math.min(close, open));
    if (![close, open, high, low].every(Number.isFinite)) throw new Error("新浪外汇数值异常");
    return { source: "Sina", symbol, open, high, low, close };
  }
  const numbers = parts.map((part) => Number(part)).filter((value) => Number.isFinite(value) && value > 0);
  if (!numbers.length) throw new Error("新浪行情数值为空");
  const close = numbers[0];
  const open = numbers[1] ?? numbers[0];
  const high = Math.max(...numbers.slice(0, Math.min(numbers.length, 4)));
  const low = Math.min(...numbers.slice(0, Math.min(numbers.length, 4)));
  return { source: "Sina", symbol, open, high, low, close };
}

export function normalizeConfig(config) {
  const upperUsd = Number(config?.thresholds?.upperUsd ?? DEFAULT_CONFIG.thresholds.upperUsd);
  const lowerUsd = Number(config?.thresholds?.lowerUsd ?? DEFAULT_CONFIG.thresholds.lowerUsd);
  const intervalMinutes = Number(config?.schedule?.intervalMinutes ?? DEFAULT_CONFIG.schedule.intervalMinutes);
  return {
    symbol: config?.symbol || DEFAULT_CONFIG.symbol,
    schedule: { intervalMinutes: Number.isFinite(intervalMinutes) ? Math.max(1, Math.floor(intervalMinutes)) : DEFAULT_CONFIG.schedule.intervalMinutes },
    dataSource: {
      provider: DEFAULT_CONFIG.dataSource.provider,
      goldSymbol: config?.dataSource?.goldSymbol || DEFAULT_CONFIG.dataSource.goldSymbol,
      fxSymbol: config?.dataSource?.fxSymbol || DEFAULT_CONFIG.dataSource.fxSymbol,
      goldFuturesSymbol: config?.dataSource?.goldFuturesSymbol || DEFAULT_CONFIG.dataSource.goldFuturesSymbol,
      eastmoneyGcQuoteCode: config?.dataSource?.eastmoneyGcQuoteCode || DEFAULT_CONFIG.dataSource.eastmoneyGcQuoteCode,
      goldEtfSymbol: config?.dataSource?.goldEtfSymbol || DEFAULT_CONFIG.dataSource.goldEtfSymbol,
      eastmoneyGldSecid: config?.dataSource?.eastmoneyGldSecid || DEFAULT_CONFIG.dataSource.eastmoneyGldSecid,
      dollarProxySymbol: config?.dataSource?.dollarProxySymbol || DEFAULT_CONFIG.dataSource.dollarProxySymbol,
      eastmoneyDollarProxySecid: config?.dataSource?.eastmoneyDollarProxySecid || DEFAULT_CONFIG.dataSource.eastmoneyDollarProxySecid,
      realYieldFredSeries: config?.dataSource?.realYieldFredSeries || DEFAULT_CONFIG.dataSource.realYieldFredSeries,
      goldApiSymbol: config?.dataSource?.goldApiSymbol || DEFAULT_CONFIG.dataSource.goldApiSymbol,
      yahooFxSymbol: config?.dataSource?.yahooFxSymbol || DEFAULT_CONFIG.dataSource.yahooFxSymbol,
      stooqGldSymbol: config?.dataSource?.stooqGldSymbol || DEFAULT_CONFIG.dataSource.stooqGldSymbol,
      stooqDollarProxySymbol: config?.dataSource?.stooqDollarProxySymbol || DEFAULT_CONFIG.dataSource.stooqDollarProxySymbol,
      treasuryRealYieldUrl: config?.dataSource?.treasuryRealYieldUrl || DEFAULT_CONFIG.dataSource.treasuryRealYieldUrl,
      cnGoldSymbols: Array.isArray(config?.dataSource?.cnGoldSymbols) && config.dataSource.cnGoldSymbols.length ? config.dataSource.cnGoldSymbols : DEFAULT_CONFIG.dataSource.cnGoldSymbols,
      cnFxSymbols: Array.isArray(config?.dataSource?.cnFxSymbols) && config.dataSource.cnFxSymbols.length ? config.dataSource.cnFxSymbols : DEFAULT_CONFIG.dataSource.cnFxSymbols,
      cnGoldFuturesSymbols: Array.isArray(config?.dataSource?.cnGoldFuturesSymbols) && config.dataSource.cnGoldFuturesSymbols.length ? config.dataSource.cnGoldFuturesSymbols : DEFAULT_CONFIG.dataSource.cnGoldFuturesSymbols,
    },
    thresholds: { upperUsd: Number.isFinite(upperUsd) ? upperUsd : DEFAULT_CONFIG.thresholds.upperUsd, lowerUsd: Number.isFinite(lowerUsd) ? lowerUsd : DEFAULT_CONFIG.thresholds.lowerUsd },
  };
}

export async function loadConfig() {
  await mkdir(ROOT_DIR, { recursive: true });
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return normalizeConfig(JSON.parse(stripBom(raw)));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const config = normalizeConfig(DEFAULT_CONFIG);
    await atomicWriteFile(CONFIG_FILE, withBom(JSON.stringify(config, null, 2) + "\n"));
    return config;
  }
}

export function getShortTermDirection(quote, previousState) {
  if (!quote || !Number.isFinite(quote.close) || !Number.isFinite(quote.open)) return "数据不足";
  const intradayDelta = quote.close - quote.open;
  const previousDelta = Number.isFinite(previousState?.priceUsdPerOz) ? quote.close - previousState.priceUsdPerOz : 0;
  const strongBias = Math.abs(intradayDelta) >= Math.max(1, quote.close * 0.0005);
  if (intradayDelta > 0 && previousDelta >= 0) return "短线偏强";
  if (intradayDelta < 0 && previousDelta <= 0) return "短线偏弱";
  if (strongBias) return intradayDelta > 0 ? "短线偏强" : "短线偏弱";
  return "短线震荡";
}

export function convertUsdPerOzToCnyPerGram(priceUsdPerOz, usdCnyRate) {
  return round2((priceUsdPerOz * usdCnyRate) / TROY_OUNCE_TO_GRAMS);
}

export function buildStatus(goldQuote, fxQuote, gcQuote, dollarProxyQuote, previousState, config, fetchDiagnostics = {}, sourceSummary = {}) {
  const priceUsdPerOz = Number.isFinite(goldQuote?.close) ? round2(goldQuote.close) : null;
  const usdCnyRate = Number.isFinite(fxQuote?.close) ? round4(fxQuote.close) : null;
  const priceCnyPerGram = priceUsdPerOz !== null && usdCnyRate !== null ? convertUsdPerOzToCnyPerGram(priceUsdPerOz, usdCnyRate) : null;
  const previousPriceUsdPerOz = Number.isFinite(previousState?.priceUsdPerOz) ? previousState.priceUsdPerOz : null;
  const changePct = priceUsdPerOz !== null && previousPriceUsdPerOz !== null ? round4(((priceUsdPerOz - previousPriceUsdPerOz) / previousPriceUsdPerOz) * 100) : null;
  const direction = getShortTermDirection(goldQuote, previousState);
  const isAlert = priceUsdPerOz !== null && (priceUsdPerOz > config.thresholds.upperUsd || priceUsdPerOz < config.thresholds.lowerUsd);
  const thresholdText = priceUsdPerOz !== null ? (priceUsdPerOz > config.thresholds.upperUsd ? `高于 ${config.thresholds.upperUsd}` : priceUsdPerOz < config.thresholds.lowerUsd ? `低于 ${config.thresholds.lowerUsd}` : "") : "";
  const gcFrontClose = Number.isFinite(gcQuote?.close) ? round2(gcQuote.close) : null;
  const gcFrontVolume = Number.isFinite(gcQuote?.volume) ? gcQuote.volume : null;
  const dollarProxyClose = Number.isFinite(dollarProxyQuote?.close) ? round2(dollarProxyQuote.close) : null;
  const dollarProxyVolume = Number.isFinite(dollarProxyQuote?.volume) ? dollarProxyQuote.volume : null;
  const missing = [];
  if (priceUsdPerOz === null) missing.push("XAU/USD");
  if (usdCnyRate === null) missing.push("USD/CNY");
  if (gcFrontClose === null) missing.push("GC近月");
  if (dollarProxyClose === null) missing.push("DXY代理");
  const parts = [
    `${config.symbol} ${formatMaybe(priceUsdPerOz, 2, "空")} 美元/盎司`,
    `人民币 ${formatMaybe(priceCnyPerGram, 2, "空")} 元/克`,
    `美元兑人民币 ${formatMaybe(usdCnyRate, 4, "空")}`,
    `GC近月 ${formatMaybe(gcFrontClose, 2, "空")}`,
    `DXY代理 ${formatMaybe(dollarProxyClose, 2, "空")}`,
    changePct === null ? "较上次空" : `较上次 ${formatSigned(changePct)}%`,
    direction,
  ];
  if (missing.length) parts.push(`缺失 ${missing.join("、")}`);
  if (Object.values(fetchDiagnostics).some((items) => items?.length)) parts.push("回退已启用");
  const baseMessage = parts.join("，") + "。";
  const message = isAlert ? `提醒：${baseMessage.replace(/。$/, "") }，${thresholdText}。` : baseMessage;
  return {
    source: goldQuote?.source || fxQuote?.source || gcQuote?.source || null,
    symbol: config.symbol,
    priceUsdPerOz,
    priceCnyPerGram,
    usdCnyRate,
    previousPriceUsdPerOz,
    changePct,
    direction,
    isAlert,
    thresholdText,
    message,
    gcFrontClose,
    gcFrontVolume,
    dollarProxyClose,
    dollarProxyVolume,
    sourceSummary,
    fetchDiagnostics,
    missing,
  };
}

export function buildDailyContext(gcQuote, gldQuote, dollarProxyQuote, realYield) {
  const gcFrontClose = Number.isFinite(gcQuote?.close) ? round2(gcQuote.close) : null;
  const gcFrontVolume = Number.isFinite(gcQuote?.volume) ? gcQuote.volume : null;
  const gldClose = Number.isFinite(gldQuote?.close) ? round2(gldQuote.close) : null;
  const gldVolume = Number.isFinite(gldQuote?.volume) ? gldQuote.volume : null;
  const dollarProxyClose = Number.isFinite(dollarProxyQuote?.close) ? round2(dollarProxyQuote.close) : null;
  const dollarProxyVolume = Number.isFinite(dollarProxyQuote?.volume) ? dollarProxyQuote.volume : null;
  const realYield10Y = Number.isFinite(realYield?.value) ? round2(realYield.value) : null;
  return {
    date: realYield?.date || formatLocalDate(new Date()),
    gcFrontClose,
    gcFrontVolume,
    gldClose,
    gldVolume,
    dollarProxyClose,
    dollarProxyVolume,
    realYield10Y,
    commentary: [`GC近月 ${formatMaybe(gcFrontClose, 2, "空")}`, `GLD ${formatMaybe(gldClose, 2, "空")}`, `UUP ${formatMaybe(dollarProxyClose, 2, "空")}`, `10年实际利率 ${formatMaybe(realYield10Y, 2, "空")}${realYield10Y === null ? "" : "%"}`].join("，"),
  };
}

export function buildHighFrequencyHeaderDescription() {
  return "说明：XAU/USD=伦敦金美元/盎司现价；人民币价格=按USD/CNY换算后的元/克；GC近月收盘/成交量=COMEX黄金近月期货价格与活跃度；UUP收盘/DXY代理=美元强弱代理；相较上一次涨跌幅=本轮相对上一轮变化；评价=短线方向判断；建议=结合近几轮价格、GC量能、美元代理和历史记录后的操作倾向；空=本轮未获取到。";
}

export function buildDailyHeaderDescription() {
  return "说明：GC近月=COMEX黄金近月期货；GLD=黄金ETF价格与成交量；UUP=美元ETF，作为美元强弱代理；10年实际利率=黄金中线核心变量；建议=结合当前日频数据与历史变化给出的中线倾向；空=本轮未获取到。";
}

export function buildHighFrequencyAdvice(state, historyRows) {
  if (state.priceUsdPerOz === null) return "数据不足：本轮缺少核心金价，先等待 XAU/USD 恢复。";
  const recent = historyRows.slice(-3).filter((row) => Number.isFinite(row.priceUsdPerOz));
  const avgVolume = recent.length ? recent.reduce((sum, row) => sum + (row.gcFrontVolume || 0), 0) / recent.length : state.gcFrontVolume || 0;
  const avgDollar = recent.length ? recent.reduce((sum, row) => sum + (row.dollarProxyClose || 0), 0) / recent.length : (state.dollarProxyClose ?? 0);
  const positiveCount = recent.filter((row) => (row.changePct || 0) > 0).length + ((state.changePct || 0) > 0 ? 1 : 0);
  const negativeCount = recent.filter((row) => (row.changePct || 0) < 0).length + ((state.changePct || 0) < 0 ? 1 : 0);
  const volumeStrong = state.gcFrontVolume === null ? false : state.gcFrontVolume >= avgVolume;
  const dollarSoft = state.dollarProxyClose === null ? false : state.dollarProxyClose <= avgDollar;
  if (state.direction === "短线偏强" && positiveCount >= 2 && (volumeStrong || state.gcFrontVolume === null) && (dollarSoft || state.dollarProxyClose === null)) return "偏多观察：近几轮上涨占优，可优先等待回踩后的顺势机会。";
  if (state.direction === "短线偏弱" && negativeCount >= 2 && state.dollarProxyClose !== null && !dollarSoft) return "防守为主：近几轮走弱且美元代理偏硬，控制仓位。";
  if (state.missing?.length) return "谨慎跟踪：本轮存在缺失数据，参考价值下降，先小仓位观察。";
  return "观望等待确认：短线信号分化，等方向和量能进一步确认。";
}

export function buildDailyAdvice(dailyContext, dailyHistory) {
  if (dailyContext.gcFrontClose === null && dailyContext.realYield10Y === null && dailyContext.gldClose === null) return "中线数据不足：本轮日频变量缺失较多，暂不做中线倾向判断。";
  const previous = dailyHistory.at(-1) || null;
  const realYieldFalling = previous && dailyContext.realYield10Y !== null && previous.realYield10Y !== null ? dailyContext.realYield10Y <= previous.realYield10Y : dailyContext.realYield10Y !== null ? dailyContext.realYield10Y < 2 : null;
  const gldStable = previous && dailyContext.gldClose !== null && previous.gldClose !== null ? dailyContext.gldClose >= previous.gldClose : dailyContext.gldClose !== null ? dailyContext.gldClose > 0 : null;
  const dollarSoft = previous && dailyContext.dollarProxyClose !== null && previous.dollarProxyClose !== null ? dailyContext.dollarProxyClose <= previous.dollarProxyClose : dailyContext.dollarProxyClose !== null ? dailyContext.dollarProxyClose < 28 : null;
  if (realYieldFalling === true && gldStable !== false && dollarSoft !== false) return "中线偏多：利率和美元环境未明显压制黄金，可维持中线跟踪。";
  if (realYieldFalling === false && dollarSoft === false) return "中线谨慎：实际利率和美元代理都不友好，先控制节奏。";
  return "中线中性：资金面未形成单边优势，继续观察宏观变化。";
}

export function buildLatestAdviceText(highFrequencyAdvice, dailyAdvice, checkedAtLocal) {
  return `${checkedAtLocal}\n高频建议：${highFrequencyAdvice}\n日频建议：${dailyAdvice}`;
}

export async function readPreviousState() {
  try {
    return JSON.parse(stripBom(await readFile(STATE_FILE, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeOutputs(status, dailyContext) {
  await mkdir(STATE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await safeDeleteLegacyRecord();
  const highHistory = await readHighFrequencyHistory();
  const dailyHistory = await readDailyHistory();
  const highFrequencyAdvice = buildHighFrequencyAdvice(status, highHistory);
  const dailyAdvice = buildDailyAdvice(dailyContext, dailyHistory);
  const now = new Date();
  const checkedAtLocal = formatLocalDateTime(now);
  const latestAdvice = buildLatestAdviceText(highFrequencyAdvice, dailyAdvice, checkedAtLocal);
  const state = buildLatestState(status, dailyContext, highFrequencyAdvice, dailyAdvice, now, checkedAtLocal);
  await atomicWriteFile(STATE_FILE, withBom(JSON.stringify(state, null, 2) + "\n"));
  await appendStateHistory(HF_STATE_FILE, buildHighFrequencyStateRow(state));
  await upsertStateHistory(DAILY_STATE_FILE, dailyContext.date, buildDailyStateRow(dailyContext, dailyAdvice));
  await refreshCsvViews();
  await atomicWriteFile(LATEST_FILE, withBom(status.message + "\n"));
  await atomicWriteFile(HF_LATEST_FILE, withBom(`${buildHighFrequencyHeaderDescription()}\n${buildHighFrequencySummary(state)}\n`));
  await atomicWriteFile(DAILY_LATEST_FILE, withBom(`${buildDailyHeaderDescription()}\n${buildDailySummary(dailyContext, dailyAdvice)}\n`));
  await atomicWriteFile(ADVICE_LATEST_FILE, withBom(`${latestAdvice}\n`));
  await atomicWriteFile(SOURCE_DIAGNOSTICS_FILE, withBom(buildSourceDiagnosticsText(state)));
  if (status.isAlert) {
    await appendAlertRecord(state);
    await atomicWriteFile(ALERT_FILE, withBom(`${checkedAtLocal} ${status.message}\n`));
  }
}

async function safeDeleteLegacyRecord() { try { await rm(RECORD_FILE, { force: true }); } catch {} }
async function readHighFrequencyHistory() { try { return await readJsonLines(HF_STATE_FILE); } catch { return readHighFrequencyHistoryFromCsv(); } }
async function readDailyHistory() { try { return await readJsonLines(DAILY_STATE_FILE); } catch { return readDailyHistoryFromCsv(); } }

function buildLatestState(status, dailyContext, highFrequencyAdvice, dailyAdvice, now, checkedAtLocal) {
  return {
    checkedAt: now.toISOString(),
    checkedAtLocal,
    symbol: status.symbol,
    priceUsdPerOz: status.priceUsdPerOz,
    priceCnyPerGram: status.priceCnyPerGram,
    usdCnyRate: status.usdCnyRate,
    changePct: status.changePct,
    direction: status.direction,
    isAlert: status.isAlert,
    message: status.message,
    gcFrontClose: status.gcFrontClose,
    gcFrontVolume: status.gcFrontVolume,
    dollarProxyClose: status.dollarProxyClose,
    dollarProxyVolume: status.dollarProxyVolume,
    sourceSummary: sanitizeSourceSummary(status.sourceSummary),
    fetchDiagnostics: status.fetchDiagnostics,
    missing: status.missing,
    highFrequencyAdvice,
    dailyAdvice,
    dailyContext,
  };
}

async function refreshCsvViews() {
  const [highHistory, dailyHistory] = await Promise.all([readHighFrequencyHistory(), readDailyHistory()]);
  const snapshotSummary = [];
  snapshotSummary.push(`高频CSV：${await writeViewFile(HF_FILE, buildHighFrequencyCsv(highHistory), "high_frequency")}`);
  snapshotSummary.push(`日频CSV：${await writeViewFile(DAILY_FILE, buildDailyCsv(dailyHistory), "daily_context")}`);
  await atomicWriteFile(SNAPSHOT_INDEX_FILE, withBom(`${formatLocalDateTime(new Date())}\n${snapshotSummary.join("\n")}\n说明：如果主 CSV 正被 Excel 或编辑器占用，系统会继续写入 state 历史，并在 snapshots 目录生成新的可读快照。\n`));
}

async function writeViewFile(targetFile, content, prefix) {
  try {
    await atomicWriteFile(targetFile, withBom(content));
    return `${path.basename(targetFile)} 已刷新`;
  } catch (error) {
    if (!isRetriableFileError(error)) throw error;
    const snapshotFile = path.join(SNAPSHOT_DIR, `${prefix}_${formatCompactTimestamp(new Date())}.csv`);
    await atomicWriteFile(snapshotFile, withBom(content));
    return `${path.basename(targetFile)} 被占用，已写入 ${path.basename(snapshotFile)}`;
  }
}

async function appendAlertRecord(state) {
  await ensureCsvHeader(ALERT_RECORD_FILE, ALERT_HEADER);
  const line = [state.checkedAtLocal, formatMaybe(state.priceUsdPerOz, 2, ""), formatMaybe(state.priceCnyPerGram, 2, ""), formatMaybe(state.usdCnyRate, 4, ""), state.changePct === null ? "" : `${formatSigned(state.changePct)}%`, state.direction, state.message].map(escapeCsv).join(",");
  await retryFileOp(() => appendFile(ALERT_RECORD_FILE, `${line}\n`, "utf8"));
}

async function ensureCsvHeader(filePath, header) {
  try {
    const raw = await readFile(filePath, "utf8");
    const content = stripBom(raw);
    const lines = content.split(/\r?\n/).filter(Boolean);
    const normalizedHeader = header.trim();
    const validRows = lines.filter((line, index) => index > 0 && isValidCsvRow(line));
    if (!raw.startsWith(UTF8_BOM) || lines[0] !== normalizedHeader || validRows.length !== Math.max(0, lines.length - 1)) {
      await atomicWriteFile(filePath, withBom(`${normalizedHeader}\n${validRows.join("\n")}${validRows.length ? "\n" : ""}`));
    }
  } catch (error) {
    if (error?.code === "ENOENT") return atomicWriteFile(filePath, withBom(header));
    throw error;
  }
}

async function appendStateHistory(filePath, row, maxRows = MAX_HIGH_FREQUENCY_HISTORY_ROWS) {
  await retryFileOp(() => appendFile(filePath, `${JSON.stringify(row)}\n`, "utf8"));
  await compactJsonLineHistory(filePath, maxRows);
}
async function upsertStateHistory(filePath, key, row) {
  const rows = await readJsonLines(filePath);
  const filtered = rows.filter((item) => item.date !== key);
  filtered.push(row);
  filtered.sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const trimmed = filtered.slice(-MAX_DAILY_HISTORY_ROWS);
  await atomicWriteFile(filePath, `${trimmed.map((item) => JSON.stringify(item)).join("\n")}\n`);
}
async function readJsonLines(filePath) {
  try {
    const raw = stripBom(await readFile(filePath, "utf8"));
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const rows = [];
    let droppedLines = 0;
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch {
        droppedLines += 1;
      }
    }
    if (droppedLines > 0) {
      await atomicWriteFile(filePath, `${rows.map((item) => JSON.stringify(item)).join("\n")}${rows.length ? "\n" : ""}`);
    }
    return rows;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function compactJsonLineHistory(filePath, maxRows) {
  if (!Number.isFinite(maxRows) || maxRows <= 0) return;
  const rows = await readJsonLines(filePath);
  if (rows.length <= maxRows) return;
  const trimmed = rows.slice(-maxRows);
  await atomicWriteFile(filePath, `${trimmed.map((item) => JSON.stringify(item)).join("\n")}\n`);
}

async function readHighFrequencyHistoryFromCsv() {
  try {
    const rows = stripBom(await readFile(HF_FILE, "utf8")).split(/\r?\n/).filter((row) => HIGH_FREQUENCY_ROW_PATTERN.test(row));
    return rows.map(parseHighFrequencyCsvRow);
  } catch { return []; }
}

async function readDailyHistoryFromCsv() {
  try {
    const rows = stripBom(await readFile(DAILY_FILE, "utf8")).split(/\r?\n/).filter((row) => DAILY_ROW_PATTERN.test(row));
    return rows.map(parseDailyCsvRow);
  } catch { return []; }
}

function parseHighFrequencyCsvRow(row) {
  const parts = splitCsvLine(row);
  return {
    checkedAtLocal: parts[0],
    priceUsdPerOz: toNumberOrNull(parts[1]),
    priceCnyPerGram: toNumberOrNull(parts[2]),
    usdCnyRate: toNumberOrNull(parts[3]),
    gcFrontClose: toNumberOrNull(parts[4]),
    gcFrontVolume: toNumberOrNull(parts[5]),
    dollarProxyClose: toNumberOrNull(parts[6]),
    dollarProxyVolume: null,
    changePct: parts[8] ? toNumberOrNull(String(parts[8]).replace("%", "")) : null,
    direction: parts[9] || "数据不足",
    highFrequencyAdvice: parts[10] ?? "",
  };
}

function parseDailyCsvRow(row) {
  const parts = splitCsvLine(row);
  return {
    date: parts[0],
    gcFrontClose: toNumberOrNull(parts[1]),
    gcFrontVolume: toNumberOrNull(parts[2]),
    gldClose: toNumberOrNull(parts[3]),
    gldVolume: toNumberOrNull(parts[4]),
    dollarProxyClose: toNumberOrNull(parts[5]),
    dollarProxyVolume: toNumberOrNull(parts[6]),
    realYield10Y: toNumberOrNull(parts[7]),
    commentary: parts[8] ?? "",
    dailyAdvice: parts[9] ?? "",
  };
}

function buildHighFrequencyStateRow(state) {
  return {
    checkedAt: state.checkedAt,
    checkedAtLocal: state.checkedAtLocal,
    priceUsdPerOz: state.priceUsdPerOz,
    priceCnyPerGram: state.priceCnyPerGram,
    usdCnyRate: state.usdCnyRate,
    gcFrontClose: state.gcFrontClose,
    gcFrontVolume: state.gcFrontVolume,
    dollarProxyClose: state.dollarProxyClose,
    dollarProxyVolume: state.dollarProxyVolume,
    changePct: state.changePct,
    direction: state.direction,
    highFrequencyAdvice: state.highFrequencyAdvice,
    missing: state.missing,
  };
}

function buildDailyStateRow(dailyContext, dailyAdvice) {
  return {
    date: dailyContext.date,
    gcFrontClose: dailyContext.gcFrontClose,
    gcFrontVolume: dailyContext.gcFrontVolume,
    gldClose: dailyContext.gldClose,
    gldVolume: dailyContext.gldVolume,
    dollarProxyClose: dailyContext.dollarProxyClose,
    dollarProxyVolume: dailyContext.dollarProxyVolume,
    realYield10Y: dailyContext.realYield10Y,
    commentary: dailyContext.commentary,
    dailyAdvice,
  };
}

function buildHighFrequencyCsvRow(row) {
  return [
    row.checkedAtLocal,
    formatMaybe(row.priceUsdPerOz, 2, ""),
    formatMaybe(row.priceCnyPerGram, 2, ""),
    formatMaybe(row.usdCnyRate, 4, ""),
    formatMaybe(row.gcFrontClose, 2, ""),
    formatMaybe(row.gcFrontVolume, 0, ""),
    formatMaybe(row.dollarProxyClose, 2, ""),
    formatMaybe(row.dollarProxyClose, 2, ""),
    row.changePct === null ? "" : `${formatSigned(Number(row.changePct))}%`,
    row.direction || "数据不足",
    escapeCsv(row.highFrequencyAdvice ?? ""),
  ].join(",");
}

function buildDailyCsvRow(row) {
  return [
    row.date,
    formatMaybe(row.gcFrontClose, 2, ""),
    formatMaybe(row.gcFrontVolume, 0, ""),
    formatMaybe(row.gldClose, 2, ""),
    formatMaybe(row.gldVolume, 0, ""),
    formatMaybe(row.dollarProxyClose, 2, ""),
    formatMaybe(row.dollarProxyVolume, 0, ""),
    formatMaybe(row.realYield10Y, 2, ""),
    escapeCsv(row.commentary ?? ""),
    escapeCsv(row.dailyAdvice ?? ""),
  ].join(",");
}

function buildCsvDocument(description, header, rows, rowBuilder) {
  const dataRows = rows.map(rowBuilder);
  return `${description}\n${header.trim()}\n${dataRows.join("\n")}${dataRows.length ? "\n" : ""}`;
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

function buildHighFrequencyCsv(rows) {
  return buildCsvDocument(buildHighFrequencyHeaderDescription(), HF_HEADER, rows, buildHighFrequencyCsvRow);
}

function buildDailyCsv(rows) {
  return buildCsvDocument(buildDailyHeaderDescription(), DAILY_HEADER, rows, buildDailyCsvRow);
}

function isValidCsvRow(line) { return !line.includes("�") && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?,/.test(line); }
function escapeCsv(value) { const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function buildHighFrequencySummary(state) { return `${state.checkedAtLocal} | XAU/USD ${formatMaybe(state.priceUsdPerOz, 2, "空")} | RMB/g ${formatMaybe(state.priceCnyPerGram, 2, "空")} | USD/CNY ${formatMaybe(state.usdCnyRate, 4, "空")} | GC近月 ${formatMaybe(state.gcFrontClose, 2, "空")}(${formatMaybe(state.gcFrontVolume, 0, "空")}) | DXY代理 ${formatMaybe(state.dollarProxyClose, 2, "空")} | ${state.direction} | 建议 ${state.highFrequencyAdvice}`; }
function buildDailySummary(dailyContext, dailyAdvice) { return `${dailyContext.date} | GC ${formatMaybe(dailyContext.gcFrontClose, 2, "空")}(${formatMaybe(dailyContext.gcFrontVolume, 0, "空")}) | GLD ${formatMaybe(dailyContext.gldClose, 2, "空")}(${formatMaybe(dailyContext.gldVolume, 0, "空")}) | UUP ${formatMaybe(dailyContext.dollarProxyClose, 2, "空")}(${formatMaybe(dailyContext.dollarProxyVolume, 0, "空")}) | 10Y实际利率 ${formatMaybe(dailyContext.realYield10Y, 2, "空")}${dailyContext.realYield10Y === null ? "" : "%"} | ${dailyContext.commentary} | 建议 ${dailyAdvice}`; }
function buildSourceDiagnosticsText(state) {
  const lines = [
    `检查时间：${state.checkedAtLocal}`,
    `XAU/USD 来源：${formatSourceLabel(state.sourceSummary?.gold)}`,
    `USD/CNY 来源：${formatSourceLabel(state.sourceSummary?.fx)}`,
    `GC近月 来源：${formatSourceLabel(state.sourceSummary?.gc)}`,
    `GLD 来源：${formatSourceLabel(state.sourceSummary?.gld)}`,
    `UUP/DXY代理 来源：${formatSourceLabel(state.sourceSummary?.dxy)}`,
    `10年实际利率 来源：${formatSourceLabel(state.sourceSummary?.realYield)}`,
  ];
  const fallbackDetails = buildFallbackDetails(state.fetchDiagnostics);
  if (fallbackDetails.length) {
    lines.push("");
    lines.push("回退记录：");
    lines.push(...fallbackDetails);
  }
  return `${lines.join("\n")}\n`;
}
function buildFallbackDetails(fetchDiagnostics) {
  return Object.entries(fetchDiagnostics || {})
    .filter(([, errors]) => Array.isArray(errors) && errors.length)
    .flatMap(([label, errors]) => errors.map((item) => `${label}: ${item}`));
}
function sanitizeSourceSummary(summary) {
  return Object.fromEntries(
    Object.entries(summary || {}).map(([label, item]) => [
      label,
      item
        ? {
            source: item.source || null,
            symbol: item.symbol || null,
            volumeFilledBy: item.volumeFilledBy || null,
            valueFilledBy: item.valueFilledBy || null,
          }
        : null,
    ]),
  );
}
function formatSourceLabel(sourceSummary) {
  if (!sourceSummary?.source) return "空";
  const extras = [];
  if (sourceSummary.symbol) extras.push(sourceSummary.symbol);
  if (sourceSummary.volumeFilledBy) extras.push(`成交量补自 ${sourceSummary.volumeFilledBy}`);
  if (sourceSummary.valueFilledBy) extras.push(`数值补自 ${sourceSummary.valueFilledBy}`);
  return extras.length ? `${sourceSummary.source} (${extras.join("，")})` : sourceSummary.source;
}

export async function fetchStooqQuote(symbol, fetchImpl = fetch) {
  return fetchTextResource(
    `https://stooq.com/q/l/?s=${symbol}&i=1`,
    {
      headers: { "user-agent": "codex-gold-monitor/1.0", accept: "text/plain,text/csv;q=0.9,*/*;q=0.8" },
      parse: parseStooqCsv,
      errorLabel: `拉取 ${symbol} 行情失败`,
    },
    fetchImpl,
  );
}

export async function fetchSinaQuote(symbols, fetchImpl = fetch) {
  const errors = [];
  for (const symbol of symbols) {
    try {
      return await fetchTextResource(
        `https://hq.sinajs.cn/list=${encodeURIComponent(symbol)}`,
        {
          headers: { "user-agent": "codex-gold-monitor/1.0", referer: "https://finance.sina.com.cn", accept: "text/plain,*/*" },
          parse: parseSinaHqText,
          errorLabel: `拉取新浪 ${symbol} 失败`,
        },
        fetchImpl,
      );
    } catch (error) { errors.push(error.message); }
  }
  throw new Error(errors.join(" | "));
}

export async function fetchYahooQuote(symbol, fetchImpl = fetch) {
  return fetchJsonResource(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    {
      headers: { "user-agent": "codex-gold-monitor/1.0", accept: "application/json,text/plain,*/*" },
      parse: parseYahooChart,
      errorLabel: `拉取 ${symbol} 图表失败`,
    },
    fetchImpl,
  );
}

export async function fetchGoldApiQuote(symbol, fetchImpl = fetch) {
  return fetchJsonResource(
    `https://api.gold-api.com/price/${encodeURIComponent(symbol)}`,
    {
      headers: { "user-agent": "codex-gold-monitor/1.0", accept: "application/json,text/plain,*/*" },
      parse: parseGoldApiJson,
      errorLabel: `拉取 Gold-API ${symbol} 失败`,
    },
    fetchImpl,
  );
}

export async function fetchEastmoneyFuturesQuote(quoteCode, fetchImpl = fetch) {
  const fields = [
    "name", "sc", "dm", "p", "zsjd", "zdf", "zde", "utime", "o", "zjsj",
    "qrspj", "h", "l", "mrj", "mcj", "vol", "cclbh", "zt", "dt", "np",
    "wp", "ccl", "rz", "cje", "mcl", "mrl", "jjsj", "j", "lb", "zf",
  ].join(",");
  const url = `https://futsseapi.eastmoney.com/static/${encodeURIComponent(quoteCode)}_qt?field=${fields}&token=1101ffec61617c99be287c1bec3085ff`;
  return fetchJsonResource(
    url,
    {
      headers: { "user-agent": "codex-gold-monitor/1.0", referer: "https://quote.eastmoney.com/", accept: "application/json,text/plain,*/*" },
      parse: parseEastmoneyFuturesQtJson,
      errorLabel: `拉取东方财富 ${quoteCode} 失败`,
    },
    fetchImpl,
  );
}

export async function fetchEastmoneyStockQuote(secid, fetchImpl = fetch) {
  const fields = ["f43", "f44", "f45", "f46", "f47", "f48", "f57", "f58", "f59", "f60", "f152", "f169", "f170"].join(",");
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=${fields}&invt=2&fltt=1&ut=fa5fd1943c7b386f172d6893dbfba10b`;
  return fetchJsonResource(
    url,
    {
      headers: { "user-agent": "codex-gold-monitor/1.0", referer: "https://quote.eastmoney.com/", accept: "application/json,text/plain,*/*" },
      parse: parseEastmoneyStockQuoteJson,
      errorLabel: `拉取东方财富 ${secid} 失败`,
    },
    fetchImpl,
  );
}

export async function fetchFredSeries(seriesId, fetchImpl = fetch) {
  return fetchTextResource(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`,
    {
      headers: { "user-agent": "codex-gold-monitor/1.0", accept: "text/csv,text/plain,*/*" },
      parse: parseFredCsv,
      errorLabel: `拉取 ${seriesId} 失败`,
    },
    fetchImpl,
  );
}

export async function fetchTreasuryRealYield(url, fetchImpl = fetch) {
  return fetchTextResource(
    url,
    {
      headers: { "user-agent": "codex-gold-monitor/1.0", accept: "text/csv,text/plain,*/*" },
      parse: parseTreasuryRealYieldCsv,
      errorLabel: "拉取 Treasury 实际利率失败",
    },
    fetchImpl,
  );
}

async function fetchTextResource(url, options, fetchImpl) {
  return fetchResource(
    url,
    {
      ...options,
      reader: (response) => response.text(),
    },
    fetchImpl,
  );
}

async function fetchJsonResource(url, options, fetchImpl) {
  return fetchResource(
    url,
    {
      ...options,
      reader: (response) => response.json(),
    },
    fetchImpl,
  );
}

async function fetchResource(url, { headers, parse, reader, errorLabel }, fetchImpl) {
  return retryFetch(async () => {
    const payload = await requestWithTimeout(url, { headers }, fetchImpl, reader);
    return parse(payload);
  }, errorLabel);
}

async function requestWithTimeout(url, options, fetchImpl, reader) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }
    return reader(response);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveFirstSuccessful(label, tasks) {
  const errors = [];
  for (const task of tasks) {
    try {
      const value = await task();
      if (value) return { value, errors };
    } catch (error) { errors.push(`${label}:${error.message}`); }
  }
  return { value: null, errors };
}

export function mergeSourceValue(primary, fallback) {
  if (!primary) return fallback ?? null;
  if (!fallback) return primary;
  return {
    ...fallback,
    ...primary,
    open: Number.isFinite(primary.open) ? primary.open : fallback.open ?? null,
    high: Number.isFinite(primary.high) ? primary.high : fallback.high ?? null,
    low: Number.isFinite(primary.low) ? primary.low : fallback.low ?? null,
    close: Number.isFinite(primary.close) ? primary.close : fallback.close ?? null,
    volume: Number.isFinite(primary.volume) ? primary.volume : fallback.volume ?? null,
    date: primary.date || fallback.date || null,
    value: Number.isFinite(primary.value) ? primary.value : fallback.value ?? null,
    source: primary.source || fallback.source || null,
  };
}

function isCompleteSourceValue(value, options = {}) {
  if (!value) return false;
  if (options.needDateValue) {
    return Boolean(value.date) && Number.isFinite(value.value);
  }
  if (!Number.isFinite(value.close)) {
    return false;
  }
  if (options.needVolume) {
    return Number.isFinite(value.volume);
  }
  return true;
}

export async function resolveMergedSources(label, tasks, options = {}) {
  const errors = [];
  let value = null;
  let sourceSummary = null;
  for (const task of tasks) {
    try {
      const candidate = await task();
      sourceSummary = mergeSourceSummary(sourceSummary, candidate);
      value = mergeSourceValue(value, candidate);
      if (isCompleteSourceValue(value, options)) {
        return { value, errors, sourceSummary };
      }
    } catch (error) {
      errors.push(`${label}:${error.message}`);
    }
  }
  return { value, errors, sourceSummary };
}

function mergeSourceSummary(summary, candidate) {
  if (!candidate) return summary;
  const candidateHasValue = Number.isFinite(candidate.close) || Number.isFinite(candidate.value);
  if (!summary) {
    return {
      source: candidate.source || null,
      symbol: candidate.symbol || null,
      hasVolume: Number.isFinite(candidate.volume),
      hasValue: candidateHasValue,
      volumeFilledBy: null,
      valueFilledBy: null,
    };
  }
  return {
    source: summary.source || candidate.source || null,
    symbol: summary.symbol || candidate.symbol || null,
    hasVolume: summary.hasVolume || Number.isFinite(candidate.volume),
    hasValue: summary.hasValue || candidateHasValue,
    volumeFilledBy: summary.volumeFilledBy || (!summary.hasVolume && Number.isFinite(candidate.volume) ? candidate.source || null : null),
    valueFilledBy: summary.valueFilledBy || (!summary.hasValue && candidateHasValue && candidate.source !== summary.source ? candidate.source || null : null),
  };
}

export async function run(fetchImpl = fetch) {
  const config = await loadConfig();
  const previousState = await readPreviousState();
  const [goldResult, fxResult, gcResult, gldResult, dollarResult, realYieldResult] = await Promise.all([
    resolveMergedSources("gold", [
      () => fetchSinaQuote(config.dataSource.cnGoldSymbols, fetchImpl),
      () => fetchGoldApiQuote(config.dataSource.goldApiSymbol, fetchImpl),
      () => fetchStooqQuote(config.dataSource.goldSymbol, fetchImpl),
    ]),
    resolveMergedSources("fx", [
      () => fetchSinaQuote(config.dataSource.cnFxSymbols, fetchImpl),
      () => fetchYahooQuote(config.dataSource.yahooFxSymbol, fetchImpl),
      () => fetchStooqQuote(config.dataSource.fxSymbol, fetchImpl),
    ]),
    resolveMergedSources("gc", [
      () => fetchEastmoneyFuturesQuote(config.dataSource.eastmoneyGcQuoteCode, fetchImpl),
      () => fetchSinaQuote(config.dataSource.cnGoldFuturesSymbols, fetchImpl),
      () => fetchYahooQuote(config.dataSource.goldFuturesSymbol, fetchImpl),
    ], { needVolume: true }),
    resolveMergedSources("gld", [
      () => fetchEastmoneyStockQuote(config.dataSource.eastmoneyGldSecid, fetchImpl),
      () => fetchYahooQuote(config.dataSource.goldEtfSymbol, fetchImpl),
      () => fetchStooqQuote(config.dataSource.stooqGldSymbol, fetchImpl),
    ], { needVolume: true }),
    resolveMergedSources("dxy", [
      () => fetchEastmoneyStockQuote(config.dataSource.eastmoneyDollarProxySecid, fetchImpl),
      () => fetchYahooQuote(config.dataSource.dollarProxySymbol, fetchImpl),
      () => fetchStooqQuote(config.dataSource.stooqDollarProxySymbol, fetchImpl),
    ], { needVolume: true }),
    resolveMergedSources("realYield", [
      () => fetchTreasuryRealYield(config.dataSource.treasuryRealYieldUrl, fetchImpl),
      () => fetchFredSeries(config.dataSource.realYieldFredSeries, fetchImpl),
    ], { needDateValue: true }),
  ]);
  const fetchDiagnostics = { gold: goldResult.errors, fx: fxResult.errors, gc: gcResult.errors, gld: gldResult.errors, dxy: dollarResult.errors, realYield: realYieldResult.errors };
  const status = buildStatus(
    goldResult.value,
    fxResult.value,
    gcResult.value,
    dollarResult.value,
    previousState,
    config,
    fetchDiagnostics,
    {
      gold: goldResult.sourceSummary,
      fx: fxResult.sourceSummary,
      gc: gcResult.sourceSummary,
      gld: gldResult.sourceSummary,
      dxy: dollarResult.sourceSummary,
      realYield: realYieldResult.sourceSummary,
    },
  );
  const dailyContext = buildDailyContext(gcResult.value, gldResult.value, dollarResult.value, realYieldResult.value);
  await writeOutputs(status, dailyContext);
  return { ...status, dailyContext };
}

async function retryFetch(operation, label) {
  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
    try { return await operation(); } catch (error) { lastError = error; if (attempt === FETCH_RETRY_DELAYS_MS.length) break; await sleep(FETCH_RETRY_DELAYS_MS[attempt]); }
  }
  throw new Error(`${label}: ${lastError?.message || lastError}`);
}

async function retryFileOp(operation) {
  let lastError = null;
  for (let attempt = 0; attempt <= FILE_RETRY_DELAYS_MS.length; attempt += 1) {
    try { return await operation(); } catch (error) { lastError = error; if (!isRetriableFileError(error) || attempt === FILE_RETRY_DELAYS_MS.length) break; await sleep(FILE_RETRY_DELAYS_MS[attempt]); }
  }
  throw lastError;
}

function isRetriableFileError(error) { return ["EBUSY", "EPERM", "EMFILE", "ENFILE", "EACCES"].includes(error?.code); }
async function atomicWriteFile(filePath, content) {
  const tempFile = `${filePath}.tmp`;
  await retryFileOp(() => writeFile(tempFile, content, "utf8"));
  await retryFileOp(async () => {
    try { await rename(tempFile, filePath); } catch (error) { if (["EEXIST", "EPERM"].includes(error?.code)) { await rm(filePath, { force: true }); await rename(tempFile, filePath); return; } throw error; }
  });
}
function formatCompactTimestamp(date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); const hours = String(date.getHours()).padStart(2, "0"); const minutes = String(date.getMinutes()).padStart(2, "0"); const seconds = String(date.getSeconds()).padStart(2, "0"); return `${year}${month}${day}_${hours}${minutes}${seconds}`; }
function formatLocalDate(date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function formatLocalDateTime(date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); const hours = String(date.getHours()).padStart(2, "0"); const minutes = String(date.getMinutes()).padStart(2, "0"); const seconds = String(date.getSeconds()).padStart(2, "0"); return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`; }
function round2(value) { return Math.round(value * 100) / 100; }
function round4(value) { return Math.round(value * 10000) / 10000; }
function formatSigned(value) { return `${value > 0 ? "+" : ""}${value.toFixed(2)}`; }
function withBom(text) { return `${UTF8_BOM}${text}`; }
function stripBom(text) { return text.replace(/^\uFEFF/, ""); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function toNumberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function formatMaybe(value, digits, fallback) { return Number.isFinite(value) ? Number(value).toFixed(digits) : fallback; }

if (process.argv[1] === __filename) {
  run().then((status) => { process.stdout.write(status.message + "\n"); }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

