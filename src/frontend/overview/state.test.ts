import { describe, expect, it } from "vitest";
import type { HomeSummary, PostedOverview } from "../../shared/index";
import {
  categoryBars,
  categoryRows,
  type CategoryRow,
  figureSeries,
  figureSparkline,
  monthDates,
  monthForKey,
  monthSteps,
  otherWorthChange,
  sparkline,
  statusLine,
  waitingLabel,
} from "./state";

describe("months", () => {
  it("knows a month's days, February in a leap year too", () => {
    expect(monthDates("2026-04")).toEqual({
      first_date: "2026-04-01",
      last_date: "2026-04-30",
    });
    expect(monthDates("2024-02").last_date).toBe("2024-02-29");
  });

  it("steps between the books' first month and this month", () => {
    expect(monthSteps("2026-04", "2026-02", "2026-10-25")).toEqual({
      previous: "2026-03",
      next: "2026-05",
    });
    expect(monthSteps("2026-02", "2026-02", "2026-10-25").previous).toBeNull();
    expect(monthSteps("2026-10", "2026-02", "2026-10-25").next).toBeNull();
    expect(monthSteps("2026-04", null, "2026-10-25").previous).toBeNull();
  });
});

describe("monthForKey", () => {
  it("steps back with [ and on with ], within the bounds", () => {
    const steps = { previous: "2026-03", next: null };
    expect(monthForKey("[", steps)).toBe("2026-03");
    expect(monthForKey("]", steps)).toBeNull();
    expect(monthForKey("ArrowLeft", steps)).toBeNull();
  });
});

describe("otherWorthChange", () => {
  const overview = (net: number, previous: number) =>
    ({
      figures: { income: 5000, spending: 4000, average: null },
      net_worth: { net, previous_net: previous },
    }) as PostedOverview;

  it("is zero when income and spending made the whole change", () => {
    expect(otherWorthChange(overview(14000, 13000))).toBe(0);
    expect(otherWorthChange(overview(14000.004, 13000))).toBe(0);
  });

  it("is what an opening balance added", () => {
    // The books' first month: nothing before, an opening balance of 10000.
    expect(otherWorthChange(overview(11000, 0))).toBe(10000);
  });
});

describe("waitingLabel", () => {
  it("names how many accounts need attention", () => {
    expect(waitingLabel(2)).toBe("2 accounts need attention");
    expect(waitingLabel(1)).toBe("1 account needs attention");
    expect(waitingLabel(0)).toBeNull();
  });
});

describe("statusLine", () => {
  const summary = (drafts: number) => ({ totals: { drafts } }) as HomeSummary;

  it("counts the drafts waiting for review first", () => {
    expect(statusLine(summary(14), 2)).toEqual({
      text: "14 drafts are waiting for review.",
      action: "Review drafts",
    });
    expect(statusLine(summary(1), 1)?.text).toBe(
      "1 draft is waiting for review.",
    );
  });

  it("else says how many accounts need attention, or nothing", () => {
    expect(statusLine(summary(0), 2)).toEqual({
      text: "2 accounts need attention.",
      action: "Open Update",
    });
    expect(statusLine(summary(0), 0)).toBeNull();
  });
});

describe("figureSeries", () => {
  const overview = {
    first_month: "2026-08",
    figures: {
      income: 1000,
      spending: 750,
      average: { months: 1, income: 2000, spending: 1000 },
      spending_monthly: [null, 1000, 750],
    },
    months: [
      { month: "2026-07", income: 0, spending: 0 },
      { month: "2026-08", income: 2000, spending: 1000 },
      { month: "2026-09", income: 0, spending: 750 },
    ],
  } as PostedOverview;

  it("leaves out the months before the books start", () => {
    const series = figureSeries(overview);
    expect(series.income).toEqual({
      monthly: [null, 2000, 0],
      average: 2000,
    });
    expect(series.spent.monthly).toEqual([null, 1000, 750]);
    expect(series.saved).toEqual({
      monthly: [null, 1000, -750],
      average: 1000,
    });
  });
});

describe("figureSparkline", () => {
  it("scales from a little under the lowest month to the highest", () => {
    const line = figureSparkline({ monthly: [null, 100, 200], average: 150 });
    // From 90 to 200.
    expect(line?.points.map((point) => point.x)).toEqual([0.5, 1]);
    expect(line?.points[1].y).toBe(1);
    expect(line?.points[0].y).toBeCloseTo(10 / 110);
    expect(line?.average).toBeCloseTo(60 / 110);
  });

  it("keeps a negative month on the scale", () => {
    const line = figureSparkline({ monthly: [-100, 100], average: 0 });
    expect(line?.points[0].y).toBeCloseTo(10 / 210);
  });

  it("draws nothing without an average or a second month", () => {
    expect(figureSparkline({ monthly: [100, 200], average: null })).toBeNull();
    expect(figureSparkline({ monthly: [null, 200], average: 200 })).toBeNull();
  });
});

describe("categoryRows", () => {
  const overview = (categories: PostedOverview["categories"]) =>
    ({
      categories,
      figures: {
        income: 0,
        spending: 4000,
        average: { months: 2, income: 0, spending: 3500 },
        spending_monthly: [null, 3000, 4000],
      },
    }) as PostedOverview;

  it("takes Other from the overview and adds Total from its figures", () => {
    const rows = categoryRows(
      overview([
        {
          account_id: 1,
          name: "Housing",
          amount: 3000,
          average: 3000,
          monthly: [null, 3000, 3000],
        },
        {
          account_id: null,
          name: "Other",
          amount: 1000,
          average: 500,
          monthly: [null, 0, 1000],
        },
      ]),
    );
    expect(
      rows.map((row) => [row.kind, row.name, row.amount, row.average]),
    ).toEqual([
      ["category", "Housing", 3000, 3000],
      ["other", "Other", 1000, 500],
      ["total", "Total", 4000, 3500],
    ]);
    expect(rows[2].monthly).toEqual([null, 3000, 4000]);
  });

  it("has no rows without categories", () => {
    expect(categoryRows(overview([]))).toEqual([]);
  });
});

describe("categoryBars", () => {
  const row = (
    kind: "category" | "other" | "total",
    amount: number,
  ): CategoryRow => ({
    kind,
    account_id: null,
    name: kind,
    amount,
    average: null,
    monthly: [],
  });

  it("gives each row its share of the month's spending, Total aside", () => {
    expect(
      categoryBars([
        row("category", 1000),
        row("category", 750),
        row("other", 250),
        row("total", 2000),
      ]),
    ).toEqual([0.5, 0.375, 0.125, null]);
  });

  it("draws nothing for a refund, and no bars when nothing was spent", () => {
    // The refund leaves the share of what was spent; it is all Food's.
    expect(
      categoryBars([
        row("category", -500),
        row("category", 500),
        row("total", 0),
      ]),
    ).toEqual([0, 1, null]);
    expect(categoryBars([row("category", -500), row("total", -500)])).toEqual([
      null,
      null,
    ]);
  });
});

describe("sparkline", () => {
  const row = (
    monthly: (number | null)[],
    average: number | null,
  ): CategoryRow => ({
    kind: "category",
    account_id: 1,
    name: "Food",
    amount: monthly[monthly.length - 1] ?? 0,
    average,
    monthly,
  });

  it("scales the months and average to the highest of them, the month shown last", () => {
    const line = sparkline(row([null, null, 1000, 0, 4000], 1500));
    expect(line?.average).toBe(0.375);
    // The months before the books start take their slots but draw nothing.
    expect(line?.points).toEqual([
      { x: 0.5, y: 0.25 },
      { x: 0.75, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it("puts refunds at zero, and draws nothing before there is an average", () => {
    expect(
      sparkline(row([-500, 1000], 1000))?.points.map((point) => point.y),
    ).toEqual([0, 1]);
    expect(sparkline(row([null, 1000], 1000))).toBeNull();
    expect(sparkline(row([1000, 2000], null))).toBeNull();
    expect(sparkline(row([0, 0], 0))?.average).toBe(0);
  });
});
