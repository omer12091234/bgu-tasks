// Time helpers for the task list: when is a task due and how long is left.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const URGENT_WINDOW_MS = DAY_MS;      // red: due within a day
const SOON_WINDOW_MS = 3 * DAY_MS;    // amber: due within three days
const DEFAULT_DUE_HOUR = 23;
const DEFAULT_DUE_MINUTE = 59;

/**
 * @param {object} row a submissions row
 * @returns {number|null} due time in epoch ms, or null when unknown
 */
export function dueTime(row) {
  if (row.due_at) {
    const ms = Date.parse(row.due_at);
    if (!Number.isNaN(ms)) return ms;
  }
  // Rows written by the old dashboard scrape only have dd/mm/yyyy + HH:MM.
  const parts = String(row.event_date || '').split('/').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [day, month, year] = parts;
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(row.event_time || '').trim());
  const hour = timeMatch ? Number(timeMatch[1]) : DEFAULT_DUE_HOUR;
  const minute = timeMatch ? Number(timeMatch[2]) : DEFAULT_DUE_MINUTE;
  const ms = new Date(year, month - 1, day, hour, minute).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function plural(count, one, two, many) {
  if (count === 1) return one;
  if (count === 2) return two;
  return `${count} ${many}`;
}

function span(ms) {
  if (ms < HOUR_MS) return plural(Math.max(1, Math.round(ms / MINUTE_MS)), 'דקה', 'שתי דקות', 'דקות');
  if (ms < 2 * DAY_MS) return plural(Math.round(ms / HOUR_MS), 'שעה', 'שעתיים', 'שעות');
  return plural(Math.round(ms / DAY_MS), 'יום', 'יומיים', 'ימים');
}

/**
 * @param {number|null} dueMs
 * @param {number} nowMs
 * @returns {{ text: string, level: 'overdue'|'urgent'|'soon'|'calm'|'unknown' }}
 */
export function countdown(dueMs, nowMs) {
  if (dueMs == null) return { text: 'ללא מועד', level: 'unknown' };
  const left = dueMs - nowMs;
  if (left <= 0) return { text: `באיחור של ${span(-left)}`, level: 'overdue' };
  const text = `עוד ${span(left)}`;
  if (left <= URGENT_WINDOW_MS) return { text, level: 'urgent' };
  if (left <= SOON_WINDOW_MS) return { text, level: 'soon' };
  return { text, level: 'calm' };
}

const dayFormatter = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormatter = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** @returns {string} e.g. "יום שבת, 21 בנובמבר · 23:59" */
export function formatDue(dueMs) {
  if (dueMs == null) return '';
  const date = new Date(dueMs);
  return `${dayFormatter.format(date)} · ${timeFormatter.format(date)}`;
}

/** @returns {string} local calendar-day key, yyyy-mm-dd */
export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const EVENING_HOUR = 20;
const QUICK_SOON_MS = 2 * HOUR_MS;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})/;

/**
 * Join the values of a date field (yyyy-mm-dd) and a time field (HH:MM)
 * into one local moment. Without a time, the end of that day is used.
 * @returns {number|null} epoch ms, or null when there is no usable date
 */
export function combineDateTime(dateValue, timeValue) {
  const date = DATE_PATTERN.exec(String(dateValue || ''));
  if (!date) return null;
  const time = TIME_PATTERN.exec(String(timeValue || ''));
  const hour = time ? Number(time[1]) : DEFAULT_DUE_HOUR;
  const minute = time ? Number(time[2]) : DEFAULT_DUE_MINUTE;
  const ms = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), hour, minute).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** @returns {{ date: string, time: string }} values for a date field and a time field */
export function toDateTimeFields(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: dayKey(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}

/**
 * One-tap deadlines for a new task; only ones still ahead of `nowMs`.
 * @returns {{ label: string, ms: number }[]}
 */
export function quickDueOptions(nowMs) {
  const now = new Date(nowMs);
  const at = (daysAhead, hour, minute) => new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, hour, minute,
  ).getTime();

  return [
    { label: 'בעוד שעתיים', ms: nowMs + QUICK_SOON_MS },
    { label: 'הערב', ms: at(0, EVENING_HOUR, 0) },
    { label: 'מחר בערב', ms: at(1, EVENING_HOUR, 0) },
    { label: 'בעוד שבוע', ms: at(7, DEFAULT_DUE_HOUR, DEFAULT_DUE_MINUTE) },
  ].filter((option) => option.ms > nowMs);
}
