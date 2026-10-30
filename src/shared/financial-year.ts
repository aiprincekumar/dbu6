import { Temporal } from "@sapporta/shared/temporal";
import type { DateSpan } from "./contracts/date-span.js";

/*
 * The financial year the books count in: 1 April to 31 March. The report
 * screens name and step periods by it, and a report that lays a long period
 * out year by year buckets its months by it on the server.
 */

const FINANCIAL_YEAR_START_MONTH = 4;

function financialYearStartYear(year: number, month: number): number {
  return month >= FINANCIAL_YEAR_START_MONTH ? year : year - 1;
}

/** The year a month's financial year starts in: March 2026 is in 2025's. */
export function financialYearOf(month: string): number {
  const { year, month: number } = Temporal.PlainYearMonth.from(month);
  return financialYearStartYear(year, number);
}

/** The first day of the financial year a date is in. */
export function financialYearStart(
  date: Temporal.PlainDate,
): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: financialYearStartYear(date.year, date.month),
    month: FINANCIAL_YEAR_START_MONTH,
    day: 1,
  });
}

/** A financial year's dates: 1 April to 31 March. */
export function financialYearSpan(startYear: number): DateSpan {
  const first = Temporal.PlainDate.from({
    year: startYear,
    month: FINANCIAL_YEAR_START_MONTH,
    day: 1,
  });
  return {
    first_date: first.toString(),
    last_date: first.add({ years: 1 }).subtract({ days: 1 }).toString(),
  };
}

/** "FY 2024–25" for the year starting April 2024. */
export function financialYearLabel(startYear: number): string {
  return `FY ${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
}
