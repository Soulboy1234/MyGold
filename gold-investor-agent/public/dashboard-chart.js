import {
  MA_WINDOWS,
  clamp,
  currency,
  number,
  normalizeWindow,
  pad2,
  parseTime,
} from "./dashboard-config.js";

export function renderChart(shell, panel, tooltipApi, toolbarApi) {
  const svg = shell.querySelector(".chart");
  const series = getSeries(panel);
  if (!svg || !series.length) {
    if (svg) svg.innerHTML = "";
    return;
  }

  if (!panel.window) panel.window = buildPresetWindow(series, panel.activeRange);
  panel.window = normalizeWindow(panel.window, series.length);
  const visible = series.slice(panel.window.start, panel.window.end + 1);
  if (!visible.length) {
    svg.innerHTML = "";
    return;
  }

  const markers = buildVisibleMarkers(visible, panel.payload);
  const maOverlays = computeMovingAverageOverlays(panel, series, visible);
  const averageCostValue = panel.payload.chart?.averageCostLine?.value;

  const rect = svg.getBoundingClientRect();
  const width = Math.max(520, Math.round(rect.width || 960));
  const height = Math.max(340, Math.round(rect.height || 420));
  const margin = {
    top: 24,
    right: Math.max(20, Math.round(width * 0.03)),
    bottom: 52,
    left: Math.max(56, Math.round(width * 0.065)),
  };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const priceValues = visible.map((point) => point.priceCnyPerGram).filter(Number.isFinite);
  if (!priceValues.length) {
    svg.innerHTML = "";
    return;
  }
  const priceMin = Math.min(...priceValues);
  const priceMax = Math.max(...priceValues);
  const priceSpan = Math.max(0.5, priceMax - priceMin);
  const padding = Math.max(0.8, priceSpan * 0.16);
  const yMin = priceMin - padding;
  const yMax = priceMax + padding;
  const costVisible = Number.isFinite(averageCostValue) && averageCostValue >= yMin && averageCostValue <= yMax;

  const startTime = parseTime(visible[0].time).getTime();
  const endTime = parseTime(visible.at(-1).time).getTime();
  const totalSpanMs = Math.max(1, endTime - startTime);
  const xAtTime = (timeMs) => margin.left + ((timeMs - startTime) / totalSpanMs) * plotWidth;
  const xAt = (index) => xAtTime(parseTime(visible[index].time).getTime());
  const yAt = (value) => margin.top + (1 - (value - yMin) / Math.max(1, yMax - yMin || 1)) * plotHeight;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((tick) => {
    const value = yMin + (yMax - yMin) * tick;
    const y = yAt(value);
    return `
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="grid-line"></line>
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="axis-label">${number.format(value)}</text>
    `;
  }).join("");

  const xLabels = buildXAxisLabels(visible).map((label) => `
    <text x="${xAt(label.index)}" y="${height - 14}" text-anchor="middle" class="axis-label">${label.text}</text>
  `).join("");

  const pricePath = buildContinuousPath(
    visible.map((point) => ({
      time: parseTime(point.time).getTime(),
      value: point.priceCnyPerGram,
    })),
    xAtTime,
    yAt
  );

  const maMarkup = maOverlays
    .filter((overlay) => overlay.points.length >= 2)
    .map((overlay) => `<path d="${buildContinuousPath(overlay.points, xAtTime, yAt)}" class="ma-line" style="stroke:${overlay.color}"></path>`)
    .join("");

  const markerMarkup = markers.map((marker) => {
    const x = xAt(marker.index);
    const y = yAt(visible[marker.index].priceCnyPerGram);
    const isSell = marker.action.startsWith("SELL");
    return `
      <g class="trade-dot ${isSell ? "sell" : "buy"}">
        <circle cx="${x}" cy="${y}" r="8"></circle>
        <text x="${x}" y="${y + 4}" text-anchor="middle">${isSell ? "卖" : "买"}</text>
      </g>
    `;
  }).join("");

  const costMarkup = costVisible ? `
    <line x1="${margin.left}" y1="${yAt(averageCostValue)}" x2="${width - margin.right}" y2="${yAt(averageCostValue)}" class="cost-line"></line>
    <text x="${width - margin.right - 8}" y="${yAt(averageCostValue) - 8}" text-anchor="end" class="cost-label">持仓成本金价 ${currency.format(averageCostValue)} / 克</text>
  ` : "";

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
    ${yTicks}
    ${maMarkup}
    <path d="${pricePath}" class="price-line"></path>
    ${markerMarkup}
    ${xLabels}
    ${costMarkup}
    <g class="hover-layer"></g>
    <rect class="chart-overlay" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent"></rect>
  `;

  bindChartInteractions(shell, svg, visible, series, {
    margin,
    plotWidth,
    plotHeight,
    xAt,
    yAt,
    startTime,
    totalSpanMs,
  }, panel, tooltipApi, toolbarApi);
}

export function getSeries(panel) {
  return panel.payload?.chart?.series || [];
}

export function buildPresetWindow(series, range) {
  if (!series.length) return { start: 0, end: 0 };
  if (range === "All") return { start: 0, end: series.length - 1 };
  const boundary = new Date(parseTime(series.at(-1).time));
  if (range === "1H") boundary.setHours(boundary.getHours() - 1);
  if (range === "2H") boundary.setHours(boundary.getHours() - 2);
  if (range === "4H") boundary.setHours(boundary.getHours() - 4);
  if (range === "6H") boundary.setHours(boundary.getHours() - 6);
  if (range === "12H") boundary.setHours(boundary.getHours() - 12);
  if (range === "1D") boundary.setDate(boundary.getDate() - 1);
  if (range === "2D") boundary.setDate(boundary.getDate() - 2);
  if (range === "1M") boundary.setMonth(boundary.getMonth() - 1);
  if (range === "3M") boundary.setMonth(boundary.getMonth() - 3);
  if (range === "6M") boundary.setMonth(boundary.getMonth() - 6);
  if (range === "1Y") boundary.setFullYear(boundary.getFullYear() - 1);
  let start = series.findIndex((point) => parseTime(point.time) >= boundary);
  if (start < 0) start = 0;
  return normalizeWindow({ start, end: series.length - 1 }, series.length);
}

export function nearestIndexByTimestamp(series, targetTs) {
  if (!series.length) return -1;
  let left = 0;
  let right = series.length - 1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const middleTs = parseTime(series[middle].time).getTime();
    if (middleTs === targetTs) return middle;
    if (middleTs < targetTs) left = middle + 1;
    else right = middle - 1;
  }

  if (left >= series.length) return series.length - 1;
  if (right < 0) return 0;

  const leftDistance = Math.abs(parseTime(series[left].time).getTime() - targetTs);
  const rightDistance = Math.abs(parseTime(series[right].time).getTime() - targetTs);
  return leftDistance < rightDistance ? left : right;
}

function computeMovingAverageOverlays(panel, series, visible) {
  const visibleTimeIndex = new Map(visible.map((point, index) => [point.time, index]));
  return getCachedMovingAverageSeries(panel, series).map((overlay) => {
    const points = overlay.series
      .map((point) => ({
        index: visibleTimeIndex.get(point.time),
        time: parseTime(point.time).getTime(),
        value: point.value,
      }))
      .filter((point) => Number.isInteger(point.index) && Number.isFinite(point.value));

    return { ...overlay, points };
  });
}

function getCachedMovingAverageSeries(panel, series) {
  const cacheKey = `${series.length}:${series[0]?.time || ""}:${series.at(-1)?.time || ""}`;
  if (panel.maCache?.key === cacheKey && Array.isArray(panel.maCache.overlays)) {
    return panel.maCache.overlays;
  }

  const overlays = MA_WINDOWS.map((definition) => ({
    ...definition,
    series: computeSlidingTimeAverage(series, definition.days),
  }));
  panel.maCache = { key: cacheKey, overlays };
  return overlays;
}

function computeSlidingTimeAverage(series, days) {
  const spanMs = days * 24 * 60 * 60 * 1000;
  const normalized = series
    .map((point) => ({
      time: point.time,
      ts: parseTime(point.time).getTime(),
      price: point.priceCnyPerGram,
    }))
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.price));

  if (!normalized.length) return [];

  const prefixArea = new Array(normalized.length).fill(0);
  for (let index = 1; index < normalized.length; index += 1) {
    prefixArea[index] = prefixArea[index - 1] + normalized[index - 1].price * (normalized[index].ts - normalized[index - 1].ts);
  }

  return normalized.map((point) => {
    const startTs = point.ts - spanMs;
    const effectiveStart = Math.max(startTs, normalized[0].ts);
    const coveredSpan = Math.max(1, point.ts - effectiveStart);
    const area = areaUntil(normalized, prefixArea, point.ts) - areaUntil(normalized, prefixArea, effectiveStart);
    return { time: point.time, value: area / coveredSpan };
  });
}

function buildVisibleMarkers(visible, payload) {
  const visibleStart = parseTime(visible[0].time).getTime();
  const visibleEnd = parseTime(visible.at(-1).time).getTime();
  return (payload.chart?.tradeMarkers || [])
    .filter((marker) => {
      const time = parseTime(marker.time || marker.checkedAtLocal || marker.date).getTime();
      return time >= visibleStart && time <= visibleEnd;
    })
    .map((marker) => ({
      ...marker,
      index: nearestIndexByTimestamp(visible, parseTime(marker.time || marker.checkedAtLocal || marker.date).getTime()),
    }))
    .filter((marker) => marker.index >= 0);
}

function buildContinuousPath(points, xAtTime, yAt) {
  return points
    .filter((point) => Number.isFinite(point.value))
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xAtTime(point.time)} ${yAt(point.value)}`)
    .join(" ");
}

function buildWheelZoomLockMarkup(width, height) {
  const badgeWidth = 138;
  const badgeHeight = 30;
  const x = width - badgeWidth - 18;
  const y = height - badgeHeight - 16;
  return `
    <g class="chart-lock-hint" pointer-events="none">
      <rect x="${x}" y="${y}" width="${badgeWidth}" height="${badgeHeight}" rx="999" class="chart-lock-badge"></rect>
      <text x="${x + 12}" y="${y + 19}" class="chart-lock-text">锁定中 单击解锁缩放</text>
    </g>
  `;
}

function areaUntil(points, prefixArea, targetTs) {
  if (!points.length || targetTs <= points[0].ts) return 0;
  const last = points.at(-1);
  if (targetTs >= last.ts) return prefixArea.at(-1);
  const index = rightmostPointAtOrBefore(points, targetTs);
  return prefixArea[index] + points[index].price * (targetTs - points[index].ts);
}

function rightmostPointAtOrBefore(points, targetTs) {
  let left = 0;
  let right = points.length - 1;
  let answer = 0;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (points[middle].ts <= targetTs) {
      answer = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }
  return answer;
}

function bindChartInteractions(shell, svg, visible, allSeries, metrics, panel, tooltipApi, toolbarApi) {
  const overlay = svg.querySelector(".chart-overlay");
  const hoverLayer = svg.querySelector(".hover-layer");
  const guard = shell.querySelector(".chart-scroll-guard");
  if (!overlay || !hoverLayer) return;

  let brushStart = null;
  let brush = null;
  let brushMoved = false;

  syncWheelZoomState(overlay, guard, panel);

  const onMove = (event) => {
    const point = getLocalPoint(svg, event);
    const hoveredTime = xToTime(point.x, metrics);
    const index = nearestIndexByTimestamp(visible, hoveredTime);
    const row = visible[index];
    const x = metrics.xAt(index);
    const y = metrics.yAt(row.priceCnyPerGram);
    hoverLayer.innerHTML = `
      <line x1="${x}" y1="${metrics.margin.top}" x2="${x}" y2="${metrics.margin.top + metrics.plotHeight}" class="crosshair"></line>
      <circle cx="${x}" cy="${y}" r="5" class="hover-dot"></circle>
    `;
    tooltipApi.show(event.clientX, event.clientY, `
      <div class="chart-tooltip-title">${row.time}</div>
      <div class="chart-tooltip-row"><span>国内金价</span><strong>${currency.format(row.priceCnyPerGram)}</strong></div>
    `);

    if (brushStart !== null) {
      brushMoved = true;
      if (!brush) {
        brush = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        brush.setAttribute("class", "brush");
        svg.appendChild(brush);
      }
      const currentX = clamp(point.x, metrics.margin.left, metrics.margin.left + metrics.plotWidth);
      brush.setAttribute("x", Math.min(brushStart, currentX));
      brush.setAttribute("y", metrics.margin.top);
      brush.setAttribute("width", Math.abs(currentX - brushStart));
      brush.setAttribute("height", metrics.plotHeight);
    }
  };

  const onUp = (event) => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (brushStart === null) return;
    const endX = clamp(getLocalPoint(svg, event).x, metrics.margin.left, metrics.margin.left + metrics.plotWidth);
    if (brush) {
      brush.remove();
      brush = null;
    }
    if (Math.abs(endX - brushStart) > 12) {
      const leftTime = xToTime(Math.min(brushStart, endX), metrics);
      const rightTime = xToTime(Math.max(brushStart, endX), metrics);
      const leftIndex = nearestIndexByTimestamp(visible, leftTime);
      const rightIndex = nearestIndexByTimestamp(visible, rightTime);
      panel.window = normalizeWindow({ start: panel.window.start + leftIndex, end: panel.window.start + rightIndex }, allSeries.length);
      panel.activeRange = "All";
      toolbarApi.update(shell, panel);
      renderChart(shell, panel, tooltipApi, toolbarApi);
    }
    brushStart = null;
    brushMoved = false;
  };

  overlay.addEventListener("mousemove", onMove);
  overlay.addEventListener("mouseleave", () => {
    setWheelZoomArmed(panel, overlay, guard, false);
    if (brushStart === null) {
      hoverLayer.innerHTML = "";
      tooltipApi.hide();
    }
  });
  overlay.addEventListener("mousedown", (event) => {
    brushStart = clamp(getLocalPoint(svg, event).x, metrics.margin.left, metrics.margin.left + metrics.plotWidth);
    brushMoved = false;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  overlay.addEventListener("click", (event) => {
    if (brushMoved) return;
    setWheelZoomArmed(panel, overlay, guard, true);
    tooltipApi.show(event.clientX, event.clientY, `
      <div class="chart-tooltip-title">滚轮缩放已激活</div>
      <div class="chart-tooltip-row"><span>提示</span><strong>移出图表后会自动锁定</strong></div>
    `);
    window.setTimeout(() => {
      if (panel.wheelZoomArmed) tooltipApi.hide();
    }, 900);
  });
  overlay.addEventListener("wheel", (event) => {
    if (!panel.wheelZoomArmed) return;
    event.preventDefault();
    const point = getLocalPoint(svg, event);
    const currentCount = panel.window.end - panel.window.start + 1;
    const factor = event.deltaY < 0 ? 0.82 : 1.18;
    const nextCount = clamp(Math.round(currentCount * factor), 24, allSeries.length);
    const anchorTime = xToTime(point.x, metrics);
    const localIndex = nearestIndexByTimestamp(visible, anchorTime);
    const anchor = panel.window.start + localIndex;
    const ratio = (anchorTime - metrics.startTime) / metrics.totalSpanMs;
    let start = Math.round(anchor - ratio * nextCount);
    start = clamp(start, 0, Math.max(0, allSeries.length - nextCount));
    panel.window = normalizeWindow({ start, end: start + nextCount - 1 }, allSeries.length);
    panel.activeRange = "All";
    toolbarApi.update(shell, panel);
    renderChart(shell, panel, tooltipApi, toolbarApi);
  }, { passive: false });
}

function setWheelZoomArmed(panel, overlay, guard, enabled) {
  panel.wheelZoomArmed = enabled;
  syncWheelZoomState(overlay, guard, panel);
}

function syncWheelZoomState(overlay, guard, panel) {
  const enabled = Boolean(panel.wheelZoomArmed);
  overlay.dataset.wheelZoomArmed = enabled ? "true" : "false";
  overlay.style.cursor = enabled ? "zoom-in" : "default";
  if (guard) {
    guard.classList.toggle("is-hidden", enabled);
  }
}

function getLocalPoint(svg, event) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (svg.viewBox.baseVal.width / Math.max(1, rect.width)),
    y: (event.clientY - rect.top) * (svg.viewBox.baseVal.height / Math.max(1, rect.height)),
  };
}

function xToTime(x, metrics) {
  const ratio = clamp((x - metrics.margin.left) / metrics.plotWidth, 0, 1);
  return metrics.startTime + ratio * metrics.totalSpanMs;
}

function buildXAxisLabels(visible) {
  const indexes = [0, Math.floor((visible.length - 1) / 2), visible.length - 1];
  return indexes.map((index) => ({ index, text: formatXAxis(visible[index].time, visible) }));
}

function formatXAxis(value, rows) {
  const date = parseTime(value);
  const spanDays = (parseTime(rows.at(-1).time) - parseTime(rows[0].time)) / 86400000;
  if (spanDays <= 2 / 24) return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (spanDays <= 2) return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (spanDays <= 45) return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
  if (spanDays <= 400) return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  return `${date.getFullYear()}`;
}
