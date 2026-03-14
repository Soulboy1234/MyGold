import {
  AUTO_REFRESH_MS,
  SELECTION_STORAGE_KEY,
  normalizeWindow,
  panelKey,
  parseTime,
} from "./dashboard-config.js";
import {
  buildPresetWindow,
  getSeries,
  nearestIndexByTimestamp,
} from "./dashboard-chart.js";
import {
  hydrateAgentPanels,
  renderAgentPanels,
  renderAgentSelector,
  rerenderAllCharts,
} from "./dashboard-render.js";

const APP_STATE = {
  tooltip: null,
  refreshTimer: null,
  refreshInFlight: false,
  actionInFlight: false,
  appVersion: null,
  security: {
    bindMode: "local",
    writeToken: null,
    requiresSameOrigin: false,
  },
  defaultAgent: null,
  agents: [],
  selectedAgentNames: [],
  panels: new Map(),
};

const LEGACY_AGENT_NAME_MAP = {
  "Agent1-基础": "agent1-基础",
  "Agent2-短线选手": "agent2-短线选手",
  "Agent3-长线选手": "agent3-长线选手",
};

await boot();

async function boot() {
  try {
    await init();
  } catch (error) {
    console.error("dashboard init failed", error);
    renderFatalState(error);
  }
}

async function init() {
  APP_STATE.tooltip = createTooltip();
  const registry = await loadAgentRegistry();
  setAgentRegistry(registry, { useStoredSelection: true });
  await ensureSelectedPanelsLoaded();
  render();
  startAutoRefresh();
  window.addEventListener("resize", () => rerenderAllCharts(getSelectedPanels(), tooltipApi()));
}

async function loadAgentRegistry() {
  const response = await fetch("/api/agents", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load agent registry (${response.status})`);
  return response.json();
}

async function loadAgentPayload(agentName) {
  const response = await fetch(`/api/dashboard?agent=${encodeURIComponent(agentName)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load dashboard for ${agentName} (${response.status})`);
  return response.json();
}

async function postManualTrade(agentName, request) {
  const response = await fetch(`/api/agents/manual-trade?agent=${encodeURIComponent(agentName)}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...buildWriteHeaders(),
    },
    body: JSON.stringify(request),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Failed to submit manual trade for ${agentName} (${response.status})`);
  }
  return payload;
}

async function postPendingOrder(agentName, request) {
  const response = await fetch(`/api/agents/pending-order?agent=${encodeURIComponent(agentName)}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...buildWriteHeaders(),
    },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Failed to submit pending order for ${agentName} (${response.status})`);
  }
  return payload;
}

async function deletePendingOrder(agentName, orderId) {
  const response = await fetch(`/api/agents/pending-order?agent=${encodeURIComponent(agentName)}&id=${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    cache: "no-store",
    headers: buildWriteHeaders(),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Failed to cancel pending order for ${agentName} (${response.status})`);
  }
  return payload;
}

async function postAgentAction(action, agentName) {
  const response = await fetch(`/api/agents/${action}?agent=${encodeURIComponent(agentName)}`, {
    method: "POST",
    cache: "no-store",
    headers: buildWriteHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to ${action} ${agentName} (${response.status})`);
  return response.json();
}

function setAgentRegistry(registry, { useStoredSelection = false } = {}) {
  APP_STATE.appVersion = registry.appVersion || null;
  APP_STATE.security = {
    bindMode: registry.security?.bindMode || "local",
    writeToken: registry.security?.writeToken || null,
    requiresSameOrigin: Boolean(registry.security?.requiresSameOrigin),
  };
  APP_STATE.defaultAgent = registry.defaultAgent || null;
  APP_STATE.agents = Array.isArray(registry.agents) ? registry.agents : [];
  syncAppVersionBadge();

  for (const agentMeta of APP_STATE.agents) {
    const panel = getOrCreatePanelState(agentMeta.folderName);
    panel.agent = agentMeta;
  }

  const validNames = new Set(APP_STATE.agents.map((agent) => agent.folderName));
  let nextSelection = useStoredSelection
    ? loadStoredSelection().filter((name) => validNames.has(name))
    : APP_STATE.selectedAgentNames.filter((name) => validNames.has(name));
  if (!nextSelection.length && APP_STATE.defaultAgent && validNames.has(APP_STATE.defaultAgent)) {
    nextSelection = [APP_STATE.defaultAgent];
  }
  APP_STATE.selectedAgentNames = nextSelection;
  persistSelection();
}

function loadStoredSelection() {
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeAgentName) : [];
  } catch {
    return [];
  }
}

function persistSelection() {
  window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(APP_STATE.selectedAgentNames));
}

function getOrCreatePanelState(agentName) {
  if (!APP_STATE.panels.has(agentName)) {
    APP_STATE.panels.set(agentName, {
      agentName,
      agent: APP_STATE.agents.find((item) => item.folderName === agentName) || null,
      payload: null,
      missing: false,
      error: null,
      activeRange: "1D",
      window: null,
      strategyExpanded: false,
    });
  }
  return APP_STATE.panels.get(agentName);
}

function getSelectedPanels() {
  return APP_STATE.selectedAgentNames.map((agentName) => getOrCreatePanelState(agentName));
}

async function ensureSelectedPanelsLoaded() {
  await Promise.all(APP_STATE.selectedAgentNames.map((agentName) => ensurePanelLoaded(agentName)));
}

async function ensurePanelLoaded(agentName) {
  const panel = getOrCreatePanelState(agentName);
  try {
    const nextPayload = await loadAgentPayload(agentName);
    const nextSeries = nextPayload?.chart?.series || [];
    const changed = hasPayloadChanged(panel.payload, nextPayload) || panel.missing !== Boolean(nextPayload?.missing);

    panel.agent = nextPayload?.agent || panel.agent;
    panel.error = nextPayload?.error || null;
    panel.missing = Boolean(nextPayload?.missing || nextPayload?.error);

    if (!panel.missing) {
      panel.window = projectWindowToSeries(panel, nextSeries);
    }

    panel.payload = nextPayload;
    return changed;
  } catch (error) {
    const message = error?.message || `Failed to load ${agentName}`;
    const changed = panel.error !== message || !panel.missing;
    panel.error = message;
    panel.missing = true;
    panel.payload = null;
    return changed;
  }
}

function hasPayloadChanged(previous, next) {
  if (!previous) return true;
  if (!next) return false;
  const previousLatest = previous.latest?.checkedAtLocal || "";
  const nextLatest = next.latest?.checkedAtLocal || "";
  if (previousLatest !== nextLatest) return true;
  const previousAction = previous.summary?.latestAction || "";
  const nextAction = next.summary?.latestAction || "";
  if (previousAction !== nextAction) return true;
  const previousTrades = previous.trades?.length || 0;
  const nextTrades = next.trades?.length || 0;
  if (previousTrades !== nextTrades) return true;
  const previousPoints = previous.chart?.series?.length || 0;
  const nextPoints = next.chart?.series?.length || 0;
  return previousPoints !== nextPoints;
}

function projectWindowToSeries(panel, nextSeries) {
  if (!nextSeries.length) return { start: 0, end: 0 };
  if (panel.activeRange !== "All") return buildPresetWindow(nextSeries, panel.activeRange);
  if (!panel.window || !panel.payload?.chart?.series?.length) {
    return normalizeWindow({ start: 0, end: nextSeries.length - 1 }, nextSeries.length);
  }

  const currentSeries = getSeries(panel);
  const currentStartTime = currentSeries[panel.window.start]?.time;
  const currentEndTime = currentSeries[panel.window.end]?.time;
  if (!currentStartTime || !currentEndTime) {
    return normalizeWindow({ start: 0, end: nextSeries.length - 1 }, nextSeries.length);
  }

  const start = nearestIndexByTimestamp(nextSeries, parseTime(currentStartTime).getTime());
  const end = nearestIndexByTimestamp(nextSeries, parseTime(currentEndTime).getTime());
  return normalizeWindow({ start, end }, nextSeries.length);
}

function render() {
  renderAgentSelector(APP_STATE.agents, APP_STATE.selectedAgentNames, {
    onSelectionChange: onAgentSelectionChanged,
    onActionClick: onAgentActionClicked,
  });
  const panels = getSelectedPanels();
  updateHeaderTimestamps(panels);
  renderAgentPanels(panels);
  bindPanelInteractions();
  enhanceManualTradePanels();
  hydrateAgentPanels(panels, tooltipApi());
}

function bindPanelInteractions() {
  const root = document.getElementById("agent-panels");
  if (!root) return;
  root.onsubmit = onPanelFormSubmitted;
  root.onclick = onPanelActionClicked;
}

async function onAgentSelectionChanged(event) {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  const agentName = input.value;
  const nextSelection = new Set(APP_STATE.selectedAgentNames);
  if (input.checked) nextSelection.add(agentName);
  else nextSelection.delete(agentName);
  APP_STATE.selectedAgentNames = APP_STATE.agents
    .map((agent) => agent.folderName)
    .filter((name) => nextSelection.has(name));
  persistSelection();
  await ensureSelectedPanelsLoaded();
  render();
}

async function onAgentActionClicked(event) {
  const button = event.target.closest(".agent-toggle-btn");
  if (!button || APP_STATE.actionInFlight) return;
  event.preventDefault();
  event.stopPropagation();
  if (button.dataset.agentAction === "reset") {
    const confirmed = window.confirm(
      `确认将 ${button.dataset.agentName} 重置为 100000 元现金吗？这会清空当前持仓、交易记录和待执行挂单。`
    );
    if (!confirmed) return;
  }
  APP_STATE.actionInFlight = true;
  button.disabled = true;
  try {
    await postAgentAction(button.dataset.agentAction, button.dataset.agentName);
    const registry = await loadAgentRegistry();
    setAgentRegistry(registry);
    await ensureSelectedPanelsLoaded();
    render();
  } catch (error) {
    console.warn("agent action failed", error);
  } finally {
    APP_STATE.actionInFlight = false;
  }
}

async function onManualTradeSubmitted(event) {
  const form = event.target.closest(".manual-trade-form");
  if (!form || APP_STATE.actionInFlight) return;
  event.preventDefault();

  const submitter = event.submitter;
  const mode = submitter?.dataset.mode;
  const action = String(form.dataset.manualAction || "").toUpperCase();
  const agentName = form.dataset.agentName;
  const feedbackNode = form.querySelector(".manual-trade-feedback");

  clearManualTradeFeedback(feedbackNode);

  if (!agentName || !["BUY", "SELL"].includes(action)) {
    showManualTradeFeedback(feedbackNode, "当前手动交易表单配置无效。");
    return;
  }

  const field = form.elements.namedItem(mode);
  const rawValue = typeof field?.value === "string" ? field.value.trim() : "";
  const value = Number(rawValue);

  if (!["grams", "amountCny"].includes(mode)) {
    showManualTradeFeedback(feedbackNode, "请选择有效的买卖方式。");
    return;
  }
  if (!rawValue || !Number.isFinite(value) || value <= 0) {
    showManualTradeFeedback(feedbackNode, mode === "grams" ? "请输入大于 0 的黄金克数。" : "请输入大于 0 的人民币金额。");
    return;
  }

  APP_STATE.actionInFlight = true;
  setManualTradeFormDisabled(form, true);
  const viewportAnchor = captureViewportAnchor(buildManualShellSelector(agentName));

  try {
    await postManualTrade(agentName, { action, mode, value });
    const registry = await loadAgentRegistry();
    setAgentRegistry(registry);
    await ensureSelectedPanelsLoaded();
    render();
    restoreViewportAnchor(viewportAnchor);
  } catch (error) {
    console.warn("manual trade failed", error);
    showManualTradeFeedback(feedbackNode, error?.message || "手动交易提交失败，请稍后重试。");
    setManualTradeFormDisabled(form, false);
  } finally {
    APP_STATE.actionInFlight = false;
  }
}

async function onPanelFormSubmitted(event) {
  const form = event.target.closest("form");
  if (!form) return;
  if (form.classList.contains("pending-order-form")) {
    event.preventDefault();
    await submitPendingOrderFromPanel(form, event.submitter);
    return;
  }
  if (form.classList.contains("manual-trade-form")) {
    await onManualTradeSubmitted(event);
    return;
  }
}

async function onPanelActionClicked(event) {
  const button = event.target.closest(".pending-order-cancel-btn");
  if (!button || APP_STATE.actionInFlight) return;
  event.preventDefault();
  await cancelPendingOrderFromPanel(button);
}

async function submitPendingOrderFromPanel(form, submitter) {
  const action = String(form.dataset.pendingAction || "").toUpperCase();
  const agentName = form.dataset.agentName;
  const mode = submitter?.dataset.mode;
  const feedbackNode = form.querySelector(".manual-trade-feedback");

  clearManualTradeFeedback(feedbackNode);

  if (!agentName || !["BUY", "SELL"].includes(action) || !["grams", "amountCny"].includes(mode)) {
    showManualTradeFeedback(feedbackNode, "当前挂单表单配置无效。");
    return;
  }

  const triggerValue = Number(form.elements.namedItem("triggerPriceCnyPerGram")?.value);
  const tradeValue = Number(form.elements.namedItem(mode)?.value);
  if (!Number.isFinite(triggerValue) || triggerValue <= 0) {
    showManualTradeFeedback(feedbackNode, "请输入大于 0 的触发金价。");
    return;
  }
  if (!Number.isFinite(tradeValue) || tradeValue <= 0) {
    showManualTradeFeedback(feedbackNode, mode === "grams" ? "请输入大于 0 的黄金克数。" : "请输入大于 0 的人民币金额。");
    return;
  }

  APP_STATE.actionInFlight = true;
  setManualTradeFormDisabled(form, true);
  const viewportAnchor = captureViewportAnchor(buildManualShellSelector(agentName));
  try {
    await postPendingOrder(agentName, {
      action,
      mode,
      value: tradeValue,
      triggerPriceCnyPerGram: triggerValue,
    });
    const registry = await loadAgentRegistry();
    setAgentRegistry(registry);
    await ensureSelectedPanelsLoaded();
    render();
    restoreViewportAnchor(viewportAnchor);
  } catch (error) {
    console.warn("pending order failed", error);
    showManualTradeFeedback(feedbackNode, error?.message || "挂单提交失败，请稍后重试。");
    setManualTradeFormDisabled(form, false);
  } finally {
    APP_STATE.actionInFlight = false;
  }
}

async function cancelPendingOrderFromPanel(button) {
  const agentName = button.dataset.agentName;
  const orderId = button.dataset.orderId;
  if (!agentName || !orderId) return;

  APP_STATE.actionInFlight = true;
  button.disabled = true;
  const viewportAnchor = captureViewportAnchor(buildManualShellSelector(agentName));
  try {
    await deletePendingOrder(agentName, orderId);
    const registry = await loadAgentRegistry();
    setAgentRegistry(registry);
    await ensureSelectedPanelsLoaded();
    render();
    restoreViewportAnchor(viewportAnchor);
  } catch (error) {
    console.warn("pending order cancel failed", error);
    button.disabled = false;
  } finally {
    APP_STATE.actionInFlight = false;
  }
}

function startAutoRefresh() {
  if (APP_STATE.refreshTimer) clearInterval(APP_STATE.refreshTimer);
  APP_STATE.refreshTimer = window.setInterval(() => {
    void refreshDashboard();
  }, AUTO_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refreshDashboard();
  });
}

async function refreshDashboard() {
  if (APP_STATE.refreshInFlight || APP_STATE.actionInFlight) return;
  APP_STATE.refreshInFlight = true;
  try {
    const registry = await loadAgentRegistry();
    const previousSelection = JSON.stringify(APP_STATE.selectedAgentNames);
    setAgentRegistry(registry);
    let changed = previousSelection !== JSON.stringify(APP_STATE.selectedAgentNames);

    for (const agentName of APP_STATE.selectedAgentNames) {
      changed = (await ensurePanelLoaded(agentName)) || changed;
    }

    if (changed) render();
  } catch (error) {
    console.warn("dashboard refresh failed", error);
  } finally {
    APP_STATE.refreshInFlight = false;
  }
}

function createTooltip() {
  const node = document.createElement("div");
  node.className = "chart-tooltip";
  node.hidden = true;
  document.body.appendChild(node);
  return node;
}

function tooltipApi() {
  return {
    show(x, y, html) {
      APP_STATE.tooltip.innerHTML = html;
      APP_STATE.tooltip.hidden = false;
      const rect = APP_STATE.tooltip.getBoundingClientRect();
      APP_STATE.tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - rect.width - 12, x + 16))}px`;
      APP_STATE.tooltip.style.top = `${Math.max(12, Math.min(window.innerHeight - rect.height - 12, y + 16))}px`;
    },
    hide() {
      APP_STATE.tooltip.hidden = true;
    },
  };
}

function enhanceManualTradePanels() {
  document.querySelectorAll(".manual-trade-form").forEach((form) => {
    const title = form.querySelector("h4");
    const note = form.querySelector(".manual-trade-note");
    if (!title || !note) return;
    if (form.querySelector(".manual-trade-title-row")) {
      note.remove();
      return;
    }

    const row = document.createElement("div");
    row.className = "manual-trade-title-row";
    title.replaceWith(row);
    row.appendChild(title);
    row.appendChild(createInfoChip(note.textContent || ""));
    note.remove();
  });
}

function buildManualShellSelector(agentName) {
  return `[data-agent-key="${panelKey(agentName)}"] .manual-trade-shell`;
}

function captureViewportAnchor(selector) {
  const node = document.querySelector(selector);
  if (!node) return null;
  return {
    selector,
    top: node.getBoundingClientRect().top,
  };
}

function restoreViewportAnchor(anchor) {
  if (!anchor) return;
  window.requestAnimationFrame(() => {
    const node = document.querySelector(anchor.selector);
    if (!node) return;
    const delta = node.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) < 1) return;
    window.scrollTo({
      top: window.scrollY + delta,
      left: window.scrollX,
    });
  });
}

function createInfoChip(text) {
  const chip = document.createElement("span");
  chip.className = "info-chip";
  chip.tabIndex = 0;
  chip.setAttribute("aria-label", "查看说明");
  chip.textContent = "i";

  const popover = document.createElement("span");
  popover.className = "info-popover";
  popover.textContent = text;
  chip.appendChild(popover);
  return chip;
}

function setManualTradeFormDisabled(form, disabled) {
  form.querySelectorAll("input, button").forEach((node) => {
    node.disabled = disabled;
  });
}

function clearManualTradeFeedback(node) {
  if (!node) return;
  node.hidden = true;
  node.textContent = "";
  node.classList.remove("is-error", "is-success");
}

function showManualTradeFeedback(node, message, type = "error") {
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
  node.classList.remove("is-error", "is-success");
  node.classList.add(type === "success" ? "is-success" : "is-error");
}

function renderFatalState(error) {
  const selector = document.getElementById("agent-selector");
  const panels = document.getElementById("agent-panels");
  if (selector) {
    selector.innerHTML = `<article class="panel empty-panel">Agent 注册表读取失败</article>`;
  }
  if (panels) {
    panels.innerHTML = `<article class="panel empty-panel">页面初始化失败：${escapeHtml(error?.message || "未知错误")}</article>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeAgentName(value) {
  return LEGACY_AGENT_NAME_MAP[value] || value;
}

function syncAppVersionBadge() {
  const badge = document.getElementById("app-version");
  if (!badge) return;
  if (!APP_STATE.appVersion) {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }
  badge.hidden = false;
  badge.textContent = `v${APP_STATE.appVersion}`;
}

function updateHeaderTimestamps(panels) {
  const latestDataNode = document.getElementById("latest-data-time");
  const latestAgentNode = document.getElementById("latest-agent-time");
  if (!latestDataNode || !latestAgentNode) return;

  const latestDataTime = pickLatestTimestamp(
    panels.map((panel) => panel.payload?.latest?.checkedAtLocal)
  );
  const latestAgentTime = pickLatestTimestamp(
    panels.map((panel) => panel.payload?.summary?.checkedAtLocal || panel.payload?.latest?.checkedAtLocal)
  );

  latestDataNode.textContent = formatHeaderTimestamp(latestDataTime);
  latestAgentNode.textContent = formatHeaderTimestamp(latestAgentTime);
}

function formatHeaderTimestamp(value) {
  if (!value) return "--";
  const date = parseTime(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return String(value).replaceAll("-", "/");
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function pickLatestTimestamp(values) {
  let latestValue = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const date = parseTime(value);
    const time = date instanceof Date ? date.getTime() : Number.NaN;
    if (Number.isNaN(time)) {
      if (latestValue === null) latestValue = value;
      continue;
    }
    if (time >= latestTime) {
      latestTime = time;
      latestValue = value;
    }
  }
  return latestValue;
}
function buildWriteHeaders() {
  const headers = {};
  if (APP_STATE.security?.writeToken) {
    headers["x-gold-investor-write-token"] = APP_STATE.security.writeToken;
  }
  return headers;
}
