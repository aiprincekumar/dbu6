import type { HomeSummary, PostedOverview } from "../../shared/index";
import { agree, plural } from "../format";
import { Temporal } from "../report-kit";
import { saved } from "../reports/income-expenses/figures";

/*
 * What Overview says, as pure functions of its two requests: the overview
 * says whether there is anything to show and carries the month's figures;
 * the home summary says what waits in Update. Months are `YYYY-MM`,
 * dates `YYYY-MM-DD`.
 */

/** The month's first and last days. */
export function monthDates(month: string): {
  first_date: string;
  last_date: string;
} {
  const yearMonth = Temporal.PlainYearMonth.from(month);
  return {
    first_date: yearMonth.toPlainDate({ day: 1 }).toString(),
    last_date: yearMonth.toPlainDate({ day: yearMonth.daysInMonth }).toString(),
  };
}

/**
 * The months ◂ and ▸ step to: none before the books' first month, none
 * after this month.
 */
export function monthSteps(
  month: string,
  firstMonth: string | null,
  today: string,
): { previous: string | null; next: string | null } {
  const yearMonth = Temporal.PlainYearMonth.from(month);
  const previous = yearMonth.subtract({ months: 1 }).toString();
  const next = yearMonth.add({ months: 1 }).toString();
  return {
    previous: firstMonth !== null && previous >= firstMonth ? previous : null,
    next: next <= today.slice(0, 7) ? next : null,
  };
}

/** The month a key steps to: `[` the one before, `]` the one after. */
export function monthForKey(
  key: string,
  steps: { previous: string | null; next: string | null },
): string | null {
  if (key === "[") return steps.previous;
  if (key === "]") return steps.next;
  return null;
}

/**
 * What moved net worth in the month besides income and spending: opening
 * balances and other equity entries. Saved is the rest of the change, so
 * this is zero in an ordinary month.
 */
export function otherWorthChange(overview: PostedOverview): number {
  const { net_worth: worth, figures } = overview;
  return cents(
    worth.net - worth.previous_net - saved(figures.income, figures.spending),
  );
}

/** A row of Spending by category: a category, the rest, or the total. */
export type CategoryRow = {
  kind: "category" | "other" | "total";
  // The category's account; null for Other and Total.
  account_id: number | null;
  name: string;
  amount: number;
  // Null before the books have a month to average.
  average: number | null;
  // Its amount in each month the overview lists, oldest first, the month
  // shown last; null before the books start.
  monthly: (number | null)[];
};

/**
 * The categories as the overview lists them, Other among them, then Total,
 * so the table adds up to Spent.
 */
export function categoryRows(overview: PostedOverview): CategoryRow[] {
  const { categories, figures } = overview;
  if (categories.length === 0) return [];
  return [
    ...categories.map((category): CategoryRow => ({
      kind: category.account_id === null ? "other" : "category",
      ...category,
    })),
    {
      kind: "total",
      account_id: null,
      name: "Total",
      amount: figures.spending,
      average: figures.average?.spending ?? null,
      monthly: overview.months.map((m) => m.amounts?.spending ?? null),
    },
  ];
}

/**
 * Each row's meter beside its name: its share of the month's spending, as a
 * fraction. The share is of what the rows spent, refunds left out, so a
 * category whose spending a refund elsewhere offsets never passes the whole
 * and the shares add up to it. Total has none, and neither has a refund (a
 * negative amount).
 */
export function categoryBars(rows: readonly CategoryRow[]): (number | null)[] {
  const parts = rows.filter((row) => row.kind !== "total");
  const spent = parts.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  return rows.map((row) =>
    row.kind === "total" || spent === 0
      ? null
      : row.amount > 0
        ? row.amount / spent
        : 0,
  );
}

/** A sparkline's points and average line, as fractions of its height. */
export type SparkLine = {
  points: { x: number; y: number }[];
  average: number;
};

/**
 * A row's sparkline: each month's amount and the average as fractions of
 * the row's own scale, from zero to the highest of them, so a steady
 * category draws flat and a lumpy one jagged, whatever their size. Months
 * run left to right with the month shown last; those before the books
 * start are left out rather than drawn as zeros. None before there is an
 * average to set the month against; refunds sit at zero.
 */
export function sparkline(row: CategoryRow): SparkLine | null {
  const months = row.monthly.flatMap((amount, index) =>
    amount === null ? [] : [{ index, amount }],
  );
  if (row.average === null || months.length < 2) return null;
  const top = Math.max(row.average, ...months.map((month) => month.amount));
  const at = (value: number) => (top > 0 && value > 0 ? value / top : 0);
  return {
    points: months.map((month) => ({
      x: month.index / (row.monthly.length - 1),
      y: at(month.amount),
    })),
    average: at(row.average),
  };
}

/** One of the month's figures over the months the overview lists. */
export type FigureSeries = {
  // Each month's figure, oldest first, the month shown last; null before
  // the books start.
  monthly: (number | null)[];
  // Over the months the figures' average covers; null when there are none.
  average: number | null;
};

/**
 * Income, Spent and Saved in each month the overview lists, for their
 * sparklines. Saved % has none: its line would draw Saved's again.
 */
export function figureSeries(overview: PostedOverview): {
  income: FigureSeries;
  spent: FigureSeries;
  saved: FigureSeries;
} {
  const { months, figures } = overview;
  const average = figures.average;
  return {
    income: {
      monthly: months.map((m) => m.amounts?.income ?? null),
      average: average?.income ?? null,
    },
    spent: {
      monthly: months.map((m) => m.amounts?.spending ?? null),
      average: average?.spending ?? null,
    },
    saved: {
      monthly: months.map(
        (m) => m.amounts && saved(m.amounts.income, m.amounts.spending),
      ),
      average: average && saved(average.income, average.spending),
    },
  };
}

/**
 * A figure's sparkline. Unlike a category's it does not start at zero: a
 * figure such as income barely moves against its size, so the scale runs
 * from a little under the lowest month to the highest, and a month off its
 * usual shows. None before there is an average to set the month against.
 */
export function figureSparkline(series: FigureSeries): SparkLine | null {
  const months = series.monthly.flatMap((value, index) =>
    value === null ? [] : [{ index, value }],
  );
  if (series.average === null || months.length < 2) return null;
  const values = [series.average, ...months.map((month) => month.value)];
  const high = Math.max(...values);
  const least = Math.min(...values);
  const low = least - Math.abs(least) * 0.1;
  const at = (value: number) =>
    high > low ? (value - low) / (high - low) : 0.5;
  return {
    points: months.map((month) => ({
      x: month.index / (series.monthly.length - 1),
      y: at(month.value),
    })),
    average: at(series.average),
  };
}

function cents(amount: number): number {
  const rounded = Math.round(amount * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * The line above the figures: the drafts waiting for review, else how many
 * accounts Update shows something waiting on; nothing when neither.
 */
export function statusLine(
  summary: HomeSummary,
  waiting: number,
): { text: string; action: string } | null {
  const { drafts } = summary.totals;
  if (drafts > 0) {
    return {
      text: `${plural(drafts, "draft")} ${agree(drafts, "is", "are")} waiting for review.`,
      action: "Review drafts",
    };
  }
  const label = waitingLabel(waiting);
  return label === null ? null : { text: `${label}.`, action: "Open Update" };
}

/** "2 accounts need attention", or nothing when none does. */
export function waitingLabel(count: number): string | null {
  if (count === 0) return null;
  return `${plural(count, "account")} ${agree(count, "needs", "need")} attention`;
}
