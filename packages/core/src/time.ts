export const MINUTE_MS = 60_000;

export function parseTimeToMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Invalid time "${time}", expected HH:mm`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function clampMinutes(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Returns the UTC epoch ms of local midnight for `date` (YYYY-MM-DD) in the
 * given IANA timezone. Falls back to treating the date as UTC when the
 * timezone offset cannot be resolved, keeping the engine deterministic.
 */
export function localMidnightUtcMs(date: string, timezone: string): number {
  const utcMidnight = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(utcMidnight)) throw new Error(`Invalid date "${date}"`);
  const offset = tzOffsetMs(new Date(utcMidnight), timezone);
  return utcMidnight - offset;
}

export function tzOffsetMs(dt: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(dt).map((p) => [p.type, p.value]),
    );
    const hour = parts.hour === '24' ? '00' : (parts.hour ?? '00');
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return asUTC - dt.getTime();
  } catch {
    return 0;
  }
}

/** Normalizes an end-of-shift minute value that crosses midnight to be > start. */
export function normalizeShiftMinutes(start: number, end: number): { start: number; end: number } {
  return { start, end: end <= start ? end + 1440 : end };
}

export function minutesBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / MINUTE_MS));
}