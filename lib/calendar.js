// Month grid for the calendar screen. Weeks start on Sunday (Israel).

import { dayKey } from './time.js';

const DAYS_PER_WEEK = 7;

/**
 * @param {number} year
 * @param {number} month 0-11
 * @returns {{ key: string, day: number, inMonth: boolean }[]} whole weeks covering the month
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / DAYS_PER_WEEK) * DAYS_PER_WEEK;

  return Array.from({ length: totalCells }, (_unused, index) => {
    const date = new Date(year, month, index - leading + 1);
    return { key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
}

/** @returns {{ year: number, month: number }} the month `delta` months away */
export function shiftMonth(year, month, delta) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}
