import { MINUTE_MS, minutesBetween, parseTimeToMinutes } from '../time.js';

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'REST_DAY'
  | 'NO_DATA';

export interface ShiftRuleInput {
  startTime: string;
  endTime: string;
  crossesMidnight?: boolean;
  graceInMinutes?: number;
  graceOutMinutes?: number;
  breakMinutes?: number;
  lateAllowedMinutes?: number;
  earlyLeaveAllowedMinutes?: number;
  requiredHoursMinutes?: number;
  isFlexible?: boolean;
  restDay?: boolean;
}

export interface AttendanceExceptionResult {
  code:
    | 'MISSING_CHECK_IN'
    | 'MISSING_CHECK_OUT'
    | 'MISSING_PUNCH'
    | 'LATE'
    | 'EARLY_LEAVE'
    | 'EXCEEDS_LATE_ALLOWANCE';
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export interface ExplanationEntry {
  key: string;
  detail?: string;
}

export interface AttendanceDayInput {
  /** UTC epoch ms of local midnight for the attendance date. */
  dayStartMs: number;
  shift?: ShiftRuleInput | null;
  /** Timestamps (epoch ms) already assigned to this day, sorted ascending. */
  punches: number[];
  isHoliday?: boolean;
  isRestDay?: boolean;
  isLeave?: boolean;
}

export interface AttendanceDayResult {
  status: AttendanceStatus;
  checkIn: number | null;
  checkOut: number | null;
  workMinutes: number;
  requiredMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  breaksMinutes: number;
  exceptions: AttendanceExceptionResult[];
  explanation: ExplanationEntry[];
}

export interface OvertimeResult {
  preMinutes: number;
  postMinutes: number;
  eligibleMinutes: number;
  blocks: number;
  blockMinutes: number;
}

export interface OvertimeInput {
  dayStartMs: number;
  shift: ShiftRuleInput;
  checkIn: number | null;
  checkOut: number | null;
  minBlockMinutes?: number;
  preAllowed?: boolean;
  postAllowed?: boolean;
  capDailyMinutes?: number;
}

export function calculateAttendanceDay(input: AttendanceDayInput): AttendanceDayResult {
  const punches = [...input.punches].sort((a, b) => a - b);

  if (input.isLeave) {
    return { ...empty(), status: 'LEAVE', explanation: [{ key: 'leave' }] };
  }
  if (input.isHoliday) {
    return { ...empty(), status: 'HOLIDAY', explanation: [{ key: 'holiday' }] };
  }
  if (input.isRestDay) {
    return { ...empty(), status: 'REST_DAY', explanation: [{ key: 'rest_day' }] };
  }

  if (!input.shift) {
    return presenceOnly(punches);
  }

  const shift = input.shift;
  const startMin = parseTimeToMinutes(shift.startTime);
  const rawEnd = parseTimeToMinutes(shift.endTime);
  const endMin = rawEnd <= startMin ? rawEnd + 1440 : rawEnd;
  const graceIn = shift.graceInMinutes ?? 0;
  const graceOut = shift.graceOutMinutes ?? 0;
  const breaks = shift.breakMinutes ?? 0;
  const lateAllowed = shift.lateAllowedMinutes ?? 0;
  const earlyAllowed = shift.earlyLeaveAllowedMinutes ?? 0;

  const windowStart = input.dayStartMs + startMin * MINUTE_MS;
  const windowEnd = input.dayStartMs + endMin * MINUTE_MS;

  const inWindow = punches.filter((p) => p >= windowStart && p <= windowEnd);
  let checkIn: number | null = inWindow.length > 0 ? inWindow[0]! : null;
  let checkOut: number | null = inWindow.length > 1 ? inWindow[inWindow.length - 1]! : null;

  const exceptions: AttendanceExceptionResult[] = [];
  const explanation: ExplanationEntry[] = [
    { key: 'shift', detail: `${shift.startTime}–${shift.endTime}` },
  ];

  if (inWindow.length === 0) {
    exceptions.push({ code: 'MISSING_PUNCH', severity: 'ERROR', message: 'No punches recorded within the shift window' });
    return { ...empty(), status: 'ABSENT', exceptions, explanation: [{ key: 'absent' }, ...explanation] };
  }
  if (inWindow.length === 1) {
    // A single punch is classified by whether it lands in the first or second
    // half of the shift window; the missing side is reported explicitly
    // instead of inventing a timestamp (ATTENDANCE_CALCULATION.md).
    const midpoint = windowStart + (windowEnd - windowStart) / 2;
    if (inWindow[0]! >= midpoint) {
      checkIn = null;
      checkOut = inWindow[0]!;
      exceptions.push({ code: 'MISSING_PUNCH', severity: 'WARNING', message: 'Only one punch present and it is a check-out; check-in missing' });
    } else {
      exceptions.push({ code: 'MISSING_CHECK_OUT', severity: 'WARNING', message: 'Missing check-out; duration cannot be computed' });
    }
  } else if (checkIn === null) {
    exceptions.push({ code: 'MISSING_PUNCH', severity: 'ERROR', message: 'Missing check-in' });
  } else if (checkOut === null) {
    exceptions.push({ code: 'MISSING_CHECK_OUT', severity: 'WARNING', message: 'Missing check-out; duration cannot be computed' });
  }

  const lateMinutes = checkIn !== null ? Math.max(0, minutesBetween(windowStart + graceIn * MINUTE_MS, checkIn)) : 0;
  const earlyLeaveMinutes =
    checkOut !== null ? Math.max(0, minutesBetween(checkOut, windowEnd - graceOut * MINUTE_MS)) : 0;

  if (lateMinutes > 0) {
    exceptions.push({ code: 'LATE', severity: 'WARNING', message: `Check-in ${lateMinutes} minutes after grace period` });
    if (lateMinutes > lateAllowed) {
      exceptions.push({
        code: 'EXCEEDS_LATE_ALLOWANCE',
        severity: 'ERROR',
        message: `Late by ${lateMinutes} minutes, exceeding the allowed ${lateAllowed} minutes`,
      });
    }
  }
  if (earlyLeaveMinutes > 0 && earlyLeaveMinutes > earlyAllowed) {
    exceptions.push({ code: 'EARLY_LEAVE', severity: 'WARNING', message: `Left ${earlyLeaveMinutes} minutes early` });
  }

  let workMinutes = 0;
  if (checkIn !== null && checkOut !== null) {
    workMinutes = Math.max(0, minutesBetween(checkIn, checkOut) - breaks);
  }

  const requiredMinutes = shift.requiredHoursMinutes ?? Math.max(0, endMin - startMin - breaks);
  const overtime = computeOvertimeMinutes({ dayStartMs: input.dayStartMs, shift, checkIn, checkOut });

  const status: AttendanceStatus = lateMinutes > 0 ? 'LATE' : 'PRESENT';
  if (lateMinutes > 0) explanation.push({ key: 'late', detail: `${lateMinutes} min` });
  if (earlyLeaveMinutes > 0) explanation.push({ key: 'early_leave', detail: `${earlyLeaveMinutes} min` });
  if (overtime.eligibleMinutes > 0) explanation.push({ key: 'overtime', detail: `${overtime.eligibleMinutes} min` });

  return {
    status,
    checkIn,
    checkOut,
    workMinutes,
    requiredMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes: overtime.eligibleMinutes,
    breaksMinutes: breaks,
    exceptions,
    explanation,
  };
}

export function computeOvertimeMinutes(input: OvertimeInput): OvertimeResult {
  const shift = input.shift;
  const startMin = parseTimeToMinutes(shift.startTime);
  const rawEnd = parseTimeToMinutes(shift.endTime);
  const endMin = rawEnd <= startMin ? rawEnd + 1440 : rawEnd;
  const block = input.minBlockMinutes ?? 30;
  const windowStart = input.dayStartMs + startMin * MINUTE_MS;
  const windowEnd = input.dayStartMs + endMin * MINUTE_MS;
  const maxBlocks = Math.floor((input.capDailyMinutes ?? 240) / block);

  let preMinutes = 0;
  let postMinutes = 0;
  if (input.checkIn !== null && input.checkIn < windowStart && input.preAllowed !== false) {
    preMinutes = minutesBetween(input.checkIn, windowStart);
  }
  if (input.checkOut !== null && input.checkOut > windowEnd) {
    if (input.postAllowed !== false) postMinutes = minutesBetween(windowEnd, input.checkOut);
  }

  const raw = preMinutes + postMinutes;
  const blocks = Math.min(Math.floor(raw / block), maxBlocks);
  const blockMinutes = blocks * block;

  return { preMinutes, postMinutes, eligibleMinutes: blockMinutes, blocks, blockMinutes };
}

function presenceOnly(punches: number[]): AttendanceDayResult {
  if (punches.length === 0) {
    return { ...empty(), status: 'NO_DATA', explanation: [{ key: 'no_data' }] };
  }
  const checkIn = punches[0]!;
  const checkOut = punches[punches.length - 1]!;
  const exceptions: AttendanceExceptionResult[] = [];
  if (checkIn === checkOut) {
    exceptions.push({ code: 'MISSING_PUNCH', severity: 'WARNING', message: 'Only one side of the punch pair is present' });
  }
  return {
    ...empty(),
    status: 'PRESENT',
    checkIn,
    checkOut,
    workMinutes: checkIn === checkOut ? 0 : minutesBetween(checkIn, checkOut),
    exceptions,
    explanation: [{ key: 'presence_only' }],
  };
}

function empty(): AttendanceDayResult {
  return {
    status: 'NO_DATA',
    checkIn: null,
    checkOut: null,
    workMinutes: 0,
    requiredMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    breaksMinutes: 0,
    exceptions: [],
    explanation: [],
  };
}