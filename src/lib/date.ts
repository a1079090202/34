// 本地日期工具：所有「今天」都取自系统本地日期。
// 验收时把系统时间拨到两天后，所有倒计时/闸门自动按新日期计算。

export function todayLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return todayLocal(d);
}

export function addYears(s: string, years: number): string {
  const d = parseDate(s);
  d.setFullYear(d.getFullYear() + years);
  return todayLocal(d);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// 业务可接受的年份区间：驾校数据不可能早于 1900 或晚于 2100，
// 也借此挡掉虽日历合法但无意义的 0000 年。
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
export const MIN_DATE = `${MIN_YEAR}-01-01`;
export const MAX_DATE = `${MAX_YEAR}-12-31`;

function daysInMonth(year: number, month: number): number {
  // Date 的「某日 0 点」= 上月最后一天；month 为 1-12，传 month 即取该月天数
  return new Date(year, month, 0).getDate();
}

/**
 * 严格日历校验：必须是 YYYY-MM-DD 且年月日真实存在。
 * 注意不能用 new Date(y,m-1,d) 的 NaN 判断——JS 会静默进位
 * （2026-02-31 → 03-03、2026-13-01 → 次年 01-01），导致非法日期漏网。
 */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** 严格月份校验：YYYY-MM，月份必须是 01-12（挡 2026-13 / 2026-1）。 */
export function isValidMonth(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = MONTH_RE.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: todayLocal(start), end: todayLocal(end) };
}

export function currentMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
