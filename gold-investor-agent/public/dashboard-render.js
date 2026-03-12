import {
  META_CARD_DEFS,
  RANGE_PRESETS,
  STAT_CARD_DEFS,
  actionLabel,
  currency,
  escapeAttr,
  escapeHtml,
  formatSignedCurrency,
  number,
  panelKey,
} from "./dashboard-config.js";
import { buildPresetWindow, getSeries, renderChart } from "./dashboard-chart.js";

export function renderAgentSelector(agents, selectedAgentNames, handlers) {
  const root = document.getElementById("agent-selector");
  if (!root) return;

  root.innerHTML = agents.map((agent) => {
    const checked = selectedAgentNames.includes(agent.folderName);
    const statusText = agent.autoRunEnabled ? "运行中" : "已停止";
    const buttonText = agent.autoRunEnabled ? "停止" : "启动";
    const buttonAction = agent.autoRunEnabled ? "stop" : "start";
    const netPnl = Number.isFinite(agent.netTotalPnlCny) ? agent.netTotalPnlCny : null;
    const selectorMetrics = [
      ["持有现金", Number.isFinite(agent.cashCny) ? currency.format(agent.cashCny) : "--"],
      ["黄金价值", Number.isFinite(agent.goldMarketValueCny) ? currency.format(agent.goldMarketValueCny) : "--"],
      [
        "成本金价",
        Number.isFinite(agent.averageCostCnyPerGram)
          ? `${currency.format(agent.averageCostCnyPerGram)} / 克`
          : "--",
      ],
    ];
    return `
      <label class="agent-choice ${checked ? "is-selected" : ""}">
        <input type="checkbox" value="${escapeAttr(agent.folderName)}" ${checked ? "checked" : ""}>
        <span class="agent-choice-main">
          <span class="agent-choice-head">
            <strong>${escapeHtml(agent.displayName || agent.folderName)}</strong>
            <span class="agent-choice-finance ${netPnl === null ? "" : netPnl >= 0 ? "up" : "down"}">
              <span class="agent-choice-pnl">
                ${escapeHtml(netPnl === null ? "总净盈亏 --" : `总净盈亏 ${formatSignedCurrency(netPnl)}`)}
              </span>
              <span class="agent-choice-metrics">
                ${selectorMetrics.map(([label, value]) => `
                  <span class="agent-choice-metric">
                    <span class="agent-choice-metric-label">${escapeHtml(label)}</span>
                    <span class="agent-choice-metric-value">${escapeHtml(value)}</span>
                  </span>
                `).join("")}
              </span>
            </span>
          </span>
          <span class="agent-choice-role">${escapeHtml(agent.role || "未填写角色说明")}</span>
        </span>
        <span class="agent-choice-side">
          <span class="agent-choice-status ${agent.autoRunEnabled ? "ready" : "pending"}">${statusText}</span>
          <button type="button" class="agent-toggle-btn" data-agent-action="${buttonAction}" data-agent-name="${escapeAttr(agent.folderName)}">
            ${buttonText}
          </button>
        </span>
      </label>
    `;
  }).join("");

  root.onchange = handlers.onSelectionChange;
  root.onclick = handlers.onActionClick;
}

export function renderAgentPanels(panelStates) {
  const root = document.getElementById("agent-panels");
  if (!root) return;
  if (!panelStates.length) {
    root.innerHTML = `<article class="panel empty-panel">请先在上方选择至少一个 Agent。</article>`;
    return;
  }

  root.innerHTML = panelStates.map((panel) => renderAgentShell(panel)).join("");
}

export function hydrateAgentPanels(panelStates, tooltipApi) {
  const toolbarApi = { update: updateToolbarState };
  for (const panel of panelStates) {
    const shell = document.querySelector(`[data-agent-key="${panelKey(panel.agentName)}"]`);
    if (!shell || panel.missing || !panel.payload) continue;
    renderPanelHeader(shell, panel.payload);
    renderStats(shell, panel.payload.summary);
    setupToolbar(shell, panel, tooltipApi, toolbarApi);
    renderTrades(shell, panel.payload.trades);
    renderStrategy(shell, panel.payload.strategy, panel.payload.strategyHistory);
    setupStrategyToggle(shell, panel);
  }
}

export function rerenderAllCharts(panelStates, tooltipApi) {
  const toolbarApi = { update: updateToolbarState };
  for (const panel of panelStates) {
    if (!panel.payload || panel.missing) continue;
    const shell = document.querySelector(`[data-agent-key="${panelKey(panel.agentName)}"]`);
    if (!shell) continue;
    renderChart(shell, panel, tooltipApi, toolbarApi);
    syncTradePanelLayout(shell);
  }
}

function renderAgentShell(panel) {
  const agent = panel.agent || { folderName: panel.agentName, displayName: panel.agentName, role: "" };
  const latestTime = panel.payload?.latest?.checkedAtLocal || (panel.missing ? "\u6682\u65e0\u6570\u636e" : "\u52a0\u8f7d\u4e2d");
  const lastActionSummary = describeLastAction(panel);
  const statusLabel = agent.autoRunEnabled ? "\u8fd0\u884c\u4e2d" : "\u5df2\u505c\u6b62";

  return `
    <section class="agent-board" data-agent-key="${panelKey(panel.agentName)}">
      <header class="agent-board-head">
        <div class="agent-board-title">
          <p class="eyebrow">Agent Panel</p>
          <h2>${escapeHtml(agent.displayName || agent.folderName)}</h2>
          <p class="agent-role">${escapeHtml(agent.role || "\u672a\u586b\u5199\u89d2\u8272\u8bf4\u660e")}</p>
        </div>
        <aside class="agent-status-panel" aria-label="Agent \u72b6\u6001">
          <div class="agent-status-row">
            <span class="agent-status-label">\u72b6\u6001</span>
            <strong class="agent-status-value">${escapeHtml(statusLabel)}</strong>
          </div>
          <div class="agent-status-row">
            <span class="agent-status-label">\u6700\u65b0\u66f4\u65b0</span>
            <strong class="agent-status-value">${escapeHtml(latestTime)}</strong>
          </div>
          <div class="agent-status-row">
            <span class="agent-status-label">\u672b\u6b21\u64cd\u4f5c</span>
            <strong class="agent-status-value">${escapeHtml(lastActionSummary)}</strong>
          </div>
        </aside>
      </header>
      ${panel.missing || !panel.payload ? renderEmptyAgentBody(panel) : `
        <section class="agent-hero">
          <article class="rule-summary agent-rule-summary"></article>
          ${META_CARD_DEFS.length ? `<div class="hero-meta agent-meta-cards"></div>` : ""}
        </section>
        <section class="stats agent-stats"></section>
        <section class="layout agent-layout">
          <article class="panel chart-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Domestic Gold</p>
                <h3>\u4eba\u6c11\u5e01\u91d1\u4ef7\u66f2\u7ebf</h3>
              </div>
              <div class="legend">
                <span><i class="marker buy"></i>\u4e70\u5165</span>
                <span><i class="marker sell"></i>\u5356\u51fa</span>
                <span><i class="marker ma5"></i>MA5</span>
                <span><i class="marker ma10"></i>MA10</span>
                <span><i class="marker ma20"></i>MA20</span>
                <span><i class="marker ma60"></i>MA60</span>
                <span><i class="marker cost"></i>\u6301\u4ed3\u6210\u672c\u91d1\u4ef7</span>
              </div>
            </div>
            <div class="chart-toolbar"></div>
            <div class="chart-stage">
              <svg class="chart" preserveAspectRatio="xMidYMid meet"></svg>
              <div class="chart-scroll-guard">\u5355\u51fb\u89e3\u9501\u7f29\u653e</div>
            </div>
          </article>
          <aside class="panel trade-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Trades</p>
                <h3>\u4e70\u5356\u8bb0\u5f55</h3>
              </div>
            </div>
            <div class="trade-list"></div>
          </aside>
        </section>
        <section class="panel strategy-panel-shell ${panel.strategyExpanded ? "" : "is-collapsed"}">
          <div class="panel-head strategy-panel-head">
            <div>
              <p class="eyebrow">Strategy</p>
              <h3>\u5f53\u524d\u6295\u8d44\u7b56\u7565</h3>
            </div>
            <button type="button" class="strategy-toggle-btn" aria-expanded="${panel.strategyExpanded ? "true" : "false"}">
              ${panel.strategyExpanded ? "\u6536\u8d77" : "\u5c55\u5f00"}
            </button>
          </div>
          <div class="strategy-panel" ${panel.strategyExpanded ? "" : "hidden"}></div>
        </section>
        ${agent.manualTradingEnabled ? renderManualTradePanel(agent, panel.payload?.manualControls) : ""}
      `}
    </section>
  `;
}

function describeLastAction(panel) {
  if (Array.isArray(panel.payload?.trades)) {
    for (let index = panel.payload.trades.length - 1; index >= 0; index -= 1) {
      const trade = panel.payload.trades[index];
      if (!trade?.action || trade.action === "HOLD") continue;
      const time = trade.checkedAtLocal || "\u65f6\u95f4\u672a\u77e5";
      return `${actionLabel(trade.action)} · ${time}`;
    }
  }

  if (panel.error) return "\u8bfb\u53d6\u5931\u8d25";
  return "\u6682\u65e0\u64cd\u4f5c";
}

function renderManualTradePanel(agent, manualControls = {}) {
  const pendingOrders = Array.isArray(manualControls?.pendingOrders) ? manualControls.pendingOrders : [];
  return `
    <section class="panel manual-trade-shell" data-manual-agent="${escapeAttr(agent.folderName)}">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Manual Trade</p>
          <h3>手动买入卖出</h3>
        </div>
      </div>
      <div class="manual-trade-grid">
        <form class="manual-trade-form" data-manual-action="BUY" data-agent-name="${escapeAttr(agent.folderName)}">
          <h4>手动买入</h4>
          <p class="manual-trade-note">买入不收手续费；超过当前现金时会被拒绝。</p>
          <div class="manual-trade-mode-grid">
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>按黄金克数买入</span>
                <input type="number" name="grams" min="0" step="0.0001" placeholder="例如 1.2500">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="grams">按克数买入</button>
            </div>
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>按人民币金额买入</span>
                <input type="number" name="amountCny" min="0" step="0.01" placeholder="例如 2000">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="amountCny">按金额买入</button>
            </div>
          </div>
          <p class="manual-trade-feedback" hidden></p>
        </form>
        <form class="manual-trade-form" data-manual-action="SELL" data-agent-name="${escapeAttr(agent.folderName)}">
          <h4>手动卖出</h4>
          <p class="manual-trade-note">按金额卖出时，输入的是按当前金价折算的卖出总金额，手续费会另扣。</p>
          <div class="manual-trade-mode-grid">
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>按黄金克数卖出</span>
                <input type="number" name="grams" min="0" step="0.0001" placeholder="例如 1.2500">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="grams">按克数卖出</button>
            </div>
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>按人民币金额卖出</span>
                <input type="number" name="amountCny" min="0" step="0.01" placeholder="例如 2000">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="amountCny">按金额卖出</button>
            </div>
          </div>
          <p class="manual-trade-feedback" hidden></p>
        </form>
      </div>
      <div class="manual-trade-subhead">
        <div>
          <p class="eyebrow">Pending Orders</p>
          <h3>挂单设置</h3>
        </div>
      </div>
      <div class="manual-trade-grid">
        <form class="manual-trade-form pending-order-form" data-pending-action="BUY" data-agent-name="${escapeAttr(agent.folderName)}">
          <h4>挂单买入</h4>
          <p class="manual-trade-note">当实时金价小于或等于你设置的触发价时，自动按指定克数或金额买入。</p>
          <label class="manual-trade-field">
            <span>触发金价（元/克）</span>
            <input type="number" name="triggerPriceCnyPerGram" min="0" step="0.01" placeholder="例如 1138.00">
          </label>
          <div class="manual-trade-mode-grid">
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>触发后按克数买入</span>
                <input type="number" name="grams" min="0" step="0.0001" placeholder="例如 1.0000">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="grams">提交克数挂单</button>
            </div>
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>触发后按金额买入</span>
                <input type="number" name="amountCny" min="0" step="0.01" placeholder="例如 2000">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="amountCny">提交金额挂单</button>
            </div>
          </div>
          <p class="manual-trade-feedback" hidden></p>
        </form>
        <form class="manual-trade-form pending-order-form" data-pending-action="SELL" data-agent-name="${escapeAttr(agent.folderName)}">
          <h4>挂单卖出</h4>
          <p class="manual-trade-note">当实时金价大于或等于你设置的触发价时，自动按指定克数或金额卖出，卖出手续费仍按每克 4 元计算。</p>
          <label class="manual-trade-field">
            <span>触发金价（元/克）</span>
            <input type="number" name="triggerPriceCnyPerGram" min="0" step="0.01" placeholder="例如 1160.00">
          </label>
          <div class="manual-trade-mode-grid">
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>触发后按克数卖出</span>
                <input type="number" name="grams" min="0" step="0.0001" placeholder="例如 1.0000">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="grams">提交克数挂单</button>
            </div>
            <div class="manual-trade-mode-card">
              <label class="manual-trade-field">
                <span>触发后按金额卖出</span>
                <input type="number" name="amountCny" min="0" step="0.01" placeholder="例如 2000">
              </label>
              <button type="submit" class="manual-trade-btn" data-mode="amountCny">提交金额挂单</button>
            </div>
          </div>
          <p class="manual-trade-feedback" hidden></p>
        </form>
      </div>
      <div class="pending-order-list">
        ${pendingOrders.length ? pendingOrders.map((order) => `
          <article class="pending-order-item">
            <div>
              <strong>${escapeHtml(order.action === "BUY" ? "挂单买入" : "挂单卖出")}</strong>
              <p>${escapeHtml(order.mode === "grams" ? `${number.format(order.value || 0)} 克` : `${currency.format(order.value || 0)}`)}，触发价 ${escapeHtml(`${number.format(order.triggerPriceCnyPerGram || 0)} 元/克`)}</p>
              <p>${escapeHtml(order.createdAt || "-")}</p>
            </div>
            <button type="button" class="agent-toggle-btn pending-order-cancel-btn" data-agent-name="${escapeAttr(agent.folderName)}" data-order-id="${escapeAttr(order.id)}">取消挂单</button>
          </article>
        `).join("") : `<p class="empty">当前没有待触发的挂单。</p>`}
      </div>
    </section>
  `;
}

function renderEmptyAgentBody(panel) {
  const agent = panel.agent || { displayName: panel.agentName };
  return `
    <article class="panel agent-empty-panel">
      <h3>${escapeHtml(agent.displayName || panel.agentName)} 暂无可视化数据</h3>
      <p>${escapeHtml(panel.error || "该 Agent 目前还没有生成 dashboard-data.json，启动后就会逐步显示。")}</p>
    </article>
  `;
}

function renderPanelHeader(shell, payload) {
  renderMetaCards(shell, payload);
  renderRuleSummary(shell, payload);
}

function renderMetaCards(shell, payload) {
  const root = shell.querySelector(".agent-meta-cards");
  if (!root) return;
  const hero = root.closest(".agent-hero");
  if (!META_CARD_DEFS.length) {
    root.innerHTML = "";
    root.hidden = true;
    hero?.classList.add("is-single-column");
    return;
  }
  root.hidden = false;
  hero?.classList.remove("is-single-column");
  root.innerHTML = META_CARD_DEFS
    .map((item) => renderCard("meta-card", item.label, item.describe, item.value(payload)))
    .join("");
}

function renderRuleSummary(shell, payload) {
  const root = shell.querySelector(".agent-rule-summary");
  if (!root) return;
  const strategy = payload.strategy || {};
  const summary = [
    `版本：${strategy.version || "-"}`,
    "规则：综合趋势、宏观和高频信号决定目标仓位；只有买入会改变持仓均价，卖出只减少仓位不改均价。",
    "风控：卖出按每克 4 元手续费计入净收入和净盈亏，再平衡会避开过小交易。",
  ];
  root.innerHTML = `
    <p class="eyebrow">Rule Summary</p>
    <h3>交易规则摘要</h3>
    <ul class="rule-summary-list">${summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

function renderStats(shell, summary = {}) {
  const root = shell.querySelector(".agent-stats");
  if (!root) return;
  root.innerHTML = STAT_CARD_DEFS
    .map((item) => renderCard("stat-card", item.label, item.describe, item.value(summary), item.valueClass?.(summary)))
    .join("");
}

function renderCard(className, label, describe, value, valueClass = "") {
  return `
    <article class="${className}">
      <div class="card-label-row">
        <span>${escapeHtml(label)}</span>
        ${buildInfoChip(describe)}
      </div>
      <strong class="${valueClass}">${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function buildInfoChip(text) {
  return `
    <span class="info-chip" tabindex="0" aria-label="查看说明">
      i
      <span class="info-popover">${escapeHtml(text)}</span>
    </span>
  `;
}

function setupToolbar(shell, panel, tooltipApi, toolbarApi) {
  const root = shell.querySelector(".chart-toolbar");
  if (!root) return;
  root.innerHTML = [
    ...RANGE_PRESETS.map((range) => `<button class="chart-btn" data-range="${range}">${range}</button>`),
    `<button class="chart-btn" data-action="reset">重置缩放</button>`,
  ].join("");

  root.onclick = (event) => {
    const button = event.target.closest(".chart-btn");
    if (!button) return;
    const series = getSeries(panel);
    if (!series.length) return;
    if (button.dataset.action === "reset") {
      panel.activeRange = "All";
      panel.window = buildPresetWindow(series, "All");
    } else {
      panel.activeRange = button.dataset.range;
      panel.window = buildPresetWindow(series, button.dataset.range);
    }
    toolbarApi.update(shell, panel);
    renderChart(shell, panel, tooltipApi, toolbarApi);
  };

  toolbarApi.update(shell, panel);
  renderChart(shell, panel, tooltipApi, toolbarApi);
  syncTradePanelLayout(shell);
}

function updateToolbarState(shell, panel) {
  shell.querySelectorAll(".chart-btn").forEach((button) => {
    const isReset = button.dataset.action === "reset";
    const isActive = isReset ? panel.activeRange === "All" : button.dataset.range === panel.activeRange;
    button.classList.toggle("is-active", isActive);
  });
}

function renderTrades(shell, trades) {
  const root = shell.querySelector(".trade-list");
  if (!root) return;
  if (!Array.isArray(trades) || !trades.length) {
    root.innerHTML = `<p class="empty">暂无交易记录。</p>`;
    root.classList.remove("is-scroll-armed", "is-scroll-guarded", "is-fill");
    root.onclick = null;
    root.onmouseleave = null;
    window.requestAnimationFrame(() => syncTradePanelLayout(shell));
    return;
  }

  root.innerHTML = trades.slice().reverse().map((trade) => {
    const pnl = trade.netPnlCny ?? trade.realizedPnlCny;
    const isSell = typeof trade.action === "string" && trade.action.startsWith("SELL");
    const buyCostLine = !isSell && Number.isFinite(trade.postBuyAverageCostCnyPerGram)
      ? renderTradeMeta("买入后成本金价", `${currency.format(trade.postBuyAverageCostCnyPerGram)} / 克`, "计算方式：(原持仓成本金额 + 本次买入金额) ÷ 买入后总克数。只有买入会改变这个成本金价。")
      : "";
    const grossPnlLine = isSell && Number.isFinite(trade.grossPnlCny)
      ? renderTradeMeta("该笔交易盈亏", formatSignedCurrency(trade.grossPnlCny), "计算方式：(卖出金价 - 卖出时成本金价) × 卖出克数。", trade.grossPnlCny >= 0 ? "up" : "down")
      : "";
    const netPnlLine = isSell && Number.isFinite(pnl)
      ? renderTradeMeta("该笔交易净盈亏", formatSignedCurrency(pnl), "计算方式：该笔交易盈亏 - 该笔交易手续费。", pnl >= 0 ? "up" : "down")
      : "";

    return `
      <article class="trade-item ${isSell ? "sell" : "buy"}">
        <header>
          <strong>${escapeHtml(actionLabel(trade.action))}</strong>
          <span>${escapeHtml(trade.checkedAtLocal || "-")}</span>
        </header>
        <div class="trade-meta-grid ${isSell ? "sell-grid" : "buy-grid"}">
          ${isSell ? `
            ${renderTradeMeta("卖出金价", `${currency.format(trade.priceCnyPerGram || 0)} / 克`, "成交卖出单价。")}
            ${renderTradeMeta("卖出时成本金价", `${currency.format(trade.holdingAverageCostCnyPerGram || 0)} / 克`, "卖出前持仓的平均成本金价。卖出不会改变这部分剩余仓位的均价。")}
            ${renderTradeMeta("卖出克数", `${number.format(trade.grams || 0)} 克`, "本次实际卖出的黄金克数。")}
            ${renderTradeMeta("该笔交易卖出金额", currency.format((trade.grossProceedsCny ?? trade.netProceedsCny ?? trade.amountCny) || 0), "计算方式：卖出金价 × 卖出克数。")}
            ${renderTradeMeta("该笔交易成本金额", currency.format(trade.sellCostBasisCny || 0), "计算方式：卖出时成本金价 × 卖出克数。")}
            <div class="trade-meta trade-meta-spacer" aria-hidden="true"></div>
            ${grossPnlLine}
            ${renderTradeMeta("该笔交易手续费", currency.format(trade.sellFeeCny || 0), "计算方式：卖出克数 × 每克 4 元手续费。")}
            ${netPnlLine}
          ` : `
            ${renderTradeMeta("买入金价", `${currency.format(trade.priceCnyPerGram || 0)} / 克`, "成交买入单价。")}
            ${buyCostLine}
            ${renderTradeMeta("买入金额", currency.format(trade.amountCny || 0), "本次实际投入的人民币金额。")}
            ${renderTradeMeta("买入克数", `${number.format(trade.grams || 0)} 克`, "计算方式：买入金额 ÷ 买入金价。")}
          `}
        </div>
        <p class="trade-reason">原因：${escapeHtml(trade.reason || "-")}</p>
      </article>
    `;
  }).join("");

  window.requestAnimationFrame(() => {
    syncTradePanelLayout(shell);
    const scrollable = root.scrollHeight > root.clientHeight + 2;
    root.classList.toggle("is-scroll-guarded", scrollable);
    root.classList.remove("is-scroll-armed");
    root.onclick = scrollable ? () => syncScrollGuard(root, true) : null;
    root.onmouseleave = scrollable ? () => syncScrollGuard(root, false) : null;
    if (scrollable) {
      syncScrollGuard(root, false);
    }
  });
}

function syncTradePanelLayout(shell) {
  const chartPanel = shell.querySelector(".chart-panel");
  const tradePanel = shell.querySelector(".trade-panel");
  const tradeList = shell.querySelector(".trade-list");
  if (!chartPanel || !tradePanel || !tradeList) return;

  const chartRect = chartPanel.getBoundingClientRect();
  const tradeRect = tradePanel.getBoundingClientRect();
  const isSideAligned = tradeRect.top < chartRect.bottom - 24;

  tradePanel.classList.toggle("is-side-aligned", isSideAligned);
  tradePanel.classList.toggle("is-stacked", !isSideAligned);
  tradePanel.style.height = "";
  tradeList.style.height = "";
  tradeList.style.maxHeight = "";
  tradeList.classList.remove("is-fill");

  if (!isSideAligned) {
    tradeList.style.maxHeight = "292px";
    return;
  }

  const chartHeight = Math.round(chartRect.height);
  if (chartHeight > 0) {
    tradePanel.style.height = `${chartHeight}px`;
  }

  const availableHeight = Math.floor(tradePanel.getBoundingClientRect().bottom - tradeList.getBoundingClientRect().top);
  if (availableHeight > 0) {
    tradeList.style.height = `${availableHeight}px`;
    tradeList.style.maxHeight = `${availableHeight}px`;
  }

  if (tradeList.querySelectorAll(".trade-item").length <= 2) {
    tradeList.classList.add("is-fill");
  }
}

function renderTradeMeta(label, value, explain, valueClass = "") {
  return `
    <div class="trade-meta" tabindex="0" data-tip="${escapeAttr(explain || "")}">
      <span>${escapeHtml(label)}</span>
      <strong class="${valueClass}">${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function syncScrollGuard(root, enabled) {
  root.dataset.scrollArmed = enabled ? "true" : "false";
  root.classList.toggle("is-scroll-armed", enabled);
}

function renderStrategy(shell, strategy, strategyHistory) {
  const root = shell.querySelector(".strategy-panel");
  if (!root || !strategy) return;
  const currentVersion = strategyHistory?.versions?.find((item) => item.version === strategy.version) || null;
  const changes = currentVersion?.changesZh || currentVersion?.changes || [];
  const buyRules = strategy.buyRuleZh || strategy.buyRule || [];
  const sellRules = strategy.sellRuleZh || strategy.sellRule || [];
  const scoreRules = strategy.scoreMethodZh || strategy.scoreMethod || [];
  const scoreTitle = strategy.scoreMethodTitleZh || strategy.scoreMethodTitle || "综合评分计算方式";

  root.innerHTML = `
    <div class="strategy-grid">
      <article class="strategy-card strategy-overview">
        <div class="strategy-meta">
          <span class="strategy-badge">${escapeHtml(strategy.version || "-")}</span>
          <span class="strategy-time">创建时间：${escapeHtml(currentVersion?.createdAt || strategy.createdAt || "-")}</span>
          <span class="strategy-time">最近更新：${escapeHtml(currentVersion?.updatedAt || strategy.createdAt || "-")}</span>
        </div>
        <h3>${escapeHtml(strategy.nameZh || strategy.name || "当前策略")}</h3>
        <p class="strategy-desc">${escapeHtml(strategy.descriptionZh || strategy.description || "-")}</p>
      </article>
      <article class="strategy-card">
        <h3>买入条件</h3>
        <ul class="strategy-list">${buyRules.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="strategy-card">
        <h3>卖出条件</h3>
        <ul class="strategy-list">${sellRules.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="strategy-card">
        <h3>本版更新说明</h3>
        <ul class="strategy-list">${changes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        <p class="strategy-reason">${escapeHtml(currentVersion?.reasonZh || currentVersion?.reason || "-")}</p>
      </article>
      <article class="strategy-card">
        <h3>${escapeHtml(scoreTitle)}</h3>
        <ul class="strategy-list">${scoreRules.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    </div>
  `;
}

function setupStrategyToggle(shell, panel) {
  const button = shell.querySelector(".strategy-toggle-btn");
  const content = shell.querySelector(".strategy-panel");
  const container = shell.querySelector(".strategy-panel-shell");
  if (!button || !content || !container) return;

  const sync = () => {
    const expanded = Boolean(panel.strategyExpanded);
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    button.textContent = expanded ? "收起" : "展开";
    content.hidden = !expanded;
    container.classList.toggle("is-collapsed", !expanded);
  };

  button.onclick = () => {
    panel.strategyExpanded = !panel.strategyExpanded;
    sync();
  };

  sync();
}
