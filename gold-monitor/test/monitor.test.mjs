import assert from "node:assert/strict";

import {
  buildDailyAdvice,
  buildDailyContext,
  buildHighFrequencyAdvice,
  buildStatus,
  buildLatestAdviceText,
  convertUsdPerOzToCnyPerGram,
  parseEastmoneyFuturesQtJson,
  parseEastmoneyStockQuoteJson,
  parseGoldApiJson,
  parseTreasuryRealYieldCsv,
  getShortTermDirection,
  mergeSourceValue,
  normalizeConfig,
  parseFredCsv,
  parseSinaHqText,
  parseStooqCsv,
  parseYahooChart,
  resolveFirstSuccessful,
  resolveMergedSources,
} from "../src/monitor.mjs";

const tests = [
  () => {
    const quote = parseStooqCsv("XAUUSD,20260306,095832,5086.57,5142.695,5067.035,5108.165,,");
    assert.equal(quote.symbol, "XAUUSD");
    assert.equal(quote.open, 5086.57);
    assert.equal(quote.close, 5108.165);
  },
  () => {
    const quote = parseStooqCsv("GLD.US,20260309,143040,468.08,468.21,467.8,468.21,22508,");
    assert.equal(quote.volume, 22508);
  },
  () => {
    const quote = parseSinaHqText('var hq_str_hf_XAU="3330.1,3331.2,3338.8,3328.4";');
    assert.equal(quote.symbol, "hf_XAU");
    assert.equal(quote.close, 3330.1);
  },
  () => {
    const quote = parseSinaHqText('var hq_str_hf_XAU="5081.28,5171.060,5081.28,5081.52,5192.04,5014.77,21:49:00,5171.06,5190.38,0,0,0,2026-03-09,伦敦金现货黄金";');
    assert.equal(quote.close, 5081.28);
    assert.equal(quote.open, 5081.28);
    assert.equal(quote.high, 5192.04);
    assert.equal(quote.low, 5014.77);
  },
  () => {
    const quote = parseGoldApiJson({ symbol: "XAU", price: 5077.799805 });
    assert.equal(quote.close, 5077.799805);
  },
  () => {
    const quote = parseEastmoneyFuturesQtJson({ qt: { dm: "GC00Y", p: 5088.6, o: 5186.7, h: 5210.4, l: 5021.2, vol: 114982 } });
    assert.equal(quote.symbol, "GC00Y");
    assert.equal(quote.close, 5088.6);
    assert.equal(quote.volume, 114982);
  },
  () => {
    const quote = parseEastmoneyStockQuoteJson({ data: { f57: "GLD", f59: 3, f43: 467900, f44: 469580, f45: 464790, f46: 467880, f47: 3431944 } });
    assert.equal(quote.symbol, "GLD");
    assert.equal(quote.close, 467.9);
    assert.equal(quote.high, 469.58);
    assert.equal(quote.volume, 3431944);
  },
  () => {
    const config = normalizeConfig({ thresholds: { upperUsd: 3333, lowerUsd: 2888 }, schedule: { intervalMinutes: 7 }, dataSource: { cnGoldSymbols: ["hf_XAU"] } });
    assert.equal(config.thresholds.upperUsd, 3333);
    assert.equal(config.thresholds.lowerUsd, 2888);
    assert.equal(config.schedule.intervalMinutes, 7);
    assert.equal(config.dataSource.cnGoldSymbols[0], "hf_XAU");
    assert.equal(config.dataSource.goldApiSymbol, "XAU");
    assert.equal(config.dataSource.eastmoneyGcQuoteCode, "101_GC00Y");
    assert.equal(config.dataSource.eastmoneyGldSecid, "107.GLD");
    assert.equal(config.dataSource.eastmoneyDollarProxySecid, "107.UUP");
  },
  () => {
    assert.equal(convertUsdPerOzToCnyPerGram(3005.4, 7.19), 694.74);
  },
  () => {
    const direction = getShortTermDirection({ open: 3000, close: 3012 }, { priceUsdPerOz: 3005 });
    assert.equal(direction, "短线偏强");
  },
  () => {
    const yahoo = parseYahooChart({ chart: { result: [{ indicators: { quote: [{ close: [10, 11], volume: [100, 200] }] }, meta: { symbol: "GC=F" } }] } });
    assert.equal(yahoo.close, 11);
    assert.equal(yahoo.volume, 200);
  },
  () => {
    const fred = parseFredCsv("DATE,FII10\n2026-03-05,1.85\n2026-03-06,1.82\n");
    assert.equal(fred.date, "2026-03-06");
    assert.equal(fred.value, 1.82);
  },
  () => {
    const treasury = parseTreasuryRealYieldCsv('Date,"5 YR","7 YR","10 YR"\n03/06/2026,1.16,1.49,1.80\n');
    assert.equal(treasury.date, "2026-03-06");
    assert.equal(treasury.value, 1.8);
  },
  () => {
    const status = buildStatus(
      { source: "Stooq", symbol: "XAUUSD", open: 2990, high: 3020, low: 2980, close: 3005.4 },
      { source: "Stooq", symbol: "USDCNY", open: 7.18, high: 7.2, low: 7.17, close: 7.19 },
      { close: 3004.2, volume: 51031 },
      { close: 27.47, volume: 3315900 },
      { priceUsdPerOz: 2998 },
      normalizeConfig({ thresholds: { upperUsd: 3100, lowerUsd: 2900 } }),
    );
    assert.equal(status.isAlert, false);
    assert.equal(status.gcFrontVolume, 51031);
    assert.equal(status.dollarProxyClose, 27.47);
  },
  () => {
    const partial = buildStatus(null, { source: "Sina", close: 7.2 }, null, null, { priceUsdPerOz: 3000 }, normalizeConfig({}), { gold: ["failed"] });
    assert.equal(partial.priceUsdPerOz, null);
    assert.match(partial.message, /空/);
    assert.match(partial.message, /回退已启用/);
  },
  () => {
    const advice = buildHighFrequencyAdvice(
      { direction: "短线偏强", changePct: 0.18, gcFrontVolume: 52000, dollarProxyClose: 27.1, priceUsdPerOz: 3002, missing: [] },
      [
        { changePct: 0.11, gcFrontVolume: 50000, dollarProxyClose: 27.3, priceUsdPerOz: 2998 },
        { changePct: 0.06, gcFrontVolume: 49000, dollarProxyClose: 27.4, priceUsdPerOz: 2999 },
      ],
    );
    assert.match(advice, /偏多/);
  },
  () => {
    const daily = buildDailyContext(
      { close: 3004.2, volume: 51031 },
      { close: 473.51, volume: 10453800 },
      { close: 27.47, volume: 3315900 },
      { date: "2026-03-06", value: 1.82 },
    );
    const advice = buildDailyAdvice(daily, [{ realYield10Y: 1.9, gldClose: 470, dollarProxyClose: 27.8 }]);
    assert.match(advice, /中线/);
  },
  () => {
    const text = buildLatestAdviceText("高频建议", "日频建议", "2026-03-09 13:50:00");
    assert.match(text, /高频建议/);
    assert.match(text, /日频建议/);
  },
  async () => {
    const result = await resolveFirstSuccessful("gold", [
      async () => { throw new Error("a"); },
      async () => ({ close: 1 }),
    ]);
    assert.equal(result.value.close, 1);
    assert.equal(result.errors.length, 1);
  },
  async () => {
    const order = [];
    const result = await resolveFirstSuccessful("gold", [
      async () => { order.push("cn"); throw new Error("cn down"); },
      async () => { order.push("backup"); return { close: 2 }; },
      async () => { order.push("late"); return { close: 3 }; },
    ]);
    assert.equal(result.value.close, 2);
    assert.deepEqual(order, ["cn", "backup"]);
  },
  () => {
    const merged = mergeSourceValue(
      { source: "Sina", close: 5080.1, open: 5079.5, volume: null },
      { source: "Yahoo", close: 5080.2, open: 5079.6, volume: 12345 },
    );
    assert.equal(merged.close, 5080.1);
    assert.equal(merged.volume, 12345);
  },
  async () => {
    const order = [];
    const result = await resolveMergedSources("gc", [
      async () => { order.push("cn"); return { source: "Sina", close: 5080.1, open: 5079.5, volume: null }; },
      async () => { order.push("yahoo"); return { source: "Yahoo", close: 5080.2, open: 5079.6, volume: 12345 }; },
    ], { needVolume: true });
    assert.equal(result.value.close, 5080.1);
    assert.equal(result.value.volume, 12345);
    assert.equal(result.sourceSummary.source, "Sina");
    assert.equal(result.sourceSummary.volumeFilledBy, "Yahoo");
    assert.deepEqual(order, ["cn", "yahoo"]);
  },
  async () => {
    const result = await resolveMergedSources("realYield", [
      async () => ({ source: "Primary", date: null, value: null }),
      async () => ({ source: "Backup", date: "2026-03-06", value: 1.8 }),
    ], { needDateValue: true });
    assert.equal(result.value.date, "2026-03-06");
    assert.equal(result.sourceSummary.source, "Primary");
    assert.equal(result.sourceSummary.valueFilledBy, "Backup");
  },
];

for (const [index, run] of tests.entries()) {
  await run();
  console.log(`ok ${index + 1}`);
}

console.log(`passed ${tests.length}`);
