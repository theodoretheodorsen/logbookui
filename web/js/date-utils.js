export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysUtc(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonthsUtc(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function startOfYearUtc(dateStr) {
  return `${dateStr.slice(0, 4)}-01-01`;
}
