import { describe, expect, it } from 'vitest';
import { calculatePayrollRow } from './engine.js';
import type { PayrollItemResult, PayrollRowInput, SalaryComponentDefinition } from './engine.js';

const baseSalary: SalaryComponentDefinition[] = [
  { id: 'basic', code: 'BASIC', type: 'EARNING', amount: 4000 },
  { id: 'housing', code: 'HOUSING', type: 'EARNING', amount: 1000 },
  { id: 'insurance', code: 'INS', type: 'DEDUCTION', amount: 100 },
];

const attendance = { workingDays: 26, presentDays: 24, leavePaidDays: 1, leaveUnpaidDays: 0, absenceDays: 1, overtimeMinutes: 0 };

function run(input: Partial<PayrollRowInput>): PayrollItemResult {
  return calculatePayrollRow({
    components: baseSalary,
    attendance,
    overtime: { approvedHours: 0 },
    policy: { workingDaysInPeriod: 26, dailyHours: 8, overtimeMultiplier: 1.25 },
    ...input,
  });
}

describe('calculatePayrollRow', () => {
  it('computes a deterministic baseline', () => {
    const a = run({});
    const b = run({});
    expect(a).toEqual(b);
    expect(a.gross).toBe(5000);
    expect(a.dailyRate).toBeCloseTo(192.31, 1);
    expect(a.unpaidDays).toBe(1);
    // 5000 (base) - 192.31 (unpaid) - 100 (insurance)
    expect(a.net).toBeCloseTo(4707.69, 1);
  });

  it('adds overtime using hourly rate and multiplier', () => {
    const ot2h = run({ overtime: { approvedHours: 2 } });
    // hourly = 5000/26/8 = 24.04; overtime = 2 * 24.04 * 1.25 = 60.10
    expect(ot2h.overtimePay).toBeCloseTo(60.1, 1);
    expect(ot2h.gross).toBeCloseTo(5060.1, 1);
  });

  it('falls back to attendance overtimeMinutes when approvedHours not set', () => {
    const result = run({
      overtime: { approvedHours: 0 },
      attendance: { ...attendance, overtimeMinutes: 120 },
    });
    expect(result.overtimePay).toBeCloseTo(60.1, 1); // 2h
  });

  it('respects configurable working days and daily hours', () => {
    const result = run({ policy: { workingDaysInPeriod: 30, dailyHours: 8, overtimeMultiplier: 1.25 } });
    expect(result.dailyRate).toBeCloseTo(166.67, 1);
    expect(result.hourlyRate).toBeCloseTo(20.83, 1);
  });

  it('applies earning/deduction adjustments', () => {
    const result = run({
      adjustments: [
        { type: 'EARNING', amount: 200, note: 'BONUS' },
        { type: 'DEDUCTION', amount: 50, note: 'LOAN' },
      ],
    });
    expect(result.gross).toBe(5200);
    expect(result.breakdown.some((b) => b.componentCode === 'BONUS' && b.amount === 200)).toBe(true);
  });

  it('applies a country module hook', () => {
    const uae = {
      id: 'uae',
      apply: (item: PayrollItemResult) => ({ ...item, net: Math.max(0, item.net - 5), notes: [...item.notes, 'UAE module applied'] }),
    };
    const without = run({});
    const withModule = run({ countryModule: uae });
    expect(withModule.net).toBeCloseTo(without.net - 5, 1);
    expect(withModule.notes).toContain('UAE module applied');
  });

  it('never produces negative net', () => {
    const result = run({
      components: [{ id: 'basic', code: 'BASIC', type: 'EARNING', amount: 1000 }],
      attendance: { ...attendance, absenceDays: 30, presentDays: 0 },
    });
    expect(result.net).toBe(0);
  });
});