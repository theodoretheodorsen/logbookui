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

// The 1st of the month `monthsAgo` months before `dateStr`'s month. Zeroes
// the day out *before* shifting months (unlike addMonthsUtc above) so a
// 31st never overflows into the wrong month - e.g. Jan 31 minus 1 month
// must land on Dec 1, not silently normalize forward into February.
export function monthsAgoUtc(dateStr, monthsAgo) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
}

// Last calendar day of the month that `monthStartDateStr` (any date within
// it, though callers pass the 1st) falls in.
export function endOfMonthUtc(monthStartDateStr) {
  const d = new Date(`${monthStartDateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0); // the day before the 1st of next month
  return d.toISOString().slice(0, 10);
}

// "July 2026" - locale/timezone pinned so it's always this, regardless of
// the pilot's browser locale or timezone (this app's dates are all UTC).
export function monthLabelUtc(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
