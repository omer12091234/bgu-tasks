// Build an .ics calendar file for one task, so it can be added to the
// iPhone calendar. The event ends at the deadline and carries a reminder.

import { dueTime } from './time.js';
import { courseName } from './tasks.js';

const EVENT_LENGTH_MS = 30 * 60 * 1000;
const REMINDER_BEFORE = '-PT24H';
const MAX_LINE_BYTES = 73; // RFC 5545 allows 75 octets; leave room for the fold
const encoder = new TextEncoder();

function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

// Long lines must be folded: a line break followed by one space. Fold on
// byte length, since Hebrew letters take two bytes each.
function fold(line) {
  const pieces = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > MAX_LINE_BYTES) {
      pieces.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  pieces.push(current);
  return pieces.join('\r\n ');
}

/**
 * @param {object} row a submissions row
 * @param {number} nowMs
 * @returns {string|null} .ics file content, or null when the task has no due time
 */
export function buildIcs(row, nowMs) {
  const due = dueTime(row);
  if (due == null) return null;
  const course = courseName(row);
  const description = [course, row.link].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BGU Tasks//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${row.id}@bgu-tasks`,
    `DTSTAMP:${utcStamp(nowMs)}`,
    `DTSTART:${utcStamp(due - EVENT_LENGTH_MS)}`,
    `DTEND:${utcStamp(due)}`,
    `SUMMARY:${escapeText(`הגשה: ${row.name}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(row.link ? [`URL:${row.link}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`הגשה מחר: ${row.name}`)}`,
    `TRIGGER:${REMINDER_BEFORE}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** @returns {string} a safe file name for the task's .ics download */
export function icsFileName(row) {
  const base = String(row.name || 'task').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `${base || 'task'}.ics`;
}
