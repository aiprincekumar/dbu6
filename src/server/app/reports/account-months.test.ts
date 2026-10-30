import { describe, expect, it } from "vitest";
import {
  accountMonthsSchema,
  type AccountMonthsRow,
} from "../../../shared/index.js";
import { openTestLedger } from "./testing.js";
import { accountEntries, accountMonthsReport } from "./account-months.js";

/*
 * Books from December 2025 to early March 2026, read on 15 March. Every
 * spending account sits under one Expenses account with nothing of its own.
 * Food has entries of its own beside Groceries and Dining; Travel's March
 * charge is refunded the same month; the card is paid off in February. A
 * draft on Groceries is not in the books.
 */
function books() {
  const books = openTestLedger();
  const add = books.addAccount;
  const expenses = add({ name: "Expenses", account_type: "Expense" });
  const food = add({
    name: "Food",
    account_type: "Expense",
    parent_id: expenses,
  });
  const groceries = add({
    name: "Groceries",
    account_type: "Expense",
    parent_id: food,
  });
  const dining = add({
    name: "Dining",
    account_type: "Expense",
    parent_id: food,
  });
  const rent = add({
    name: "Rent",
    account_type: "Expense",
    parent_id: expenses,
  });
  const travel = add({
    name: "Travel",
    account_type: "Expense",
    parent_id: expenses,
  });
  const salary = add({ name: "Salary", account_type: "Revenue" });
  const bank = add({ name: "Sample Bank", account_type: "Asset" });
  const card = add({ name: "Sample Card", account_type: "Liability" });
  const equity = add({ name: "Opening balances", account_type: "Equity" });

  const pay = (date: string, debit: number, credit: number, amount: number) =>
    books.addJournal({
      date,
      description: "NOPII sample",
      entries: [
        { account_id: debit, debit: amount },
        { account_id: credit, credit: amount },
      ],
    });
  pay("2025-12-10", bank, equity, 10000);
  pay("2026-01-01", bank, salary, 5000);
  pay("2026-01-05", groceries, bank, 1000);
  pay("2026-01-20", rent, card, 2500);
  pay("2026-02-05", groceries, bank, 1000);
  pay("2026-02-06", dining, bank, 500);
  pay("2026-02-10", food, bank, 200);
  pay("2026-02-25", card, bank, 2500);
  pay("2026-03-02", travel, card, 500);
  pay("2026-03-03", card, travel, 500);

  books.sqlite
    .prepare(
      `INSERT INTO draft_transactions
         (workspace_id, scoped_to_user_id, date, account_id, source_narration,
          withdrawal, deposit, base_account_id, created_at, updated_at)
       VALUES ('workspace', 'user', '2026-02-15', ?, 'NOPII draft', 5000, 0, ?,
               '2026-01-01', '2026-01-01')`,
    )
    .run(groceries, bank);

  return { ...books, ids: { food, groceries, bank, card } };
}

const QUARTER = { fromDate: "2026-01-01", toDate: "2026-03-31" };
const TODAY = "2026-03-15";

type Books = ReturnType<typeof books>;

function report(
  fixture: Books,
  query: Partial<Parameters<typeof accountMonthsReport>[1]> = {},
) {
  const result = accountMonthsReport(fixture.ledger, {
    ...QUARTER,
    group: null,
    accountId: null,
    show: null,
    today: TODAY,
    ...query,
  });
  if (result === null) throw new Error("no report");
  return accountMonthsSchema.parse(result);
}

const named = (rows: readonly AccountMonthsRow[], name: string) =>
  rows.find((row) => row.name === name)!;

describe("accountMonthsReport", () => {
  it("lists spending month by month, under the one top account", () => {
    const result = report(books());
    expect(result.type).toBe("Expense");
    expect(result.measure).toBe("flow");
    expect(result.layout).toBe("months");
    expect(result.columns.map((column) => column.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(result.columns.map((column) => column.so_far)).toEqual([
      false,
      false,
      true,
    ]);
    // March ends today.
    expect(result.columns[2].dates).toEqual({
      first_date: "2026-03-01",
      last_date: TODAY,
    });
    expect(result.columns[0].detail).toBe("2026");
    expect(result.columns[1].detail).toBeNull();

    // Expenses holds nothing of its own, so its children are the rows.
    expect(result.accounts.map((row) => row.name)).toEqual([
      "Food",
      "Rent",
      "Travel",
    ]);
    const food = named(result.accounts, "Food");
    expect(food.values).toEqual([1000, 1700, 0]);
    expect(food.own).toEqual([0, 200, 0]);
    expect(food.total).toBe(2700);
    expect(named(food.children, "Groceries").values).toEqual([1000, 1000, 0]);
    expect(result.total.values).toEqual([3500, 1700, 0]);
    expect(result.total.total).toBe(5200);
  });

  it("averages the months before this one and flags a month 1.5× it", () => {
    const result = report(books());
    const food = named(result.accounts, "Food");
    expect(food.average).toBe(1350);
    expect(food.outliers).toEqual([false, false, false]);
    const rent = named(result.accounts, "Rent");
    expect(rent.average).toBe(1250);
    expect(rent.outliers).toEqual([true, false, false]);
  });

  it("keeps a row whose month nets to nothing", () => {
    const travel = named(report(books()).accounts, "Travel");
    expect(travel.values).toEqual([0, 0, 0]);
    expect(travel.total).toBe(0);
  });

  it("never counts a draft", () => {
    const groceries = named(
      named(report(books()).accounts, "Food").children,
      "Groceries",
    );
    expect(groceries.values[1]).toBe(1000);
  });

  it("signs income as positive", () => {
    const result = report(books(), { group: "revenue" });
    expect(result.type).toBe("Revenue");
    expect(result.accounts[0].values).toEqual([5000, 0, 0]);
  });

  it("shows an asset's balance at each month's end, opening plus movements", () => {
    const result = report(books(), { group: "asset" });
    expect(result.measure).toBe("balance");
    const bank = result.accounts[0];
    expect(bank.opening).toBe(10000);
    expect(bank.values).toEqual([14000, 9800, 9800]);
    // Change: closing less opening.
    expect(bank.total).toBe(-200);
    expect(bank.outliers).toEqual([false, false, false]);
  });

  it("shows a liability's debt as positive, and its change on asking", () => {
    const fixture = books();
    expect(report(fixture, { group: "liability" }).accounts[0].values).toEqual([
      2500, 0, 0,
    ]);
    const change = report(fixture, { group: "liability", show: "change" });
    expect(change.measure).toBe("change");
    expect(change.accounts[0].values).toEqual([2500, -2500, 0]);
    expect(change.accounts[0].total).toBe(0);
  });

  it("ignores show for income and spending", () => {
    expect(report(books(), { show: "change" }).measure).toBe("flow");
  });

  it("takes one account and everything under it", () => {
    const fixture = books();
    const result = report(fixture, { accountId: fixture.ids.food });
    expect(result.root).toEqual({ account_id: fixture.ids.food, name: "Food" });
    // Food has entries of its own, so it stays the one row.
    expect(result.accounts.map((row) => row.name)).toEqual(["Food"]);
    expect(result.accounts[0].children.map((row) => row.name)).toEqual([
      "Groceries",
      "Dining",
    ]);
    expect(result.total.total).toBe(2700);
  });

  it("is null for an account that isn't in the books", () => {
    expect(
      accountMonthsReport(books().ledger, {
        ...QUARTER,
        group: null,
        accountId: 9999,
        show: null,
        today: TODAY,
      }),
    ).toBeNull();
  });

  it("leaves the months outside the books blank, carrying no balance", () => {
    const result = report(books(), {
      group: "asset",
      fromDate: "2025-11-01",
    });
    expect(result.columns.map((column) => column.in_books)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(result.accounts[0].values).toEqual([null, 10000, 14000, 9800, 9800]);
    expect(result.total.values[0]).toBeNull();
  });

  it("lays a period past 24 months out by financial year", () => {
    const result = report(books(), {
      fromDate: "2024-03-01",
      toDate: "2026-03-31",
    });
    expect(result.layout).toBe("years");
    expect(
      result.columns.map(({ key, label, detail }) => ({ key, label, detail })),
    ).toEqual([
      { key: "fy-2023", label: "FY 2023–24", detail: "Mar" },
      { key: "fy-2024", label: "FY 2024–25", detail: null },
      { key: "fy-2025", label: "FY 2025–26", detail: null },
    ]);
    expect(result.columns[2].dates).toEqual({
      first_date: "2025-04-01",
      last_date: TODAY,
    });
    const food = named(result.accounts, "Food");
    expect(food.values).toEqual([null, null, 2700]);
    // Still per month, over Dec, Jan and Feb.
    expect(food.average).toBe(900);
    expect(food.outliers).toEqual([false, false, false]);
  });

  it("lists every parent for the picker, by type, with its depth", () => {
    expect(
      report(books()).parents.map(({ name, depth }) => ({ name, depth })),
    ).toEqual([
      { name: "Expenses", depth: 0 },
      { name: "Food", depth: 1 },
    ]);
  });
});

describe("accountEntries", () => {
  it("lists the lines signed by the type's normal side", () => {
    const fixture = books();
    const { entries } = accountEntries(fixture.ledger, {
      accountIds: [fixture.ids.card],
      fromDate: "2026-01-01",
      toDate: "2026-02-28",
      type: "Liability",
    });
    expect(entries.map((entry) => [entry.date, entry.amount])).toEqual([
      ["2026-01-20", 2500],
      ["2026-02-25", -2500],
    ]);
  });
});
