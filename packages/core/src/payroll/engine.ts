const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SalaryComponentDefinition {
  id: string;
  code: string;
  type: 'EARNING' | 'DEDUCTION';
  isStatutory?: boolean;
  /** Configured monthly amount. */
  amount: number;
}

export interface AttendanceSummaryInput {
  workingDays: number;
  presentDays: number;
  leavePaidDays: number;
  leaveUnpaidDays: number;
  absenceDays: number;
  overtimeMinutes: number;
}

export interface OvertimeSummaryInput {
  approvedHours: number;
  minutes?: number;
}

export interface PayrollPolicyInput {
  /** Expected working days in the period (configurable, UAE default 26). */
  workingDaysInPeriod?: number;
  dailyHours?: number;
  /** Standard overtime multiplier for post/pre shift work. */
  overtimeMultiplier?: number;
}

export interface AdjustmentInput {
  type: 'EARNING' | 'DEDUCTION';
  amount: number;
  note?: string;
}

export interface PayrollRowInput {
  components: SalaryComponentDefinition[];
  attendance: AttendanceSummaryInput;
  overtime: OvertimeSummaryInput;
  policy: PayrollPolicyInput;
  adjustments?: AdjustmentInput[];
  countryModule?: PayrollCountryModule;
}

export interface PayrollItemResult {
  gross: number;
  net: number;
  deductions: number;
  hourlyRate: number;
  dailyRate: number;
  payableDays: number;
  unpaidDays: number;
  overtimePay: number;
  breakdown: { componentCode: string; type: 'EARNING' | 'DEDUCTION'; amount: number }[];
  notes: string[];
}

export interface PayrollCountryModule {
  id: string;
  apply(item: PayrollItemResult, input: PayrollRowInput): PayrollItemResult;
}

/** Base module that applies no statutory adjustments. */
export const baseCountryModule: PayrollCountryModule = {
  id: 'base',
  apply: (item) => item,
};

export function calculatePayrollRow(input: PayrollRowInput): PayrollItemResult {
  const workingDays = input.policy.workingDaysInPeriod ?? 26;
  const dailyHours = input.policy.dailyHours ?? 8;
  const otMultiplier = input.policy.overtimeMultiplier ?? 1.25;

  if (workingDays <= 0 || dailyHours <= 0) {
    throw new Error('workingDaysInPeriod and dailyHours must be positive');
  }

  const earnings = input.components.filter((c) => c.type === 'EARNING');
  const deductions = input.components.filter((c) => c.type === 'DEDUCTION');
  const adjustments = input.adjustments ?? [];

  const grossBase = round2(earnings.reduce((sum, c) => sum + c.amount, 0));
  const fixedDeductions = round2(deductions.reduce((sum, c) => sum + c.amount, 0));

  const dailyRate = round2(grossBase / workingDays);
  const hourlyRate = round2(dailyRate / dailyHours);

  const unpaidDays = input.attendance.absenceDays + input.attendance.leaveUnpaidDays;
  const payableDays = Math.max(
    0,
    input.attendance.presentDays + input.attendance.leavePaidDays,
  );

  const overtimeHours = input.overtime.approvedHours > 0
    ? input.overtime.approvedHours
    : round2(input.attendance.overtimeMinutes / 60);
  const overtimePay = round2(overtimeHours * hourlyRate * otMultiplier);

  const unpaidDeduction = round2(dailyRate * unpaidDays);
  const earningAdjustments = round2(
    adjustments.filter((a) => a.type === 'EARNING').reduce((s, a) => s + a.amount, 0),
  );
  const deductionAdjustments = round2(
    adjustments.filter((a) => a.type === 'DEDUCTION').reduce((s, a) => s + a.amount, 0),
  );

  const gross = round2(grossBase + overtimePay + earningAdjustments);
  const totalDeductions = round2(unpaidDeduction + fixedDeductions + deductionAdjustments);
  let net = round2(Math.max(0, gross - totalDeductions));

  const breakdown: PayrollItemResult['breakdown'] = [
    ...earnings.map((c) => ({ componentCode: c.code, type: 'EARNING' as const, amount: c.amount })),
    ...deductions.map((c) => ({ componentCode: c.code, type: 'DEDUCTION' as const, amount: c.amount })),
    ...(overtimePay > 0 ? [{ componentCode: 'OVERTIME', type: 'EARNING' as const, amount: overtimePay }] : []),
    ...(unpaidDeduction > 0 ? [{ componentCode: 'UNPAID_ABSENCE', type: 'DEDUCTION' as const, amount: unpaidDeduction }] : []),
    ...adjustments.map((a) => ({ componentCode: a.note ?? 'ADJUSTMENT', type: a.type, amount: a.amount })),
  ];

  const notes: string[] = [
    `Daily rate: ${dailyRate}`, `Hourly rate: ${hourlyRate}`,
    `Unpaid days: ${unpaidDays}`, `Payable days: ${payableDays}`,
    `Overtime hours: ${overtimeHours} @ ${otMultiplier}x`,
  ];

  const item: PayrollItemResult = {
    gross,
    net,
    deductions: totalDeductions,
    hourlyRate,
    dailyRate,
    payableDays,
    unpaidDays,
    overtimePay,
    breakdown,
    notes,
  };

  const module = input.countryModule ?? baseCountryModule;
  return module.apply(item, input);
}