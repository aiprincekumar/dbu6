import { describe, expect, it } from "vitest";
import type { PostedOverview } from "../../shared/index";
import {
  averageLabel,
  categoryBars,
  categoryRows,
  type CategoryRow,
  monthDates,
  monthForKey,
  monthSteps,
  otherWorthChange,
  sparkline,
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

describe("averageLabel", () => {
  it("says how many months it is until there are twelve", () => {
    expect(averageLabel(12)).toBe("12-month average");
    expect(averageLabel(1)).toBe("Average of 1 month");
    expect(averageLabel(5)).toBe("Average of 5 months");
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

describe("categoryRows", () => {
  const overview = (
    categories: PostedOverview["categories"],
    spending: number,
    average: number | null,
  ) =>
    ({
      categories,
      months: [] as PostedOverview["months"],
      first_month: null as string | null,
      figures: {
        income: 0,
        spending,
        average:
          average === null ? null : { months: 3, income: 0, spending: average },
      },
    }) as PostedOverview;
  const summary = (rows: ReturnType<typeof categoryRows>) =>
    rows.map((row) => [row.name, row.amount, row.average]);

  it("gives every row its months from the books' first, Other's exact", () => {
    const rows = categoryRows({
      ...overview(
        [
          {
            account_id: 1,
            name: "Housing",
            amount: 3000,
            average: 3000,
            monthly: [0, 3000, 3000, 3000],
          },
        ],
        4000,
        3500,
      ),
      // The books start in February: January's zeros are not drawn.
      months: [
        { month: "2026-01", income: 0, spending: 0 },
        { month: "2026-02", income: 0, spending: 3000 },
        { month: "2026-03", income: 0, spending: 4000 },
        { month: "2026-04", income: 0, spending: 4000 },
      ],
      first_month: "2026-02",
    });
    expect(rows.map((row) => [row.name, row.monthly])).toEqual([
      ["Housing", [3000, 3000, 3000]],
      ["Other", [0, 1000, 1000]],
      ["Total", [3000, 4000, 4000]],
    ]);
  });

  it("adds Other and Total, so the table adds up to the spending", () => {
    const rows = categoryRows(
      overview(
        [
          {
            account_id: 1,
            name: "Housing",
            amount: 3000,
            average: 3000,
            monthly: [],
          },
          {
            account_id: 2,
            name: "Food",
            amount: 1500,
            average: 2000,
            monthly: [],
          },
        ],
        5000,
        6000,
      ),
    );
    expect(summary(rows)).toEqual([
      ["Housing", 3000, 3000],
      ["Food", 1500, 2000],
      ["Other", 500, 1000],
      ["Total", 5000, 6000],
    ]);
  });

  it("puts a category with nothing this month in Other's average", () => {
    // Travel had nothing this month and fell out of the list: its average
    // is in Other's.
    const rows = categoryRows(
      overview(
        [
          {
            account_id: 1,
            name: "Housing",
            amount: 3000,
            average: 3000,
            monthly: [],
          },
        ],
        3000,
        4000,
      ),
    );
    expect(summary(rows)).toEqual([
      ["Housing", 3000, 3000],
      ["Other", 0, 1000],
      ["Total", 3000, 4000],
    ]);
  });

  it("leaves Other out when the categories cover everything", () => {
    const rows = categoryRows(
      overview(
        [
          {
            account_id: 1,
            name: "Housing",
            amount: 3000.1,
            average: 0.2,
            monthly: [],
          },
          {
            account_id: 2,
            name: "Refunds",
            amount: -0.1,
            average: 0.1,
            monthly: [],
          },
        ],
        3000,
        0.3,
      ),
    );
    expect(rows.map((row) => row.kind)).toEqual([
      "category",
      "category",
      "total",
    ]);
  });

  it("has no averages before the books have a month to average", () => {
    const rows = categoryRows(
      overview(
        [
          {
            account_id: 1,
            name: "Housing",
            amount: 3000,
            average: null,
            monthly: [],
          },
        ],
        4000,
        null,
      ),
    );
    expect(summary(rows)).toEqual([
      ["Housing", 3000, null],
      ["Other", 1000, null],
      ["Total", 4000, null],
    ]);
  });

  it("has no rows without categories", () => {
    expect(categoryRows(overview([], 0, null))).toEqual([]);
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
  const row = (monthly: number[], average: number | null): CategoryRow => ({
    kind: "category",
    account_id: 1,
    name: "Food",
    amount: monthly[monthly.length - 1] ?? 0,
    average,
    monthly,
  });

  it("scales the months and average to the highest of them, the month shown last", () => {
    const line = sparkline(row([1000, 2000, 4000], 1500));
    expect(line?.average).toBe(0.375);
    // Three months sit at the right of twelve slots.
    expect(line?.points).toEqual([
      { x: 9 / 11, y: 0.25 },
      { x: 10 / 11, y: 0.5 },
      { x: 1, y: 1 },
    ]);
  });

  it("puts refunds at zero, and draws nothing before there is an average", () => {
    expect(
      sparkline(row([-500, 1000], 1000))?.points.map((point) => point.y),
    ).toEqual([0, 1]);
    expect(sparkline(row([1000], 1000))).toBeNull();
    expect(sparkline(row([1000, 2000], null))).toBeNull();
    expect(sparkline(row([0, 0], 0))?.average).toBe(0);
  });
});
