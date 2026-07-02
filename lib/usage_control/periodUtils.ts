/** Période calendaire UTC (mois) — testable via `referenceDate`. */
export function getUsagePeriodBounds(referenceDate: Date = new Date()): {
  period_start: string;
  period_end: string;
} {
  const y = referenceDate.getUTCFullYear();
  const m = referenceDate.getUTCMonth();
  const periodStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  };
}

export function isSameUsagePeriod(
  periodStartIso: string,
  referenceDate: Date = new Date(),
): boolean {
  const current = getUsagePeriodBounds(referenceDate);
  return periodStartIso.slice(0, 10) === current.period_start.slice(0, 10);
}
