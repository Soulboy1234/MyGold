export const RANGE_PRESETS = ["1H", "2H", "4H", "6H", "12H", "1D", "2D", "1M", "3M", "6M", "1Y", "All"];
export const AUTO_REFRESH_MS = 15000;
export const SELECTION_STORAGE_KEY = "gold-investor:selected-agents";

export const ACTION_LABELS = {
  BUY: "买入",
  BUY_MORE: "加仓",
  SELL_PART: "减仓",
  SELL_ALL: "清仓",
  HOLD: "持有",
};

export const MA_WINDOWS = [
  { key: "ma5", label: "MA5", color: "#2563eb", days: 5 },
  { key: "ma10", label: "MA10", color: "#0f766e", days: 10 },
  { key: "ma20", label: "MA20", color: "#7c3aed", days: 20 },
  { key: "ma60", label: "MA60", color: "#d97706", days: 60 },
];

export const META_CARD_DEFS = [];

export const STAT_CARD_DEFS = [
  {
    label: "持仓黄金价值",
    describe: "当前持有黄金按卖出后价格估算的可变现金额。",
    value: (summary) => currency.format(summary.goldMarketValueCny || 0),
  },
  {
    label: "现金",
    describe: "当前尚未投入黄金的人民币余额。",
    value: (summary) => currency.format(summary.cashCny || 0),
  },
  {
    label: "持有黄金克数",
    describe: "当前账户持有的黄金克数。",
    value: (summary) => `${number.format(summary.goldGrams || 0)} 克`,
  },
  {
    label: "组合权益",
    describe: "当前账户总价值。计算方式：现金 + 黄金可变现市值。",
    value: (summary) => currency.format(summary.equityCny || 0),
  },
  {
    label: "持有金价",
    describe: "当前持仓的平均买入金价。计算方式：持仓成本 ÷ 持有克数。",
    value: (summary) => summary.goldGrams > 0 && Number.isFinite(summary.averageCostCnyPerGram)
      ? `${currency.format(summary.averageCostCnyPerGram)} / 克`
      : "-",
  },
  {
    label: "总手续费",
    describe: "累计已实际支付的卖出手续费。计算方式：所有卖出克数 × 每克 4 元。",
    value: (summary) => currency.format(summary.totalFeesCny || 0),
  },
  {
    label: "实时金价",
    describe: "最新一笔国内金价快照，对应图表尾部价格。",
    value: (summary) => Number.isFinite(summary.currentPriceCnyPerGram)
      ? `${currency.format(summary.currentPriceCnyPerGram)} / 克`
      : "-",
  },
  {
    label: "总净盈亏",
    describe: "相对初始本金的累计净盈亏。计算方式：组合权益 - 初始本金；黄金部分已按卖出后价格估值，已包含手续费影响。",
    value: (summary) => formatSignedCurrency(summary.netTotalPnlCny ?? summary.totalPnlCny ?? 0),
    valueClass: (summary) => (summary.netTotalPnlCny ?? summary.totalPnlCny ?? 0) >= 0 ? "up" : "down",
  },
];

export const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 2,
});

export const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

export function actionLabel(action) {
  return ACTION_LABELS[action] || action || "-";
}

export function formatSignedCurrency(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${currency.format(Math.abs(value))}`;
}

export function parseTime(value) {
  if (typeof value !== "string") return new Date(Number.NaN);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return new Date(value.replace(" ", "T"));
  if (/^\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    const [datePart, timePart] = value.split(" ");
    const [year, month, day] = datePart.split("/");
    return new Date(`${year}-${pad2(month)}-${pad2(day)}T${timePart}`);
  }
  return new Date(value);
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

export function panelKey(agentName) {
  return encodeURIComponent(agentName);
}

export function normalizeWindow(windowState, total) {
  if (!windowState) return { start: 0, end: Math.max(0, total - 1) };
  const maxIndex = Math.max(0, total - 1);
  let start = clamp(Number.isFinite(windowState.start) ? windowState.start : 0, 0, maxIndex);
  let end = clamp(Number.isFinite(windowState.end) ? windowState.end : maxIndex, 0, maxIndex);
  if (end < start) [start, end] = [end, start];
  if (end - start < 12 && total > 12) end = Math.min(maxIndex, start + 12);
  return { start, end };
}
