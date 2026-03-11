const RANGE_PRESETS = ["1D", "2D", "1M", "2M", "1Y", "5Y", "All"];
const PRICE_RANGE_PRESETS = ["1H", "2H", "4H", "6H", "12H", ...RANGE_PRESETS];
const REQUEST_TIMEOUT_MS = 8000;
const BACKGROUND_POLL_INTERVAL_MS = 30000;
const ERROR_POLL_INTERVAL_MS = 15000;
const MAX_ERROR_POLL_INTERVAL_MS = 60000;
const STATE = {
  chartTooltip: null,
  glossaryTooltip: null,
  lastPayload: null,
  pollTimer: null,
  pollIntervalMs: 5000,
  refreshController: null,
  refreshInFlight: false,
  refreshErrorStreak: 0,
  windows: new Map(),
};

const THEME = {
  axis: "#93a7bf",
  grid: "rgba(237, 244, 255, 0.1)",
  crosshair: "rgba(237, 244, 255, 0.35)",
};

const KPI_GLOSSARY = {
  "最新数据时间": ["最新数据时间", "最近一条实时监控数据的生成时间，用来判断当前面板看到的数据是否新鲜。"],
  "XAU/USD": ["XAU/USD", "国际现货黄金兑美元价格，是观察黄金主趋势的核心变量。"],
  "人民币金价": ["人民币金价", "按美元金价和 USD/CNY 换算后的人民币金价，更接近国内视角。"],
  "USD/CNY": ["USD/CNY", "美元兑人民币汇率，会直接影响人民币计价黄金的表现。"],
  "GC近月成交量": ["GC近月成交量", "上方实时卡显示监测源返回的盘中累计量；下方成交量图统一使用5分钟区间成交量，用来观察资金参与度和行情强弱。"],
  "美国10年实际利率": ["美国10年实际利率", "衡量持有黄金机会成本的重要变量，通常与黄金偏负相关。"],
};

const el = {
  generatedAt: qs("#generated-at"),
  latestTime: qs("#latest-time"),
  heroSubtitle: qs("#hero-subtitle"),
  panelStatus: qs("#panel-status"),
  monitorStatus: qs("#monitor-status"),
  kpiGrid: qs("#kpi-grid"),
  priceRange: qs("#price-range"),
  priceTitleTerm: qs("#price-title-term"),
  fxRange: qs("#fx-range"),
  fxTitleTerm: qs("#fx-title-term"),
  macroRange: qs("#macro-range"),
  macroTitleTerm: qs("#macro-title-term"),
  volumeRange: qs("#volume-range"),
  volumeTitleTerm: qs("#volume-title-term"),
  dailyGldRange: qs("#daily-gld-range"),
  dailyGldTitleTerm: qs("#daily-gld-title-term"),
  dailyRealRange: qs("#daily-real-range"),
  dailyRealTitleTerm: qs("#daily-real-title-term"),
  dailyUupRange: qs("#daily-uup-range"),
  dailyUupTitleTerm: qs("#daily-uup-title-term"),
  direction: qs("#direction-text"),
  hfAdvice: qs("#hf-advice"),
  dailyAdvice: qs("#daily-advice"),
  message: qs("#message-text"),
  priceChart: qs("#price-chart"),
  fxChart: qs("#fx-chart"),
  macroChart: qs("#macro-chart"),
  volumeChart: qs("#volume-chart"),
  dailyGldChart: qs("#daily-gld-chart"),
  dailyRealChart: qs("#daily-real-chart"),
  dailyUupChart: qs("#daily-uup-chart"),
};

init();

function qs(selector) {
  return document.querySelector(selector);
}

async function init() {
  STATE.chartTooltip = createTooltip("chart-tooltip");
  STATE.glossaryTooltip = createTooltip("glossary-tooltip");
  setupGlossaryTooltips();
  setupToolbars();
  setupAutoRefresh();
  await refresh();
}

async function refresh() {
  if (STATE.refreshInFlight) return;
  STATE.refreshInFlight = true;
  clearTimeout(STATE.pollTimer);
  if (STATE.refreshController) STATE.refreshController.abort();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  STATE.refreshController = controller;
  try {
    el.panelStatus.textContent = "更新中";
    const response = await fetch(`/api/dashboard?ts=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    STATE.lastPayload = await response.json();
    render();
    STATE.pollIntervalMs = STATE.lastPayload.meta?.pollIntervalMs || 5000;
    STATE.refreshErrorStreak = 0;
  } catch (error) {
    STATE.refreshErrorStreak += 1;
    const message = error?.name === "AbortError" ? "请求超时" : error.message;
    el.panelStatus.textContent = STATE.lastPayload ? `${buildPanelStatus(STATE.lastPayload.meta)} / 接口异常` : `异常: ${message}`;
    if (STATE.lastPayload) {
      el.monitorStatus.textContent = buildMonitorStatus(STATE.lastPayload.meta);
    }
  } finally {
    window.clearTimeout(timeoutId);
    STATE.refreshController = null;
    STATE.refreshInFlight = false;
    scheduleNextRefresh();
  }
}

function setupToolbars() {
  document.querySelectorAll(".chart-toolbar").forEach((toolbar) => {
    const chartId = toolbar.getAttribute("data-chart");
    const presets = getRangePresets(chartId);
    toolbar.innerHTML = [
      ...presets.map((range) => `<button class="chart-btn" data-chart-id="${chartId}" data-action="range" data-range="${range}">${range}</button>`),
      `<button class="chart-btn" data-chart-id="${chartId}" data-action="reset">重置缩放</button>`,
    ].join("");
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".chart-btn");
    if (!button || !STATE.lastPayload) return;
    const chart = document.getElementById(button.getAttribute("data-chart-id"));
    if (!chart) return;
    if (button.getAttribute("data-action") === "reset") {
      resetWindow(chart);
    } else {
      applyPreset(chart, button.getAttribute("data-range"));
    }
    render();
  });
}

function setupGlossaryTooltips() {
  document.addEventListener("mouseover", (event) => {
    const target = event.target.closest(".glossary-term");
    if (!target) return;
    showTooltip(
      STATE.glossaryTooltip,
      event.clientX,
      event.clientY,
      `
        <div class="glossary-tooltip-title">${escapeHtml(target.dataset.termTitle || target.textContent || "")}</div>
        <div class="glossary-tooltip-body">${escapeHtml(target.dataset.termDescription || "")}</div>
      `,
    );
  });

  document.addEventListener("mousemove", (event) => {
    if (!event.target.closest(".glossary-term") || STATE.glossaryTooltip.hidden) return;
    showTooltip(STATE.glossaryTooltip, event.clientX, event.clientY, STATE.glossaryTooltip.innerHTML);
  });

  document.addEventListener("mouseout", (event) => {
    if (!event.target.closest(".glossary-term")) return;
    hideTooltip(STATE.glossaryTooltip);
  });
}

function getRangePresets(chartId) {
  return chartId === "price-chart" ? PRICE_RANGE_PRESETS : RANGE_PRESETS;
}

function setupAutoRefresh() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      scheduleNextRefresh();
      return;
    }
    refresh();
  });
  window.addEventListener("focus", () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener("online", () => refresh());
  window.addEventListener("offline", () => {
    clearTimeout(STATE.pollTimer);
    scheduleNextRefresh();
  });
}

function scheduleNextRefresh() {
  clearTimeout(STATE.pollTimer);
  STATE.pollTimer = setTimeout(refresh, getNextPollInterval());
}

function getNextPollInterval() {
  const baseInterval = STATE.lastPayload?.meta?.pollIntervalMs || STATE.pollIntervalMs || 5000;
  if (!navigator.onLine) return Math.max(baseInterval, ERROR_POLL_INTERVAL_MS);
  if (document.hidden) return Math.max(baseInterval, BACKGROUND_POLL_INTERVAL_MS);
  if (STATE.refreshErrorStreak <= 0) return baseInterval;
  return Math.min(
    Math.max(baseInterval * (STATE.refreshErrorStreak + 1), ERROR_POLL_INTERVAL_MS),
    MAX_ERROR_POLL_INTERVAL_MS,
  );
}

function render() {
  const payload = STATE.lastPayload;
  if (!payload) return;
  const history = payload.history || { summary: {}, series: [], highres: { summary: {}, series: [] } };
  const live = payload.live || { summary: {}, snapshot: {}, highFrequency: [], daily: [] };
  const combined = buildCombinedSeries(history.series || [], history.highres?.series || [], live);
  const snapshot = live.snapshot || {};
  const latestDataTime = live.summary?.latestTime || snapshot.checkedAtLocal || "-";

  el.generatedAt.textContent = formatDateTime(payload.meta?.generatedAt);
  el.latestTime.textContent = formatDateTime(latestDataTime);
  el.heroSubtitle.textContent = buildHeroSubtitle(history.summary || {});
  el.panelStatus.textContent = buildPanelStatus(payload.meta);
  el.monitorStatus.textContent = buildMonitorStatus(payload.meta);

  renderKpis(history.summary || {}, live, combined);
  renderSummaryText(history.summary || {}, live, combined);

  renderDualAxisChart(el.priceChart, combined.longTerm, {
    xLabel: "时间",
    leftAxisLabel: "美元/盎司",
    rightAxisLabel: "元/克",
    leftSeries: [{ key: "priceUsdPerOz", label: "XAU/USD", color: "#f2b94b", digits: 2, unit: "美元/盎司" }],
    rightSeries: [{ key: "priceCnyPerGram", label: "人民币价格", color: "#4fd1c5", digits: 2, unit: "元/克" }],
  });
  renderDualAxisChart(el.fxChart, combined.longTerm, {
    xLabel: "时间",
    leftAxisLabel: "汇率",
    rightAxisLabel: "",
    leftSeries: [{ key: "usdCnyRate", label: "USD/CNY", color: "#7aa2ff", digits: 4, unit: "" }],
    rightSeries: [],
  });
  renderDualAxisChart(el.macroChart, combined.longTerm, {
    xLabel: "时间",
    leftAxisLabel: "GC近月",
    rightAxisLabel: "UUP",
    leftSeries: [{ key: "gcFrontClose", label: "GC近月", color: "#f87171", digits: 2, unit: "" }],
    rightSeries: [{ key: "uupClose", label: "UUP", color: "#7aa2ff", digits: 2, unit: "" }],
  });
  renderBarChart(el.volumeChart, combined.longTerm, {
    xLabel: "时间",
    yLabel: "5分钟成交量",
    valueKey: "gcFrontVolume",
    label: "GC 5分钟成交量",
    color: "#f2b94b",
    digits: 0,
    unit: "手",
  });
  renderSingleLineChart(el.dailyGldChart, combined.daily, {
    xLabel: "时间",
    yLabel: "GLD",
    series: { key: "gldClose", label: "GLD", color: "#34d399", digits: 2, unit: "" },
  });
  renderSingleLineChart(el.dailyRealChart, combined.daily, {
    xLabel: "时间",
    yLabel: "美国10年实际利率 %",
    series: { key: "realYield10Y", label: "美国10年实际利率", color: "#8b5cf6", digits: 2, unit: "%" },
  });
  renderSingleLineChart(el.dailyUupChart, combined.daily, {
    xLabel: "时间",
    yLabel: "UUP",
    series: { key: "uupClose", label: "UUP", color: "#7aa2ff", digits: 2, unit: "" },
  });

  updateToolbarState();
}

function buildCombinedSeries(historyRows, highresRows, live) {
  const highResHistory = (highresRows || []).map((row) => ({
    pointTime: row.time,
    pointDate: parsePointDate(row.time),
    priceUsdPerOz: sanitizePositive(row.priceUsdPerOz),
    priceCnyPerGram: sanitizePositive(row.priceCnyPerGram),
    fxCarriedForward: Boolean(row.fxCarriedForward),
    usdCnyRate: sanitizePositive(row.usdCnyRate),
    gcFrontClose: sanitizePositive(row.gcFrontClose),
    gcFrontVolume: sanitizePositive(row.gcFrontVolume),
    gldClose: sanitizePositive(row.gldClose),
    uupClose: sanitizePositive(row.uupClose),
    realYield10Y: null,
  }));
  const intradayRows = buildLiveFiveMinuteRows(live.highFrequency || []);

  const firstHighResDate = highResHistory[0]?.pointDate ? highResHistory[0].pointDate.toISOString().slice(0, 10) : null;
  const firstIntradayDate = intradayRows[0]?.pointDate ? intradayRows[0].pointDate.toISOString().slice(0, 10) : null;
  const historyCutoffDate = firstHighResDate || firstIntradayDate;
  const longTermHistory = historyRows
    .filter((row) => !historyCutoffDate || row.date < historyCutoffDate)
    .map((row) => ({
      pointTime: row.date,
      pointDate: new Date(`${row.date}T00:00:00`),
      priceUsdPerOz: sanitizePositive(row.priceUsdPerOz),
      priceCnyPerGram: sanitizePositive(row.priceCnyPerGram),
      fxCarriedForward: Boolean(row.fxCarriedForward),
      usdCnyRate: sanitizePositive(row.usdCnyRate),
      gcFrontClose: sanitizePositive(row.gcFrontClose),
      gcFrontVolume: sanitizePositive(row.gcFrontVolume),
      gldClose: sanitizePositive(row.gldClose),
      uupClose: sanitizePositive(row.uupClose),
      realYield10Y: row.realYield10Y,
    }));

  const lastHighResTime = highResHistory.at(-1)?.pointDate || null;
  const trailingIntradayRows = intradayRows.filter((row) => !lastHighResTime || row.pointDate > lastHighResTime);

  const dailyRows = historyRows.map((row) => ({
    pointTime: row.date,
    pointDate: new Date(`${row.date}T00:00:00`),
    gldClose: sanitizePositive(row.gldClose),
    uupClose: sanitizePositive(row.uupClose),
    realYield10Y: row.realYield10Y,
  })).concat(highResHistory.map((row) => ({
    pointTime: row.pointTime,
    pointDate: row.pointDate,
    gldClose: row.gldClose,
    uupClose: row.uupClose,
    realYield10Y: null,
  }))).concat((live.daily || []).map((row) => ({
    pointTime: row.date,
    pointDate: new Date(`${row.date}T23:59:00`),
    gldClose: sanitizePositive(row.gldClose),
    uupClose: sanitizePositive(row.uupClose),
    realYield10Y: row.realYield10Y,
  }))).sort((left, right) => left.pointDate - right.pointDate);
  const dedupedDailyRows = [];
  for (const row of dailyRows) {
    const last = dedupedDailyRows.at(-1);
    if (last && last.pointTime === row.pointTime) {
      dedupedDailyRows[dedupedDailyRows.length - 1] = row;
    } else {
      dedupedDailyRows.push(row);
    }
  }
  fillForward(dedupedDailyRows, "realYield10Y");

  return {
    longTerm: longTermHistory.concat(highResHistory, trailingIntradayRows),
    daily: dedupedDailyRows,
  };
}

function buildLiveFiveMinuteRows(rows) {
  if (!rows.length) return [];
  const buckets = new Map();
  for (const row of rows) {
    const pointDate = parsePointDate(row.time);
    if (Number.isNaN(pointDate.getTime())) continue;
    const bucketDate = floorToFiveMinutes(pointDate);
    const bucketKey = bucketDate.getTime();
    const current = buckets.get(bucketKey);
    if (!current || pointDate >= current.pointDate) {
      buckets.set(bucketKey, {
        pointTime: formatBucketTime(bucketDate),
        pointDate: bucketDate,
        sourceTime: row.time,
        priceUsdPerOz: sanitizePositive(row.priceUsdPerOz),
        priceCnyPerGram: sanitizePositive(row.priceCnyPerGram),
        fxCarriedForward: false,
        usdCnyRate: sanitizePositive(row.usdCnyRate),
        gcFrontClose: sanitizePositive(row.gcFrontClose),
        gcFrontVolume: sanitizePositive(row.gcFrontVolume),
        uupClose: sanitizePositive(row.uupClose),
        dollarProxyVolume: sanitizePositive(row.dollarProxyVolume),
      });
    }
  }

  const sortedBuckets = [...buckets.values()].sort((left, right) => left.pointDate - right.pointDate);
  let lastGcCumulative = null;
  let lastUupCumulative = null;
  for (const row of sortedBuckets) {
    const nextGcCumulative = sanitizePositive(row.gcFrontVolume);
    const nextUupCumulative = sanitizePositive(row.dollarProxyVolume);
    row.gcFrontVolume = deriveIntervalVolume(nextGcCumulative, lastGcCumulative);
    row.dollarProxyVolume = deriveIntervalVolume(nextUupCumulative, lastUupCumulative);
    if (Number.isFinite(nextGcCumulative)) lastGcCumulative = nextGcCumulative;
    if (Number.isFinite(nextUupCumulative)) lastUupCumulative = nextUupCumulative;
    delete row.sourceTime;
  }
  return sortedBuckets;
}

function deriveIntervalVolume(current, previous) {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) return null;
  const delta = current - previous;
  if (!Number.isFinite(delta) || delta <= 0) return null;
  return delta;
}

function floorToFiveMinutes(date) {
  const floored = new Date(date);
  floored.setSeconds(0, 0);
  floored.setMinutes(Math.floor(floored.getMinutes() / 5) * 5);
  return floored;
}

function formatBucketTime(date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}:00`;
}

function renderKpis(historySummary, live, combined) {
  const snapshot = live.snapshot || {};
  const cards = [
    ["最新数据时间", live.summary?.latestTime || snapshot.checkedAtLocal || "-", live.summary?.trendLabel ? `实时状态 ${live.summary.trendLabel}` : "等待最新数据"],
    ["XAU/USD", `${toFixed(snapshot.priceUsdPerOz, 2)} 美元`, `区间 ${formatRange(historySummary.priceRange, "美元/盎司")}`],
    ["人民币金价", `${toFixed(snapshot.priceCnyPerGram, 2)} 元/克`, `区间 ${formatRange(historySummary.cnyRange, "元/克")}`],
    ["USD/CNY", toFixed(snapshot.usdCnyRate, 4), "美元兑人民币汇率"],
    ["GC近月成交量", formatInteger(snapshot.gcFrontVolume), `总点数 ${formatInteger(combined.longTerm.length)}`],
    ["美国10年实际利率", `${toFixed(live.snapshot?.dailyContext?.realYield10Y, 2)}%`, "黄金中线核心变量"],
    ["报警状态", snapshot.isAlert ? "触发中" : "正常", snapshot.thresholdText || "未触发阈值"],
    ["实时建议", snapshot.direction || "-", ""],
  ];

  el.kpiGrid.innerHTML = cards.map(([label, value, delta], index) => `
    <article class="kpi-card${index === cards.length - 1 ? " kpi-card-advice" : ""}">
      <div class="kpi-label">${renderGlossaryLabel(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-delta">${escapeHtml(delta)}</div>
    </article>
  `).join("");
}

function renderSummaryText(historySummary, live, combined) {
  const snapshot = live.snapshot || {};
  const priceHint = `长周期区间 ${formatRange(historySummary.priceRange, "美元/盎司")}，最新数据时间 ${live.summary?.latestTime || "-"}`;
  const fxHint = `长周期区间 ${formatRange(historySummary.fxRange, "")}`;
  const macroHint = `实时趋势 ${live.summary?.trendLabel || "-"}，当前总点数 ${formatInteger(combined.longTerm.length)}`;
  const volumeHint = maxValue(combined.longTerm, "gcFrontVolume") == null ? "当前没有有效成交量数据" : `当前窗口最大成交量 ${formatInteger(maxValue(combined.longTerm, "gcFrontVolume"))} 手`;
  const dailyGldHint = "机构黄金持仓代理";
  const dailyRealHint = "紫色线为美国10年实际利率";
  const dailyUupHint = "美元指数代理 ETF";
  el.priceRange.textContent = "";
  el.fxRange.textContent = "";
  el.macroRange.textContent = "";
  el.volumeRange.textContent = "";
  el.dailyGldRange.textContent = "";
  el.dailyRealRange.textContent = "";
  el.dailyUupRange.textContent = "";
  extendGlossaryDescription(el.priceTitleTerm, priceHint);
  extendGlossaryDescription(el.fxTitleTerm, fxHint);
  extendGlossaryDescription(el.macroTitleTerm, macroHint);
  extendGlossaryDescription(el.volumeTitleTerm, volumeHint);
  extendGlossaryDescription(el.dailyGldTitleTerm, dailyGldHint);
  extendGlossaryDescription(el.dailyRealTitleTerm, dailyRealHint);
  extendGlossaryDescription(el.dailyUupTitleTerm, dailyUupHint);
  el.direction.textContent = snapshot.direction || "-";
  el.hfAdvice.textContent = snapshot.highFrequencyAdvice || "-";
  el.dailyAdvice.textContent = snapshot.dailyAdvice || "-";
  el.message.textContent = snapshot.message || "-";
}

function renderSingleLineChart(svg, rows, config) {
  renderDualAxisChart(svg, rows, {
    xLabel: config.xLabel,
    leftAxisLabel: config.yLabel,
    rightAxisLabel: "",
    leftSeries: [config.series],
    rightSeries: [],
    resolveRow: (visibleRows, index) => nearestFiniteRow(visibleRows, index, [config.series.key]),
  });
}

function renderDualAxisChart(svg, rows, config) {
  const width = svg.clientWidth || 600;
  const height = svg.clientHeight || 250;
  const margin = { top: 18, right: 78, bottom: 62, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const windowState = getWindow(svg, rows);
  const visibleRows = rows.slice(windowState.start, windowState.end + 1);
  const leftValues = config.leftSeries.flatMap((series) => visibleRows.map((row) => row[series.key])).filter(isFiniteNumber);
  const rightValues = config.rightSeries.flatMap((series) => visibleRows.map((row) => row[series.key])).filter(isFiniteNumber);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";
  clearHover(svg);
  if (!visibleRows.length || (!leftValues.length && !rightValues.length)) return;

  const leftDomain = buildDomain(leftValues);
  const rightDomain = rightValues.length ? buildDomain(rightValues) : null;
  const xScale = createTimeScale(visibleRows, margin.left, plotWidth);
  const xAt = (index) => xScale.at(index);
  const leftYAt = (value) => projectY(value, leftDomain, margin.top, plotHeight);
  const rightYAt = (value) => projectY(value, rightDomain, margin.top, plotHeight);
  const xTicks = buildXTicks(visibleRows, visibleRows.length > 180 ? 5 : visibleRows.length > 40 ? 6 : 4, xScale);

  svg.innerHTML = [
    buildAxesMarkup(margin, plotWidth, plotHeight, width, height, config, leftDomain, rightDomain, xTicks, xAt, leftYAt, rightYAt),
    `<g class="chart-data">${[
      ...config.leftSeries.map((series) => buildPolyline(visibleRows, series, xAt, leftYAt)),
      ...config.rightSeries.map((series) => buildPolyline(visibleRows, series, xAt, rightYAt)),
    ].join("")}</g>`,
  ].join("");

  bindInteractions(svg, rows, visibleRows, margin, plotWidth, plotHeight, xScale, {
    resolveRow: (index) => {
      if (!config.resolveRow) return { row: visibleRows[index], index };
      const resolved = config.resolveRow(visibleRows, index);
      return resolved || { row: visibleRows[index], index };
    },
    tooltip: (row) => buildTooltipHtml(row.pointTime, [
      ...config.leftSeries.map((series) => tooltipItem(row, series)),
      ...config.rightSeries.map((series) => tooltipItem(row, series)),
    ].filter(Boolean)),
    markers: (row, localIndex) => [
      ...config.leftSeries.map((series) => buildMarker(row, series, xAt(localIndex), leftYAt)),
      ...config.rightSeries.map((series) => buildMarker(row, series, xAt(localIndex), rightYAt)),
    ].join(""),
  });
}

function renderBarChart(svg, rows, config) {
  const width = svg.clientWidth || 600;
  const height = svg.clientHeight || 250;
  const margin = { top: 18, right: 22, bottom: 62, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const windowState = getWindow(svg, rows);
  const visibleRows = rows.slice(windowState.start, windowState.end + 1);
  const values = visibleRows.map((row) => row[config.valueKey]).filter(isFiniteNumber);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";
  clearHover(svg);
  if (!visibleRows.length || !values.length) return;

  const domain = buildDomain([0, ...values]);
  const xScale = createTimeScale(visibleRows, margin.left, plotWidth);
  const centers = visibleRows.map((_, index) => xScale.at(index));
  const barWidth = computeBarWidth(centers, plotWidth, visibleRows.length);
  const xAt = (index) => centers[index] - barWidth / 2;
  const yAt = (value) => projectY(value, domain, margin.top, plotHeight);
  const xTicks = buildXTicks(visibleRows, visibleRows.length > 180 ? 5 : visibleRows.length > 40 ? 6 : 4, xScale);

  svg.innerHTML = [
    buildBarAxesMarkup(margin, plotWidth, plotHeight, width, height, config, domain, xTicks, xAt, yAt, barWidth),
    `<g class="chart-data">${visibleRows.map((row, index) => {
      const value = row[config.valueKey];
      if (!isFiniteNumber(value)) return "";
      return `<rect x="${xAt(index) + 2}" y="${yAt(value)}" width="${Math.max(barWidth - 4, 2)}" height="${margin.top + plotHeight - yAt(value)}" rx="3" fill="${config.color}" opacity="0.82" />`;
    }).join("")}</g>`,
  ].join("");

  bindInteractions(svg, rows, visibleRows, margin, plotWidth, plotHeight, xScale, {
    resolveRow: (index) => ({ row: visibleRows[index], index }),
    tooltip: (row) => buildTooltipHtml(row.pointTime, [
      { color: config.color, label: config.label, value: formatSeriesValue(row[config.valueKey], config.digits, config.unit) },
    ]),
    markers: (row, localIndex) => {
      const value = row[config.valueKey];
      if (!isFiniteNumber(value)) return "";
      return `<circle cx="${xAt(localIndex) + barWidth / 2}" cy="${yAt(value)}" r="4" fill="${config.color}" stroke="#08101a" stroke-width="2" />`;
    },
  });
}

function buildAxesMarkup(margin, plotWidth, plotHeight, width, height, config, leftDomain, rightDomain, xTicks, xAt, leftYAt, rightYAt) {
  return [
    svgLine(margin.left, margin.top, margin.left, margin.top + plotHeight),
    svgLine(margin.left + plotWidth, margin.top, margin.left + plotWidth, margin.top + plotHeight),
    svgLine(margin.left, margin.top + plotHeight, margin.left + plotWidth, margin.top + plotHeight),
    ...buildTicks(leftDomain.min, leftDomain.max, 4).map((tick) => {
      const y = leftYAt(tick);
      return `${svgGrid(margin.left, margin.left + plotWidth, y)}${svgText(margin.left - 14, y + 4, formatTickValue(tick), "end")}`;
    }),
    ...(!rightDomain ? [] : buildTicks(rightDomain.min, rightDomain.max, 4).map((tick) => svgText(margin.left + plotWidth + 14, rightYAt(tick) + 4, formatTickValue(tick), "start"))),
    ...xTicks.map((tick) => `${svgLine(tick.x, margin.top + plotHeight, tick.x, margin.top + plotHeight + 5)}${svgText(tick.x, height - 26, tick.label, "middle")}`),
    svgText(margin.left + plotWidth / 2, height - 6, config.xLabel, "middle"),
    svgVerticalText(24, margin.top + plotHeight / 2, config.leftAxisLabel),
    config.rightSeries.length ? svgVerticalText(width - 24, margin.top + plotHeight / 2, config.rightAxisLabel, 90) : "",
  ].join("");
}

function buildBarAxesMarkup(margin, plotWidth, plotHeight, width, height, config, domain, xTicks, xAt, yAt, barWidth) {
  return [
    svgLine(margin.left, margin.top, margin.left, margin.top + plotHeight),
    svgLine(margin.left, margin.top + plotHeight, margin.left + plotWidth, margin.top + plotHeight),
    ...buildTicks(domain.min, domain.max, 4).map((tick) => {
      const y = yAt(tick);
      return `${svgGrid(margin.left, margin.left + plotWidth, y)}${svgText(margin.left - 14, y + 4, formatTickValue(tick), "end")}`;
    }),
    ...xTicks.map((tick) => `${svgLine(tick.x, margin.top + plotHeight, tick.x, margin.top + plotHeight + 5)}${svgText(tick.x, height - 26, tick.label, "middle")}`),
    svgText(margin.left + plotWidth / 2, height - 6, config.xLabel, "middle"),
    svgVerticalText(24, margin.top + plotHeight / 2, config.yLabel),
  ].join("");
}

function bindInteractions(svg, allRows, visibleRows, margin, plotWidth, plotHeight, xScale, helpers) {
  const overlay = createOverlay(margin, plotWidth, plotHeight);
  const crosshair = createCrosshair();
  const brush = createBrush();
  const hoverLayer = createHoverLayer();
  let brushStart = null;
  let hoverFrame = 0;
  let pendingHover = null;
  let lastHoverKey = "";

  svg.appendChild(crosshair);
  svg.appendChild(hoverLayer);
  svg.appendChild(brush);
  svg.appendChild(overlay);

  const flushHover = () => {
    hoverFrame = 0;
    if (!pendingHover) return;
    const { event, point } = pendingHover;
    pendingHover = null;
    const index = xScale.nearestIndex(point.x);
    const resolved = helpers.resolveRow ? helpers.resolveRow(index) : { row: visibleRows[index], index };
    const row = resolved?.row;
    const localIndex = resolved?.index ?? index;
    if (!row) return;
    const x = xScale.at(localIndex);
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.setAttribute("y1", margin.top);
    crosshair.setAttribute("y2", margin.top + plotHeight);
    crosshair.style.display = "block";

    const hoverKey = `${row.pointTime || ""}|${localIndex}`;
    if (hoverKey !== lastHoverKey) {
      updateHover(hoverLayer, helpers.markers(row, localIndex));
      showTooltip(STATE.chartTooltip, event.clientX, event.clientY, helpers.tooltip(row));
      lastHoverKey = hoverKey;
    } else {
      moveTooltip(STATE.chartTooltip, event.clientX, event.clientY);
    }

    if (brushStart !== null) {
      const clampedX = clamp(point.x, margin.left, margin.left + plotWidth);
      brush.style.display = "block";
      brush.setAttribute("x", Math.min(brushStart, clampedX));
      brush.setAttribute("y", margin.top);
      brush.setAttribute("width", Math.abs(clampedX - brushStart));
      brush.setAttribute("height", plotHeight);
    }
  };

  overlay.addEventListener("mousemove", (event) => {
    pendingHover = { event, point: getLocalPoint(svg, event) };
    if (hoverFrame) return;
    hoverFrame = window.requestAnimationFrame(flushHover);
  });

  overlay.addEventListener("mouseleave", () => {
    if (brushStart !== null) return;
    if (hoverFrame) {
      window.cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
    }
    pendingHover = null;
    lastHoverKey = "";
    crosshair.style.display = "none";
    clearHover(hoverLayer);
    hideTooltip(STATE.chartTooltip);
  });

  overlay.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    brushStart = clamp(getLocalPoint(svg, event).x, margin.left, margin.left + plotWidth);
  });

  overlay.addEventListener("mouseup", (event) => {
    if (brushStart === null) return;
    const startX = brushStart;
    const endX = clamp(getLocalPoint(svg, event).x, margin.left, margin.left + plotWidth);
    brushStart = null;
    brush.style.display = "none";
    if (Math.abs(endX - startX) < 10) return;
    applyBrushZoom(svg, allRows, visibleRows, startX, endX, xScale);
    render();
  });

  overlay.addEventListener("wheel", (event) => {
    event.preventDefault();
    applyWheelZoom(svg, allRows, visibleRows, getLocalPoint(svg, event).x, xScale, event.deltaY);
    render();
  }, { passive: false });
}

function applyBrushZoom(svg, rows, visibleRows, startX, endX, xScale) {
  const windowState = getWindow(svg, rows);
  const nextStart = windowState.start + xScale.nearestIndex(Math.min(startX, endX));
  const nextEnd = windowState.start + xScale.nearestIndex(Math.max(startX, endX));
  setWindow(svg, rows.length, nextStart, nextEnd);
}

function applyWheelZoom(svg, rows, visibleRows, pointerX, xScale, deltaY) {
  const windowState = getWindow(svg, rows);
  const visibleCount = windowState.end - windowState.start + 1;
  const anchorIndex = xScale.nearestIndex(pointerX);
  const ratio = visibleCount <= 1 ? 0.5 : anchorIndex / (visibleCount - 1);
  const anchor = windowState.start + anchorIndex;
  const intensity = Math.min(Math.abs(deltaY), 120) / 120;
  const step = 0.04 + intensity * 0.04;
  const factor = deltaY < 0 ? 1 - step : 1 + step;
  const nextCount = clamp(Math.round(visibleCount * factor), 8, rows.length);
  const nextStart = Math.round(anchor - ratio * (nextCount - 1));
  setWindow(svg, rows.length, nextStart, nextStart + nextCount - 1);
}

function getWindow(svg, rows) {
  const current = STATE.windows.get(svg.id);
  if (current) return current;
  const initial = buildPresetWindow(rows, "2M");
  STATE.windows.set(svg.id, initial);
  return initial;
}

function setWindow(svg, totalCount, start, end, range = "custom") {
  const maxIndex = Math.max(totalCount - 1, 0);
  let nextStart = clamp(start, 0, maxIndex);
  let nextEnd = clamp(end, 0, maxIndex);
  if (nextEnd < nextStart) [nextStart, nextEnd] = [nextEnd, nextStart];
  if (nextEnd - nextStart < 7 && totalCount > 8) nextEnd = Math.min(maxIndex, nextStart + 7);
  STATE.windows.set(svg.id, { start: nextStart, end: nextEnd, range });
}

function resetWindow(svg) {
  const rows = getRowsForChart(svg.id);
  STATE.windows.set(svg.id, { start: 0, end: Math.max(rows.length - 1, 0), range: "All" });
}

function applyPreset(svg, range) {
  const rows = getRowsForChart(svg.id);
  STATE.windows.set(svg.id, buildPresetWindow(rows, range));
}

function buildPresetWindow(rows, range) {
  if (!rows.length) return { start: 0, end: 0, range };
  if (range === "All") return { start: 0, end: rows.length - 1, range };
  const endDate = rows.at(-1)?.pointDate;
  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return { start: 0, end: rows.length - 1, range };
  const boundary = new Date(endDate);
  if (range === "1H") boundary.setHours(boundary.getHours() - 1);
  if (range === "2H") boundary.setHours(boundary.getHours() - 2);
  if (range === "4H") boundary.setHours(boundary.getHours() - 4);
  if (range === "6H") boundary.setHours(boundary.getHours() - 6);
  if (range === "12H") boundary.setHours(boundary.getHours() - 12);
  if (range === "1D") boundary.setDate(boundary.getDate() - 1);
  if (range === "2D") boundary.setDate(boundary.getDate() - 2);
  if (range === "1M") boundary.setMonth(boundary.getMonth() - 1);
  if (range === "2M") boundary.setMonth(boundary.getMonth() - 2);
  if (range === "1Y") boundary.setFullYear(boundary.getFullYear() - 1);
  if (range === "5Y") boundary.setFullYear(boundary.getFullYear() - 5);
  const startIndex = rows.findIndex((row) => row.pointDate >= boundary);
  return { start: startIndex < 0 ? 0 : startIndex, end: rows.length - 1, range };
}

function updateToolbarState() {
  document.querySelectorAll(".chart-toolbar").forEach((toolbar) => {
    const chartId = toolbar.getAttribute("data-chart");
    const activeRange = STATE.windows.get(chartId)?.range || "2M";
    toolbar.querySelectorAll("[data-action='range']").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-range") === activeRange);
    });
    toolbar.querySelector("[data-action='reset']")?.classList.toggle("is-active", activeRange === "All");
  });
}

function getRowsForChart(chartId) {
  const payload = STATE.lastPayload;
  const history = payload.history || { series: [], highres: { series: [] } };
  const live = payload.live || { highFrequency: [], daily: [] };
  const combined = buildCombinedSeries(history.series || [], history.highres?.series || [], live);
  if (chartId === "daily-gld-chart" || chartId === "daily-real-chart" || chartId === "daily-uup-chart") return combined.daily;
  return combined.longTerm;
}

function buildPolyline(rows, series, xAt, yAt) {
  const points = rows.map((row, index) => {
    const value = row[series.key];
    if (!isFiniteNumber(value)) return null;
    return `${xAt(index)},${yAt(value)}`;
  }).filter(Boolean).join(" ");
  return `<polyline fill="none" stroke="${series.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${points}" />`;
}

function buildMarker(row, series, x, yAt) {
  const value = row[series.key];
  if (!isFiniteNumber(value)) return "";
  return `<circle cx="${x}" cy="${yAt(value)}" r="4" fill="${series.color}" stroke="#08101a" stroke-width="2" />`;
}

function tooltipItem(row, series) {
  const value = row[series.key];
  if (!isFiniteNumber(value)) return null;
  const note = series.key === "priceCnyPerGram" && row.fxCarriedForward ? "（汇率为最近有效值）" : "";
  return { color: series.color, label: series.label, value: `${formatSeriesValue(value, series.digits, series.unit)}${note}` };
}

function buildTicks(min, max, count) {
  return Array.from({ length: count + 1 }, (_, index) => min + ((max - min) * index) / count);
}

function buildXTicks(rows, count, xScale) {
  if (!rows.length) return [];
  if (rows.length === 1) return [{ index: 0, x: xScale.at(0), label: formatXAxis(rows[0].pointTime, rows) }];
  const target = rows.length > 360 ? 3 : rows.length > 180 ? 4 : rows.length > 90 ? 5 : rows.length > 45 ? 6 : count;
  const minTime = rows[0]?.pointDate?.getTime?.() ?? 0;
  const maxTime = rows.at(-1)?.pointDate?.getTime?.() ?? minTime;
  const span = Math.max(maxTime - minTime, 1);
  const indexes = new Set([0, rows.length - 1]);
  for (let step = 1; step < target; step += 1) {
    const targetTime = minTime + (span * step) / target;
    indexes.add(findNearestTimeIndex(rows, targetTime));
  }
  return [...indexes].sort((a, b) => a - b).map((index) => ({ index, x: xScale.at(index), label: formatXAxis(rows[index].pointTime, rows) }));
}

function nearestFiniteRow(rows, index, keys) {
  for (let offset = 0; offset < rows.length; offset += 1) {
    const left = index - offset;
    if (left >= 0 && keys.every((key) => isFiniteNumber(rows[left]?.[key]))) return { row: rows[left], index: left };
    const right = index + offset;
    if (right < rows.length && keys.every((key) => isFiniteNumber(rows[right]?.[key]))) return { row: rows[right], index: right };
  }
  return rows[index] ? { row: rows[index], index } : null;
}

function buildDomain(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.05;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function projectY(value, domain, top, height) {
  return top + ((domain.max - value) / (domain.max - domain.min || 1)) * height;
}

function createTimeScale(rows, left, width) {
  const times = rows.map((row) => row.pointDate instanceof Date ? row.pointDate.getTime() : Number.NaN);
  const validIndexes = [];
  const validTimes = [];
  for (let index = 0; index < times.length; index += 1) {
    if (!Number.isFinite(times[index])) continue;
    validIndexes.push(index);
    validTimes.push(times[index]);
  }
  const minTime = validTimes[0] ?? 0;
  const maxTime = validTimes.at(-1) ?? minTime;
  const span = Math.max(maxTime - minTime, 1);
  const fallback = rows.length > 1 ? width / (rows.length - 1) : 0;
  return {
    at(index) {
      const time = times[index];
      if (!Number.isFinite(time)) return left + (rows.length > 1 ? fallback * index : width / 2);
      return left + ((time - minTime) / span) * width;
    },
    nearestIndex(x) {
      if (rows.length <= 1) return 0;
      const targetTime = minTime + clamp((x - left) / width, 0, 1) * span;
      return findNearestTimeIndex(rows, targetTime, times, validIndexes, validTimes);
    },
  };
}

function findNearestTimeIndex(rows, targetTime, timesArg, validIndexesArg, validTimesArg) {
  const times = timesArg || rows.map((row) => row.pointDate instanceof Date ? row.pointDate.getTime() : Number.NaN);
  const validIndexes = validIndexesArg || [];
  const validTimes = validTimesArg || [];
  if (!validTimes.length) {
    for (let index = 0; index < times.length; index += 1) {
      if (!Number.isFinite(times[index])) continue;
      validIndexes.push(index);
      validTimes.push(times[index]);
    }
  }
  if (!validTimes.length) return 0;
  let low = 0;
  let high = validTimes.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (validTimes[mid] < targetTime) low = mid + 1;
    else high = mid;
  }
  const rightPos = low;
  const leftPos = Math.max(0, rightPos - 1);
  const rightIndex = validIndexes[Math.min(rightPos, validIndexes.length - 1)];
  const leftIndex = validIndexes[leftPos];
  const rightDistance = Math.abs((times[rightIndex] ?? Number.POSITIVE_INFINITY) - targetTime);
  const leftDistance = Math.abs((times[leftIndex] ?? Number.POSITIVE_INFINITY) - targetTime);
  return rightDistance < leftDistance ? rightIndex : leftIndex;
}

function computeBarWidth(centers, plotWidth, count) {
  if (count <= 1) return Math.max(Math.min(plotWidth * 0.16, 28), 6);
  let minGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < centers.length; index += 1) {
    minGap = Math.min(minGap, centers[index] - centers[index - 1]);
  }
  const safeGap = Number.isFinite(minGap) ? minGap : plotWidth / count;
  return Math.max(Math.min(safeGap * 0.72, 24), 3);
}

function renderGlossaryLabel(label) {
  const entry = KPI_GLOSSARY[label];
  if (!entry) return escapeHtml(label);
  const [title, description] = entry;
  return `<span class="glossary-term" data-term-title="${escapeHtml(title)}" data-term-description="${escapeHtml(description)}">${escapeHtml(label)}</span>`;
}

function extendGlossaryDescription(node, suffix) {
  if (!node) return;
  if (!node.dataset.baseDescription) {
    node.dataset.baseDescription = node.dataset.termDescription || "";
  }
  node.dataset.termDescription = suffix ? `${node.dataset.baseDescription} 当前看板说明：${suffix}` : node.dataset.baseDescription;
}

function createOverlay(margin, plotWidth, plotHeight) {
  const overlay = svgNode("rect");
  overlay.setAttribute("x", margin.left);
  overlay.setAttribute("y", margin.top);
  overlay.setAttribute("width", plotWidth);
  overlay.setAttribute("height", plotHeight);
  overlay.setAttribute("fill", "transparent");
  overlay.style.cursor = "crosshair";
  return overlay;
}

function createCrosshair() {
  const line = svgNode("line");
  line.setAttribute("stroke", THEME.crosshair);
  line.setAttribute("stroke-width", "1");
  line.setAttribute("stroke-dasharray", "4 4");
  line.style.display = "none";
  return line;
}

function createHoverLayer() {
  const group = svgNode("g");
  group.setAttribute("data-hover", "1");
  return group;
}

function createBrush() {
  const rect = svgNode("rect");
  rect.setAttribute("fill", "rgba(122, 162, 255, 0.16)");
  rect.setAttribute("stroke", "rgba(122, 162, 255, 0.75)");
  rect.setAttribute("stroke-width", "1");
  rect.style.display = "none";
  return rect;
}

function createTooltip(className) {
  const node = document.createElement("div");
  node.className = className;
  node.hidden = true;
  node.dataset.html = "";
  document.body.appendChild(node);
  return node;
}

function showTooltip(node, clientX, clientY, html) {
  if (node.dataset.html !== html) {
    node.innerHTML = html;
    node.dataset.html = html;
  }
  node.hidden = false;
  moveTooltip(node, clientX, clientY);
}

function moveTooltip(node, clientX, clientY) {
  if (!node || node.hidden) return;
  const rect = node.getBoundingClientRect();
  let left = clientX + 16;
  let top = clientY + 16;
  if (left + rect.width > window.innerWidth - 12) left = clientX - rect.width - 16;
  if (top + rect.height > window.innerHeight - 12) top = clientY - rect.height - 16;
  node.style.left = `${Math.max(12, left)}px`;
  node.style.top = `${Math.max(12, top)}px`;
}

function hideTooltip(node) {
  if (!node) return;
  node.hidden = true;
  node.dataset.html = "";
}

function buildTooltipHtml(title, items) {
  return `
    <div class="chart-tooltip-title">${escapeHtml(title || "-")}</div>
    ${items.map((item) => `
      <div class="chart-tooltip-row">
        <span class="chart-tooltip-key"><i class="chart-tooltip-dot" style="background:${item.color}"></i>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `).join("")}
  `;
}

function updateHover(node, markup) {
  if (!node) return;
  node.innerHTML = markup;
}

function clearHover(node) {
  if (!node) return;
  if (typeof node.querySelectorAll === "function" && node instanceof SVGSVGElement) {
    node.querySelectorAll("[data-hover='1']").forEach((child) => child.remove());
    return;
  }
  node.innerHTML = "";
}

function getLocalPoint(svg, event) {
  const rect = svg.getBoundingClientRect();
  const scaleX = svg.viewBox.baseVal.width / rect.width;
  const scaleY = svg.viewBox.baseVal.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function svgNode(name) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function svgLine(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${THEME.axis}" stroke-width="1" />`;
}

function svgGrid(x1, x2, y) {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${THEME.grid}" stroke-width="1" />`;
}

function svgText(x, y, text, anchor) {
  return `<text x="${x}" y="${y}" fill="${THEME.axis}" font-size="11" text-anchor="${anchor}">${escapeHtml(text)}</text>`;
}

function svgVerticalText(x, y, text, degrees = -90) {
  return `<text x="${x}" y="${y}" fill="${THEME.axis}" font-size="11" text-anchor="middle" transform="rotate(${degrees} ${x} ${y})">${escapeHtml(text)}</text>`;
}

function parsePointDate(text) {
  const value = String(text || "").trim();
  if (!value) return new Date(Number.NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const normalized = value.length === 16 ? `${value}:00` : value;
    return new Date(normalized.replace(" ", "T"));
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}( \d{2}:\d{2}(:\d{2})?)?$/.test(value)) {
    const [datePart, timePart = "00:00:00"] = value.split(" ");
    const [year, month, day] = datePart.split("/");
    const normalizedTime = timePart.length === 5 ? `${timePart}:00` : timePart;
    return new Date(`${year}-${pad2(month)}-${pad2(day)}T${normalizedTime}`);
  }
  return new Date(value);
}

function formatXAxis(value, rows = []) {
  const text = String(value || "-");
  const spanDays = getSpanDays(rows);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)) {
    const [datePart, timePart = ""] = text.split(" ");
    const [year, month, day] = datePart.split("-");
    if (spanDays > 365 * 5) return year;
    if (spanDays > 180) return `${year}-${pad2(month)}`;
    if (spanDays > 2) return `${pad2(month)}/${pad2(day)}`;
    return `${pad2(month)}/${pad2(day)} ${timePart.slice(0, 5)}`;
  }
  if (text.includes("/")) {
    const [datePart, timePart = ""] = text.split(" ");
    const [year, month, day] = datePart.split("/");
    if (spanDays > 365 * 5) return year;
    if (spanDays > 180) return `${year}-${pad2(month)}`;
    if (spanDays > 2) return `${pad2(month)}/${pad2(day)}`;
    return `${pad2(month)}/${pad2(day)} ${timePart}`;
  }
  if (spanDays > 365 * 5) return text.slice(0, 4);
  if (spanDays > 180) return text.slice(0, 7);
  if (spanDays > 2) return text.slice(5);
  return text;
}

function fillForward(rows, key) {
  let last = null;
  for (const row of rows) {
    if (isFiniteNumber(row[key])) {
      last = row[key];
    } else if (last !== null) {
      row[key] = last;
    }
  }
}

function getSpanDays(rows) {
  if (rows.length < 2) return 0;
  const start = rows[0]?.pointDate;
  const end = rows.at(-1)?.pointDate;
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  return Math.abs(end - start) / (1000 * 60 * 60 * 24);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function buildPanelStatus(meta = {}) {
  const parts = [];
  if (meta.servedFromCache) parts.push("缓存输出");
  if (meta.loadError) parts.push("已降级");
  return parts.length ? parts.join(" / ") : "运行中";
}

function buildMonitorStatus(meta = {}) {
  const monitor = meta.monitor || {};
  const parts = [];
  if (monitor.status === "retrying") parts.push("重试中");
  else if (monitor.status === "running") parts.push("运行中");
  else if (monitor.status === "stopped") parts.push("已停止");
  else if (monitor.status === "error") parts.push("异常");
  else if (monitor.status === "unknown") parts.push("未知");
  else if (monitor.status) parts.push("未知");
  if (monitor.dataStatus === "stale" || meta.liveStatus === "stale") parts.push("数据偏旧");
  if (monitor.lastError) parts.push("最近有错误");
  return parts.length ? parts.join(" / ") : "未知";
}

function buildHeroSubtitle(historySummary = {}) {
  if (historySummary.startDate && historySummary.endDate) {
    return `历史覆盖 ${historySummary.startDate} - ${historySummary.endDate}，统一在一张面板里查看长周期与实时变化。`;
  }
  return "从历史资料延续到当前监控输出，统一在一张面板里查看长周期与实时变化。";
}

function formatRange(range, unit) {
  if (!range) return "-";
  const suffix = unit ? ` ${unit}` : "";
  return `${toFixed(range.min, 2)} - ${toFixed(range.max, 2)}${suffix}`;
}

function formatSeriesValue(value, digits, unit) {
  if (!isFiniteNumber(value)) return "-";
  return `${Number(value).toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function formatTickValue(value) {
  if (!isFiniteNumber(value)) return "-";
  if (Math.abs(value) >= 1000) return Math.round(value).toString();
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function toFixed(value, digits) {
  return isFiniteNumber(value) ? Number(value).toFixed(digits) : "-";
}

function formatInteger(value) {
  return isFiniteNumber(value) ? new Intl.NumberFormat("zh-CN").format(Math.round(value)) : "-";
}

function maxValue(rows, key) {
  const values = rows.map((row) => row[key]).filter(isFiniteNumber);
  return values.length ? Math.max(...values) : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function sanitizePositive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
