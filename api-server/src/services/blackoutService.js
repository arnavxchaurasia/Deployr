'use strict';

/**
 * Checks whether `now` falls inside one of the project's configured
 * blackout windows. Windows are recurring weekly, in UTC, defined as
 * { day: 0-6 (Sun-Sat), startMinute: 0-1439, endMinute: 0-1439 }.
 * A window where endMinute < startMinute wraps past midnight (e.g. Friday
 * 22:00 -> Saturday 02:00 is expressed as day:5, startMinute:1320, endMinute:120).
 *
 * @param {{ blackoutWindows?: any }} project
 * @param {Date} [now]
 * @returns {{ blocked: boolean, window?: object }}
 */
function checkBlackout(project, now = new Date()) {
  const windows = project?.blackoutWindows;
  if (!Array.isArray(windows) || windows.length === 0) {
    return { blocked: false };
  }

  const day = now.getUTCDay();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();

  for (const w of windows) {
    if (typeof w?.day !== 'number' || typeof w?.startMinute !== 'number' || typeof w?.endMinute !== 'number') continue;

    if (w.startMinute <= w.endMinute) {
      // Same-day window
      if (day === w.day && minute >= w.startMinute && minute < w.endMinute) {
        return { blocked: true, window: w };
      }
    } else {
      // Wraps past midnight — spans two calendar days
      const nextDay = (w.day + 1) % 7;
      const inFirstHalf = day === w.day && minute >= w.startMinute;
      const inSecondHalf = day === nextDay && minute < w.endMinute;
      if (inFirstHalf || inSecondHalf) {
        return { blocked: true, window: w };
      }
    }
  }

  return { blocked: false };
}

module.exports = { checkBlackout };
