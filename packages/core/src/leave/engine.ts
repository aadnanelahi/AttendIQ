export type AccrualFrequency = 'MONTHLY' | 'YEARLY' | 'SERVICE_YEAR';

export interface LeavePolicyInput {
  accrualFrequency: AccrualFrequency;
  accrualAmount: number;
  accrualUnit?: 'DAYS' | 'HOURS';
  proRated?: boolean;
  carryoverLimit?: number;
  maxBalance?: number | null;
  anniversaryBasis?: boolean;
}

export interface LeaveBalanceInput {
  policy: LeavePolicyInput;
  joinDate: string; // YYYY-MM-DD
  asOfDate: string; // YYYY-MM-DD (inclusive)
  openingBalance?: number;
  usedSoFar?: number;
  carryoverFromPrev?: number;
}

export interface LeaveBalanceResult {
  openingBalance: number;
  accrued: number;
  used: number;
  carryover: number;
  remaining: number;
  nextAccrualDate: string | null;
}

export interface LeaveUsageInput {
  balance: number;
  requestedDays: number;
  policy: LeavePolicyInput;
}

/** Inclusive number of days in [from,to]. */
export function leaveDaysCount(from: string, to: string, halfDay = false): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error(`Invalid leave range ${from}..${to}`);
  }
  const days = Math.floor((end - start) / 86_400_000) + 1;
  return halfDay ? Math.max(days - 0.5, 0.5) : days;
}

export function computeLeaveBalance(input: LeaveBalanceInput): LeaveBalanceResult {
  const policy = input.policy;
  const openingBalance = input.openingBalance ?? 0;
  const used = input.usedSoFar ?? 0;
  const carryoverLimit = policy.carryoverLimit ?? 0;
  const carryover = Math.min(input.carryoverFromPrev ?? 0, carryoverLimit);

  const accrued =
    policy.accrualFrequency === 'MONTHLY'
      ? computeMonthlyAccrual(input.joinDate, input.asOfDate, policy.accrualAmount, policy.proRated !== false)
      : computeAnniversaryAccrual(input.joinDate, input.asOfDate, policy.accrualAmount, policy.accrualFrequency === 'YEARLY');

  let gross = openingBalance + accrued + carryover;
  if (policy.maxBalance != null) gross = Math.min(gross, policy.maxBalance);

  const remaining = Math.max(0, gross - used);

  return {
    openingBalance,
    accrued: round2(accrued),
    used,
    carryover,
    remaining: round2(remaining),
    nextAccrualDate: nextAccrualDate(input.joinDate, input.asOfDate, policy.accrualFrequency),
  };
}

export function validateLeaveUsage(input: LeaveUsageInput): { ok: true } | { ok: false; reason: string } {
  if (input.requestedDays <= 0) return { ok: false, reason: 'Requested leave must be positive' };
  if (input.requestedDays > input.balance) {
    return { ok: false, reason: `Insufficient balance: ${round2(input.balance)} available, ${input.requestedDays} requested` };
  }
  return { ok: true };
}

function computeMonthlyAccrual(join: string, asOf: string, amount: number, proRated: boolean): number {
  const joinDate = dateUTC(join);
  const asOfDate = dateUTC(asOf);
  if (!joinDate || !asOfDate || asOfDate < joinDate) return 0;

  let accrual = 0;

  const joinMonthEnd = new Date(Date.UTC(joinDate.getUTCFullYear(), joinDate.getUTCMonth() + 1, 0));
  if (asOfDate >= joinMonthEnd) {
    const dim = daysInMonthUTC(joinDate.getUTCFullYear(), joinDate.getUTCMonth());
    const daysEligible = dim - joinDate.getUTCDate() + 1;
    accrual += proRated ? (amount * daysEligible) / dim : amount;
  }

  let cursor = new Date(Date.UTC(joinDate.getUTCFullYear(), joinDate.getUTCMonth() + 1, 1));
  while (cursor <= asOfDate) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    if (monthEnd <= asOfDate) accrual += amount;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return accrual;
}

function computeAnniversaryAccrual(join: string, asOf: string, amount: number, calendarYear: boolean): number {
  const joinDate = dateUTC(join);
  const asOfDate = dateUTC(asOf);
  if (!joinDate || !asOfDate || asOfDate < joinDate) return 0;

  let anniversaries = 0;
  if (calendarYear) {
    for (let y = joinDate.getUTCFullYear() + 1; y <= asOfDate.getUTCFullYear(); y++) {
      const anniversary = new Date(Date.UTC(y, joinDate.getUTCMonth(), joinDate.getUTCDate()));
      if (anniversary <= asOfDate) anniversaries++;
    }
  } else {
    let year = joinDate.getUTCFullYear() + 1;
    while (true) {
      const anniversary = new Date(Date.UTC(year, joinDate.getUTCMonth(), joinDate.getUTCDate()));
      if (anniversary > asOfDate) break;
      anniversaries++;
      year++;
    }
  }
  return anniversaries * amount;
}

function nextAccrualDate(join: string, asOf: string, frequency: AccrualFrequency): string | null {
  const joinDate = dateUTC(join);
  const asOfDate = dateUTC(asOf);
  if (!joinDate || !asOfDate) return null;

  if (frequency === 'MONTHLY') {
    const currentMonthEnd = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() + 1, 0));
    const next = currentMonthEnd > asOfDate ? currentMonthEnd : new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() + 1, 0));
    return toISO(next);
  }

  let year = asOfDate.getUTCFullYear() + 1;
  const anniversary = new Date(Date.UTC(year, joinDate.getUTCMonth(), joinDate.getUTCDate()));
  return toISO(anniversary);
}

function dateUTC(value: string): Date | null {
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function daysInMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}