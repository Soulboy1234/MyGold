function parseLocalDateTime(value) {
  const match = String(value || "").trim().match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || 0),
    minute: Number(match[5] || 0),
    second: Number(match[6] || 0),
  };
}

export function getWeekendTradingWindowStatus(checkedAtLocal) {
  const parts = parseLocalDateTime(checkedAtLocal);
  if (!parts) {
    return {
      blocked: false,
      decisionKind: "trading-window-open",
      reason: "",
    };
  }

  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const minutes = parts.hour * 60 + parts.minute;
  const blocked =
    (weekday === 6 && minutes >= 2 * 60) ||
    weekday === 0 ||
    (weekday === 1 && minutes < 9 * 60);

  return {
    blocked,
    decisionKind: blocked ? "weekend-closed" : "trading-window-open",
    reason: blocked
      ? "当前处于周末禁交易窗口（北京时间周六 02:00 至周一 09:00），本次不执行交易。"
      : "",
  };
}
