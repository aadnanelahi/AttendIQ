import { describe, expect, it } from 'vitest';
import { computeLeaveBalance, leaveDaysCount, validateLeaveUsage } from './engine.js';

describe('leaveDaysCount', () => {
  it('counts inclusive days', () => {
    expect(leaveDaysCount('2026-03-02', '2026-03-04')).toBe(3);
    expect(leaveDaysCount('2026-03-02', '2026-03-02')).toBe(1);
    expect(leaveDaysCount('2026-03-02', '2026-03-04', true)).toBe(2.5);
  });
});

describe('computeLeaveBalance', () => {
  const monthlyPolicy = {
    accrualFrequency: 'MONTHLY' as const,
    accrualAmount: 2.5,
    proRated: true,
  };

  it('accrues full months and one prorated join month', () => {
    const result = computeLeaveBalance({
      policy: monthlyPolicy,
      joinDate: '2025-01-15',
      asOfDate: '2025-03-31',
    });
    // Jan: 2.5 * 17/31 = 1.37, Feb 2.5, Mar 2.5
    expect(result.accrued).toBeCloseTo(6.37, 1);
    expect(result.remaining).toBeCloseTo(6.37, 1);
  });

  it('does not accrue for a month whose end is after asOfDate', () => {
    const result = computeLeaveBalance({
      policy: monthlyPolicy,
      joinDate: '2025-01-15',
      asOfDate: '2025-03-15',
    });
    expect(result.accrued).toBeCloseTo(3.87, 1); // Jan prorated + Feb
  });

  it('respects used so far', () => {
    const result = computeLeaveBalance({
      policy: monthlyPolicy,
      joinDate: '2025-01-15',
      asOfDate: '2025-03-31',
      usedSoFar: 2,
    });
    expect(result.remaining).toBeCloseTo(4.37, 1);
  });

  it('caps by maxBalance', () => {
    const result = computeLeaveBalance({
      policy: { ...monthlyPolicy, maxBalance: 5 },
      joinDate: '2024-01-01',
      asOfDate: '2026-06-30',
    });
    expect(result.remaining).toBeLessThanOrEqual(5);
  });

  it('computes service-year accrual on anniversaries only', () => {
    const result = computeLeaveBalance({
      policy: { accrualFrequency: 'SERVICE_YEAR', accrualAmount: 24 },
      joinDate: '2023-05-10',
      asOfDate: '2026-02-01',
    });
    expect(result.accrued).toBe(48); // 2024-05-10 and 2025-05-10
  });

  it('limits carryover to policy cap', () => {
    const result = computeLeaveBalance({
      policy: { ...monthlyPolicy, carryoverLimit: 10 },
      joinDate: '2020-01-01',
      asOfDate: '2026-01-31',
      carryoverFromPrev: 25,
    });
    expect(result.carryover).toBe(10);
  });
});

describe('validateLeaveUsage', () => {
  it('rejects overdraw', () => {
    const result = validateLeaveUsage({ balance: 3, requestedDays: 4, policy: { accrualFrequency: 'MONTHLY', accrualAmount: 2.5 } });
    expect(result.ok).toBe(false);
  });
  it('accepts within balance', () => {
    const result = validateLeaveUsage({ balance: 4, requestedDays: 4, policy: { accrualFrequency: 'MONTHLY', accrualAmount: 2.5 } });
    expect(result.ok).toBe(true);
  });
});