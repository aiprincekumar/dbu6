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
  AccountMonths,
  AccountMonthsRow,
  IncomeExpensesEntry,
} from "../../../shared/index";
import { accountsTablePage } from "../../accounts-page.testing";
import { AccountsByMonthPage } from "./AccountsByMonthPage";

/*
 * The page's own behaviour: what it asks the server for, the Balance and
 * Change toggle only for assets and liabilities, rows opening level by
 * level, and a cell opening its entries, kept in the URL and closed by Esc.
 */

vi.mock("@sapporta/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  appTimeZone: () => "Asia/Kolkata",
}));

let host: HTMLDivElement;
let root: Root;
let requests: URL[];
let entryRequests: URL[];

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
  entryRequests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const request = new URL(url, "http://localhost");
      if (request.pathname.endsWith("/entries")) {
        entryRequests.push(request);
        return Response.json({ entries: ENTRIES });
      }
      if (request.pathname.endsWith("/tables/accounts")) {
        return Response.json(accountsTablePage(CHART));
      }
      if (request.pathname.endsWith("/books-span")) {
        return Response.json({
          span: { first_date: "2023-09-30", last_date: "2026-09-12" },
        });
      }
      requests.push(request);
      return Response.json(
        report(request.searchParams.get("group") ?? "expense"),
      );
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function line(
  account_id: number,
  name: string,
  values: [number, number],
  children: AccountMonthsRow[] = [],
): AccountMonthsRow {
  return {
    account_id,
    name,
    opening: 0,
    values,
    own: null,
    total: values[0] + values[1],
    average: values[0],
    outliers: [false, false],
    children,
  };
}

function report(group: string): AccountMonths {
  const asset = group === "asset";
  const accounts = asset
    ? [line(9, "Sample Savings", [40000, 45000])]
    : [
        line(
          2,
          "Food",
          [1500, 2000],
          [line(3, "Groceries", [1500, 1500]), line(4, "Dining", [0, 500])],
        ),
        line(5, "Rent", [10000, 10000]),
      ];
  return {
    type: asset ? "Asset" : "Expense",
    measure: asset ? "balance" : "flow",
    root: null,
    layout: "months",
    columns: [
      {
        key: "2026-08",
        label: "Aug",
        detail: "2026",
        dates: { first_date: "2026-08-01", last_date: "2026-08-31" },
        in_books: true,
        so_far: false,
      },
      {
        key: "2026-09",
        label: "Sep",
        detail: null,
        dates: { first_date: "2026-09-01", last_date: "2026-09-16" },
        in_books: true,
        so_far: true,
      },
    ],
    accounts,
    total: {
      opening: 0,
      values: asset ? [40000, 45000] : [11500, 12000],
      total: asset ? 5000 : 23500,
      average: asset ? 40000 : 11500,
    },
  };
}

// The chart the account picker draws, in the report's ids.
const CHART = [
  { id: 1, name: "Expenses", parent_id: null, account_type: "Expense" },
  { id: 2, name: "Food", parent_id: 1, account_type: "Expense" },
  { id: 3, name: "Groceries", parent_id: 2, account_type: "Expense" },
  { id: 9, name: "Salary", parent_id: null, account_type: "Revenue" },
];

const ENTRIES: IncomeExpensesEntry[] = [
  {
    key: "entry:1",
    journal_id: 101,
    date: "2026-08-10",
    narration: "SAMPLE GROCER",
    against: "Sample Savings",
    account_id: 3,
    amount: 1500,
  },
];

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
              path: "/reports/accounts-by-month",
              element: createElement(AccountsByMonthPage),
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
const location = () => host.querySelector("code")?.textContent ?? "";

function button(name: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent?.trim() === name ||
      candidate.getAttribute("aria-label") === name,
  );
  if (!found) throw new Error(`No button "${name}" in: ${text()}`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
  await settle();
}

/** Opens the account picker and the choices it lists. */
async function pickerChoices(): Promise<HTMLElement[]> {
  await click(button("Show the choices"));
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

function rowNames(): string[] {
  return Array.from(host.querySelectorAll("tbody tr")).map(
    (row) => row.querySelector("td")?.textContent ?? "",
  );
}

describe("AccountsByMonthPage", () => {
  it("asks for the last 12 months of spending, with no Balance toggle", async () => {
    await renderAt("/reports/accounts-by-month");
    expect(requests[0].searchParams.get("from_date")).toBe("2025-10-01");
    expect(requests[0].searchParams.get("to_date")).toBe("2026-09-16");
    expect(requests[0].searchParams.get("group")).toBe("expense");
    expect(rowNames()).toEqual(["Food", "Rent", "Total"]);
    expect(text()).toContain("so far");
    expect(text()).not.toContain("Balance");
  });

  it("opens a row level by level", async () => {
    await renderAt("/reports/accounts-by-month");
    await click(button("Open Food"));
    expect(rowNames()).toEqual([
      "Food",
      "Groceries",
      "Dining",
      "Rent",
      "Total",
    ]);
    await click(button("Close Food"));
    expect(rowNames()).toEqual(["Food", "Rent", "Total"]);
  });

  it("offers Balance and Change for assets, and asks for the change", async () => {
    await renderAt("/reports/accounts-by-month?group=asset");
    expect(text()).toContain("Balance");
    await click(button("Change"));
    expect(location()).toContain("show=change");
    expect(requests.at(-1)?.searchParams.get("show")).toBe("change");
  });

  it("switches the type, dropping an account", async () => {
    await renderAt("/reports/accounts-by-month?account=2");
    await click(button("Income"));
    expect(location()).toBe("/reports/accounts-by-month?group=revenue");
    expect(requests.at(-1)?.searchParams.get("group")).toBe("revenue");
  });

  it("narrows to an account of the type, and back to all of it", async () => {
    await renderAt("/reports/accounts-by-month");
    const choices = await pickerChoices();
    // The type's accounts as the tree runs; no income.
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "Expenses",
      "Food",
      "Groceries",
    ]);
    await click(choices[1]);
    expect(location()).toBe("/reports/accounts-by-month?account=2");
    expect(requests.at(-1)?.searchParams.get("account_id")).toBe("2");

    await click(button("Show all spending"));
    expect(location()).toBe("/reports/accounts-by-month");
  });

  it("opens a cell's entries, keeps it in the URL, and closes on Esc", async () => {
    await renderAt("/reports/accounts-by-month");
    await click(button("Food, Aug: 1,500, entries"));
    expect(location()).toContain("cell=2%3A2026-08");
    expect(text()).toContain("SAMPLE GROCER");
    expect(entryRequests[0].searchParams.get("account_id")).toBe("2");
    expect(entryRequests[0].searchParams.get("from_date")).toBe("2026-08-01");
    expect(entryRequests[0].searchParams.get("to_date")).toBe("2026-08-31");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await settle();
    expect(location()).not.toContain("cell=");
    expect(text()).not.toContain("SAMPLE GROCER");
  });

  it("opens the cell a link names, the rows above it too", async () => {
    await renderAt("/reports/accounts-by-month?cell=3:2026-08");
    expect(rowNames()).toContain("Groceries");
    expect(text()).toContain("Aug 2026");
    expect(text()).toContain("SAMPLE GROCER");
  });
});
