import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../time.js';
import { calculateAttendanceDay, computeOvertimeMinutes } from './engine.js';
import type { ShiftRuleInput } from './engine.js';

const day = Date.UTC(2026, 2, 15); // 2026-03-15 (UTC midnight, timezone 'UTC')
const at = (hour: number, minute = 0) => day + hour * 60 * MINUTE_MS + minute * MINUTE_MS;
const dayShift: ShiftRuleInput = {
  startTime: '09:00',
  endTime: '17:00',
  graceInMinutes: 5,
  breakMinutes: 30,
};

describe('calculateAttendanceDay', () => {
  it('returns PRESENT for a normal full day', () => {
    const result = calculateAttendanceDay({
      dayStartMs: day,
      shift: dayShift,
      punches: [at(9, 0), at(17, 0)],
    });
    expect(result.status).toBe('PRESENT');
    expect(result.workMinutes).toBe(450); // 8h minus 30m break
    expect(result.lateMinutes).toBe(0);
    expect(result.exceptions).toHaveLength(0);
  });

  it('marks LATE beyond the grace period', () => {
    const result = calculateAttendanceDay({
      dayStartMs: day,
      shift: dayShift,
      punches: [at(9, 10), at(17, 0)],
    });
    expect(result.status).toBe('LATE');
    expect(result.lateMinutes).toBe(5); // 10m after start, 5m grace
  });

  it('does not flag lateness inside the grace period', () => {
    const result = calculateAttendanceDay({
      dayStartMs: day,
      shift: dayShift,
      punches: [at(9, 3), at(17, 0)],
    });
    expect(result.status).toBe('PRESENT');
    expect(result.lateMinutes).toBe(0);
  });

  it('treats a cross-midnight shift as one logical period', () => {
    const overnight: ShiftRuleInput = {
      startTime: '22:00',
      endTime: '06:00',
      crossesMidnight: true,
      graceInMinutes: 5,
    };
    const result = calculateAttendanceDay({
      dayStartMs: day,
      shift: overnight,
      punches: [at(22, 0), at(6, 0) + 86400000],
    });
    expect(result.status).toBe('PRESENT');
    expect(result.workMinutes).toBe(480);
    expect(result.checkOut).toBe(at(6, 0) + 86400000);
  });

  it('returns ABSENT with MISSING_PUNCH when no punches', () => {
    const result = calculateAttendanceDay({ dayStartMs: day, shift: dayShift, punches: [] });
    expect(result.status).toBe('ABSENT');
    expect(result.exceptions.some((e) => e.code === 'MISSING_PUNCH')).toBe(true);
  });

  it('emits MISSING_CHECK_IN / MISSING_CHECK_OUT rather than inventing times', () => {
    const onlyIn = calculateAttendanceDay({ dayStartMs: day, shift: dayShift, punches: [at(9, 0)] });
    expect(onlyIn.exceptions.some((e) => e.code === 'MISSING_CHECK_OUT')).toBe(true);
    expect(onlyIn.workMinutes).toBe(0);

    const onlyOut = calculateAttendanceDay({ dayStartMs: day, shift: dayShift, punches: [at(17, 0)] });
    expect(onlyOut.exceptions.some((e) => e.code === 'MISSING_PUNCH')).toBe(true);
  });

  it('handles holiday, rest day and leave as exempt statuses', () => {
    expect(calculateAttendanceDay({ dayStartMs: day, shift: dayShift, punches: [], isHoliday: true }).status).toBe('HOLIDAY');
    expect(calculateAttendanceDay({ dayStartMs: day, shift: dayShift, punches: [], isRestDay: true }).status).toBe('REST_DAY');
    expect(calculateAttendanceDay({ dayStartMs: day, shift: dayShift, punches: [], isLeave: true }).status).toBe('LEAVE');
  });

  it('returns NO_DATA with presence-only mode when no shift and no punches', () => {
    expect(calculateAttendanceDay({ dayStartMs: day, punches: [] }).status).toBe('NO_DATA');
  });

  it('produces an explainable result for lateness', () => {
    const result = calculateAttendanceDay({
      dayStartMs: day,
      shift: dayShift,
      punches: [at(9, 45), at(17, 0)],
    });
    expect(result.explanation).toContainEqual({ key: 'late', detail: '40 min' });
    expect(result.explanation.some((e) => e.key === 'absent')).toBe(false);
  });
});

describe('computeOvertimeMinutes', () => {
  it('counts pre- and post-shift overtime into 30-minute blocks', () => {
    const result = computeOvertimeMinutes({
      dayStartMs: day,
      shift: dayShift,
      checkIn: at(8, 15),
      checkOut: at(18, 10),
    });
    expect(result.preMinutes).toBe(45);
    expect(result.postMinutes).toBe(70);
    expect(result.blocks).toBe(3); // (45+70)/30 = 3 blocks
    expect(result.eligibleMinutes).toBe(90);
  });

  it('applies the daily cap', () => {
    const result = computeOvertimeMinutes({
      dayStartMs: day,
      shift: dayShift,
      checkIn: at(7, 0),
      checkOut: at(22, 0),
      capDailyMinutes: 120,
    });
    expect(result.eligibleMinutes).toBe(120);
  });

  it('returns zero when within shift bounds', () => {
    const result = computeOvertimeMinutes({
      dayStartMs: day,
      shift: dayShift,
      checkIn: at(9, 0),
      checkOut: at(17, 0),
    });
    expect(result.eligibleMinutes).toBe(0);
  });
});