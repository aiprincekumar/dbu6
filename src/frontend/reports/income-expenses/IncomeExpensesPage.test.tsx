// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  IncomeExpenses,
  IncomeExpensesAccount,
  IncomeExpensesEntry,
} from "../../../shared/index";
import { IncomeExpensesPage } from "./IncomeExpensesPage";

/*
 * The page's own behaviour (PLAN.md §11 P4): the period it asks the server
 * for and writes to the URL; a bar or a row brings its month or account
 * into focus, and the figures, the chart and the entries beside the table
 * follow; nothing shows as selected at rest; rows open level by level with
 * the parent's own entries as a row of their own; Esc steps back out; and
 * the empty state.
 */

vi.mock("@sapporta/frontend", () => ({ appTimeZone: () => "Asia/Kolkata" }));

let host: HTMLDivElement;
let root: Root;
let responses: unknown[];
let entries: IncomeExpensesEntry[];
let requests: URL[];

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 16 September 2026 in Kolkata.
  vi.setSystemTime(new Date("2026-09-16T06:00:00Z"));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  requests = [];
  responses = [];
  entries = [
    entry(1, "2026-08-10", 3, 1500, "SAMPLE GROCER"),
    entry(2, "2026-08-01", 4, 10000, "Rent August"),
    entry(3, "2026-09-01", 4, 10000, "Rent September"),
    entry(4, "2026-09-05", 2, 500, "Sample snacks"),
    entry(5, "2026-09-12", 3, 1500, "SAMPLE GROCER"),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const request = new URL(url, "http://localhost");
      if (request.pathname.endsWith("/entries")) {
        return Response.json({ entries });
      }
      if (request.pathname.endsWith("/books-span")) {
        return Response.json({
          span: { first_date: "2023-09-30", last_date: "2026-09-12" },
        });
      }
      requests.push(request);
      const next = responses.length > 1 ? responses.shift() : responses[0];
      return Response.json(next);
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** An account over August and September 2026, with its own months. */
function account(
  account_id: number,
  name: string,
  own: [number, number],
  children: IncomeExpensesAccount[] = [],
): IncomeExpensesAccount {
  const months = children.reduce(
    (sums, child) => sums.map((sum, index) => sum + child.months[index]),
    [...own],
  );
  return {
    account_id,
    name,
    own: own[0] + own[1],
    total: months[0] + months[1],
    months,
    children,
  };
}

function entry(
  id: number,
  date: string,
  account_id: number,
  amount: number,
  narration: string,
): IncomeExpensesEntry {
  return {
    key: `entry:${id}`,
    journal_id: 100 + id,
    date,
    narration,
    against: "Sample Savings",
    account_id,
    amount,
  };
}

const spending = [
  // Ranked by total, as the server sends them; one account above them all.
  account(
    1,
    "Expenses",
    [0, 0],
    [
      account(4, "Rent", [10000, 10000]),
      account(2, "Food", [0, 500], [account(3, "Groceries", [1500, 1500])]),
    ],
  ),
];

function report(overrides: Partial<IncomeExpenses> = {}): IncomeExpenses {
  return {
    income: {
      total: 50000,
      accounts: [account(10, "Salary", [25000, 25000])],
    },
    spending: { total: 23500, accounts: spending },
    months: [
      { month: "2026-08", income: 25000, spending: 11500 },
      { month: "2026-09", income: 25000, spending: 12000 },
    ],
    ...overrides,
  };
}

function Where() {
  const { pathname, search } = useLocation();
  return createElement("code", null, `${pathname}${search}`);
}

async function renderAt(url: string) {
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(
          MemoryRouter,
          { initialEntries: [url] },
          createElement(Where),
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/reports/income-expenses",
              element: createElement(IncomeExpensesPage),
            }),
          ),
        ),
      ),
    );
  });
  await settle();
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const text = () => host.textContent ?? "";
const location = () => host.querySelector("code")?.textContent;
const asked = (index: number) =>
  `${requests[index]?.searchParams.get("from_date")} – ${requests[index]?.searchParams.get("to_date")}`;

function button(name: string): HTMLButtonElement {
  // Popovers render outside the page's root.
  const found = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent?.trim() === name ||
      candidate.getAttribute("aria-label") === name,
  );
  if (!found) throw new Error(`No button "${name}" in: ${text()}`);
  return found;
}

/** An account's row in the table, by the account's name. */
function row(name: string): HTMLElement {
  const found = Array.from(
    host.querySelectorAll<HTMLElement>('[role="row"]'),
  ).find((candidate) =>
    candidate
      .querySelector('[role="rowheader"]')
      ?.textContent?.startsWith(name),
  );
  if (!found) throw new Error(`No row "${name}" in: ${text()}`);
  return found;
}

/** The rows as they read, below the headings: name, amount, share. */
function rows(): string[] {
  return Array.from(host.querySelectorAll('[role="row"][tabindex]')).map(
    (candidate) =>
      Array.from(candidate.children)
        .map((cell) => cell.textContent)
        .filter(Boolean)
        .join(" "),
  );
}

/** The entries beside the table, as their narrations. */
function panelEntries(): string[] {
  return Array.from(host.querySelectorAll("aside li a")).map(
    (link) => link.querySelector("span + span span")?.textContent ?? "",
  );
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

describe("Income and Expenses", () => {
  it("shows the last 12 months by default and a preset by name", async () => {
    responses = [report()];
    await renderAt("/reports/income-expenses");

    expect(asked(0)).toBe("2025-10-01 – 2026-09-16");
    expect(text()).toContain("1 October 2025 – 16 September 2026");
    expect(text()).toContain("50,000");
    expect(text()).not.toContain("+50,000");
    expect(text()).toContain("53% of income");
    expect(text()).not.toContain("Saved %");
    expect(text()).toContain("books until 12 Sep 2026");

    await act(async () => button("Period: Last 12 months").click());
    await settle();
    await act(async () => button("Last financial year").click());
    await settle();

    expect(location()).toBe(
      "/reports/income-expenses?period=last-financial-year",
    );
    expect(asked(1)).toBe("2025-04-01 – 2026-03-31");
  });

  it("shows all time from the books' first day, a bar per financial year", async () => {
    responses = [report()];
    await renderAt("/reports/income-expenses");

    await act(async () => button("Period: Last 12 months").click());
    await settle();
    await act(async () => button("All time").click());
    await settle();

    expect(location()).toBe("/reports/income-expenses?period=all-time");
    expect(asked(1)).toBe("2023-09-30 – 2026-09-16");
    expect(text()).toContain("30 September 2023 – 16 September 2026");
    expect(button("Period: All time")).toBeTruthy();
  });

  it("steps the period back with [", async () => {
    responses = [report()];
    await renderAt("/reports/income-expenses?period=last-financial-year");

    await act(async () => press("["));
    await settle();

    expect(location()).toBe(
      "/reports/income-expenses?from_date=2024-04-01&to_date=2025-03-31",
    );
    expect(button("Period: FY 2024–25")).toBeTruthy();
  });

  it("names picked dates, and selects a month's bar without leaving the period", async () => {
    responses = [report()];
    await renderAt(
      "/reports/income-expenses?from_date=2026-08-01&to_date=2026-09-16",
    );

    expect(asked(0)).toBe("2026-08-01 – 2026-09-16");
    expect(button("Period: Aug – Sep 2026")).toBeTruthy();
    expect(text()).toContain("so far");

    await act(async () =>
      button("August 2026 · Income +25,000 · Spending −11,500").click(),
    );
    await settle();

    expect(location()).toBe(
      "/reports/income-expenses?from_date=2026-08-01&to_date=2026-09-16&month=2026-08",
    );
    expect(requests).toHaveLength(1);
    // The figures, the rows and the entries are August's.
    expect(text()).toContain("Showing");
    expect(text()).toContain("11,500");
    expect(rows()).toContain("Rent 10,000 87%");
    expect(panelEntries()).toEqual(["Rent August", "SAMPLE GROCER"]);

    await act(async () => press("Escape"));
    expect(location()).toBe(
      "/reports/income-expenses?from_date=2026-08-01&to_date=2026-09-16",
    );
  });

  it("starts below a single top account, and opens rows level by level", async () => {
    responses = [report()];
    await renderAt("/reports/income-expenses");

    // Income first, then spending, each closed by its total; no signs.
    expect(rows().slice(0, 4)).toEqual([
      "Salary 50,000 100%",
      "Total income 50,000",
      "Rent 20,000 85%",
      "Food 3,500 15%",
    ]);
    expect(rows().join()).not.toContain("Groceries");

    await act(async () => button("Open Food").click());
    expect(rows().slice(4, 7)).toEqual([
      "Groceries 3,000 13%",
      "Food, not in a sub-account 500 2%",
      "Total spent 23,500",
    ]);
    // Opening a row doesn't focus it.
    expect(location()).toBe("/reports/income-expenses");

    await act(async () => button("Close Food").click());
    expect(rows().join()).not.toContain("Groceries");
  });

  it("focuses an account on its row, and the entries follow", async () => {
    responses = [report()];
    await renderAt("/reports/income-expenses");
    await settle();

    // At rest nothing is selected, and the entries are all spending's,
    // largest first.
    expect(host.querySelector('[aria-selected="true"]')).toBeNull();
    expect(text()).toContain("Income and spending");
    expect(panelEntries()).toEqual([
      "Rent August",
      "Rent September",
      "SAMPLE GROCER",
      "SAMPLE GROCER",
      "Sample snacks",
    ]);

    await act(async () => row("Food").click());
    await settle();

    expect(location()).toBe("/reports/income-expenses?account=2");
    expect(row("Food").getAttribute("aria-selected")).toBe("true");
    expect(panelEntries()).toEqual([
      "SAMPLE GROCER",
      "SAMPLE GROCER",
      "Sample snacks",
    ]);
    // The chart draws Food's months.
    expect(
      host.querySelector('[aria-label="September 2026 · Food −2,000"]'),
    ).toBeTruthy();
    expect(text()).toContain("Share of spending");
    const ledger = Array.from(host.querySelectorAll("aside a")).find(
      (link) => link.textContent === "Open ledger",
    );
    expect(ledger?.getAttribute("href")).toBe(
      "/reports/account-ledger?account_id=2&from_date=2025-10-01&to_date=2026-09-16",
    );
    expect(host.querySelector("aside li a")?.getAttribute("href")).toBe(
      "/tables/journals?filter[id][eq]=101",
    );

    await act(async () => press("Escape"));
    expect(location()).toBe("/reports/income-expenses");
  });

  it("opens the rows above an account a link focuses", async () => {
    responses = [report()];
    await renderAt("/reports/income-expenses?account=3");
    await settle();

    expect(row("Groceries").getAttribute("aria-selected")).toBe("true");
    expect(panelEntries()).toEqual(["SAMPLE GROCER", "SAMPLE GROCER"]);
  });

  it("links the accountant's view with the same dates", async () => {
    responses = [report()];
    await renderAt("/reports/income-expenses?period=this-month");

    const link = Array.from(host.querySelectorAll("a")).find(
      (a) => a.textContent === "Income statement",
    );
    expect(link?.getAttribute("href")).toBe(
      "/reports/income-statement?from_date=2026-09-01&to_date=2026-09-16",
    );
    // A period within one month has no chart.
    expect(host.querySelector('[aria-label="Month by month"]')).toBeNull();
  });

  it("says when nothing falls in the period", async () => {
    responses = [
      report({
        income: { total: 0, accounts: [] },
        spending: { total: 0, accounts: [] },
        months: [{ month: "2025-01", income: 0, spending: 0 }],
      }),
    ];
    await renderAt(
      "/reports/income-expenses?from_date=2025-01-01&to_date=2025-01-31",
    );

    expect(text()).toContain("No income or spending in these months");
    expect(text()).toContain(
      "Nothing in your books falls between 1 Jan and 31 Jan 2025.",
    );
    expect(text()).not.toContain("Saved");
  });

  it("shows spending higher than income in ink, not as an error", async () => {
    responses = [report({ income: { total: 0, accounts: [] } })];
    await renderAt("/reports/income-expenses");

    expect(text()).toContain("Overspent");
    expect(text()).toContain("23,500");
  });
});
