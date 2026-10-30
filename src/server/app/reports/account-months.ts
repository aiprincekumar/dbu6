import {
  type AccountType,
  accountTree,
  type AccountNode,
  type BalanceType,
  loadAccountBalances,
  loadAccountMonthlyAmounts,
  monthEnd,
  type ReportLedger,
  reportLedger,
  type SapportaEnv,
  subtree,
  TsRestApi,
  workspaceTimeZone,
} from "../../report-kit.js";
import {
  type AccountMonths,
  type AccountMonthsColumn,
  type AccountMonthsGroup,
  type AccountMonthsRow,
  financialYearLabel,
  financialYearOf,
  type IncomeExpensesEntries,
  reportsContract,
  todayIn,
} from "../../../shared/index.js";
import {
  groupJournalEntries,
  ledgerPostings,
  loadAccountLedgerJournalEntries,
  loadLedgerJournals,
} from "./account-ledger.js";
import { booksSpan } from "./books-span.js";
import { monthsBetween } from "./income-expenses.js";

/*
 * Accounts by Month: any group of accounts, one account type or one account
 * with everything under it, as rows, and the months of a period as columns.
 * Income and spending accounts show each month's flow; assets and
 * liabilities each month's closing balance, or its change. A period longer
 * than two years is laid out by financial year instead. Every figure comes
 * from the amounts module the statements read, so they agree, and only
 * posted journals count.
 *
 * Everything the screen shows is worked out here: the columns and which of
 * them the books cover, each row's figures, its average and which of its
 * months stand out. The screen only draws.
 */

const api = new TsRestApi<SapportaEnv>();

api.register(
  "accountMonths",
  reportsContract.accountMonths,
  ({ c, request }) => {
    const ledger = reportLedger(c, "account-months");
    const { from_date, to_date, group, account_id, show } = request.query;
    const report = accountMonthsReport(ledger, {
      fromDate: from_date,
      toDate: to_date,
      group: group ?? null,
      accountId: account_id ?? null,
      show: show ?? null,
      today: todayIn(workspaceTimeZone(c.get("auth"))),
    });
    return report === null
      ? { status: 404, body: accountNotFound() }
      : { status: 200, body: report };
  },
);

api.register(
  "accountMonthsEntries",
  reportsContract.accountMonthsEntries,
  ({ c, request }) => {
    const ledger = reportLedger(c, "account-months");
    const { from_date, to_date, group, account_id } = request.query;
    const resolved = resolveGroup(ledger, {
      group: group ?? null,
      accountId: account_id ?? null,
    });
    if (resolved === null) return { status: 404, body: accountNotFound() };
    return {
      status: 200,
      body: accountEntries(ledger, {
        accountIds: resolved.ids,
        fromDate: from_date,
        toDate: to_date,
        type: resolved.type,
      }),
    };
  },
);

export default api;

function accountNotFound() {
  return { code: "account_not_found", error: "No such account." };
}

/** Months as columns up to this many, as Income and Expenses' chart has bars. */
export const MOST_MONTH_COLUMNS = 24;

/** A month at least this many times its row's average stands out. */
const OUTLIER = 1.5;

const GROUP_TYPES: Record<AccountMonthsGroup, AccountType> = {
  expense: "Expense",
  revenue: "Revenue",
  asset: "Asset",
  liability: "Liability",
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type LedgerAccount = {
  account_id: number;
  name: string;
  parent_id: number | null;
  account_type: AccountType;
};

type Group = {
  type: AccountType;
  /** The group's accounts, parents before children. */
  accounts: LedgerAccount[];
  ids: number[];
  root: { account_id: number; name: string } | null;
};

/**
 * The accounts a group names: one account and everything under it, which
 * all have its type (migrations/0004_account_tree_rules.sql), or every
 * account of a type, Expense by default. Null when the account isn't in the
 * books.
 */
function resolveGroup(
  ledger: ReportLedger,
  query: { group: AccountMonthsGroup | null; accountId: number | null },
): Group | null {
  const all = ledger.all<LedgerAccount>(
    `SELECT id AS account_id, name, parent_id, account_type
     FROM scoped_accounts ORDER BY name, id`,
  );
  if (query.accountId !== null) {
    const accounts = subtree(all, query.accountId);
    if (accounts.length === 0) return null;
    const [root] = accounts;
    return {
      type: root.account_type,
      accounts,
      ids: accounts.map((account) => account.account_id),
      root: { account_id: root.account_id, name: root.name },
    };
  }
  const type = GROUP_TYPES[query.group ?? "expense"];
  const accounts = all.filter((account) => account.account_type === type);
  return {
    type,
    accounts,
    ids: accounts.map((account) => account.account_id),
    root: null,
  };
}

/** What a month's figure is: its flow, its closing balance, or its change. */
type Measure = AccountMonths["measure"];

/** One month of the period, and whether it counts toward an average. */
type Month = {
  month: string;
  inBooks: boolean;
  soFar: boolean;
};

/** An account's figures month by month, its subtree's or its own. */
type Figures = { opening: number; months: number[] };

/** A row as sent, with its figures before they are laid out in columns. */
type Wired = { row: AccountMonthsRow; figures: Figures; children: Wired[] };

/** An account in the tree, ranked by `amount`. */
type RankedAccount = LedgerAccount & { amount: number; kept: boolean };

export function accountMonthsReport(
  ledger: ReportLedger,
  query: {
    fromDate: string;
    toDate: string;
    group: AccountMonthsGroup | null;
    accountId: number | null;
    show: "balance" | "change" | null;
    /** The workspace's today: no column runs past it. */
    today: string;
  },
): AccountMonths | null {
  const group = resolveGroup(ledger, query);
  if (group === null) return null;
  const { type } = group;
  const measure: Measure =
    type === "Revenue" || type === "Expense"
      ? "flow"
      : query.show === "change"
        ? "change"
        : "balance";

  // A period never ends after today.
  const fromDate = query.fromDate;
  const toDate =
    query.toDate > query.today && fromDate <= query.today
      ? query.today
      : query.toDate;

  const span = booksSpan(ledger).span;
  const thisMonth = query.today.slice(0, 7);
  const months: Month[] = monthsBetween(fromDate, toDate).map((month) => ({
    month,
    inBooks:
      span !== null &&
      month >= span.first_date.slice(0, 7) &&
      month <= span.last_date.slice(0, 7),
    soFar: month === thisMonth,
  }));
  const index = new Map(months.map(({ month }, i) => [month, i]));

  // Each account's own movement, month by month.
  const inGroup = new Set(group.ids);
  const movements = new Map<number, number[]>();
  for (const row of loadAccountMonthlyAmounts(ledger, {
    types: [type],
    fromDate,
    toDate,
  })) {
    if (!inGroup.has(row.account_id)) continue;
    const own = movements.get(row.account_id) ?? months.map(() => 0);
    own[index.get(row.month)!] = row.amount;
    movements.set(row.account_id, own);
  }
  // The day before the period's balances, for a balance or its change.
  const openings = new Map<number, number>(
    measure === "flow"
      ? []
      : loadAccountBalances(ledger, {
          types: [type as BalanceType],
          asOf: dayBefore(fromDate),
        }).map((row) => [row.account_id, row.amount]),
  );

  const ownFigures = new Map<number, Figures>(
    group.accounts.map((account) => {
      const moved = movements.get(account.account_id) ?? months.map(() => 0);
      const opening = openings.get(account.account_id) ?? 0;
      if (measure !== "balance")
        return [account.account_id, { opening, months: moved }];
      let balance = opening;
      return [
        account.account_id,
        { opening, months: moved.map((amount) => (balance += amount)) },
      ];
    }),
  );

  // Ranked by the period's flow or change, or by the closing balance; an
  // account is kept when it moved in the period, even to nothing, or holds
  // a balance.
  const ranked: RankedAccount[] = group.accounts.map((account) => {
    const moved = movements.get(account.account_id);
    const opening = openings.get(account.account_id) ?? 0;
    const change = moved?.reduce((sum, amount) => sum + amount, 0) ?? 0;
    return {
      ...account,
      amount: measure === "balance" ? opening + change : change,
      kept: moved !== undefined || opening !== 0,
    };
  });
  const tree = accountTree(ranked, { keep: (account) => account.kept });

  const columns = columnsOf(months, { fromDate, toDate });
  const shape = (figures: Figures) =>
    figureRow(figures, months, columns, measure);

  const wire = (node: AccountNode<RankedAccount>): Wired => {
    const own = ownFigures.get(node.account.account_id)!;
    const children = node.children.map(wire);
    const figures = children.reduce(
      (sum, child) => addFigures(sum, child.figures),
      own,
    );
    return {
      figures,
      children,
      row: {
        account_id: node.account.account_id,
        name: node.account.name,
        ...shape(figures),
        own:
          children.length > 0 && node.account.kept ? shape(own).values : null,
        children: children.map((child) => child.row),
      },
    };
  };

  let top = tree.map(wire);
  // A group under one account with nothing of its own lists what is under
  // it, as `branchingLevel` steps past it.
  while (
    top.length === 1 &&
    top[0].children.length > 0 &&
    top[0].row.own === null
  ) {
    top = top[0].children;
  }

  const totalFigures = top.reduce(
    (sum, node) => addFigures(sum, node.figures),
    { opening: 0, months: months.map(() => 0) },
  );
  const total = shape(totalFigures);

  return {
    type,
    measure,
    root: group.root,
    layout: months.length > MOST_MONTH_COLUMNS ? "years" : "months",
    columns: columns.map((column) => column.wire),
    accounts: top.map((node) => node.row),
    total: {
      opening: total.opening,
      values: total.values,
      total: total.total,
      average: total.average,
    },
  };
}

/** A column of the report, with the indexes of its months. */
type Column = { wire: AccountMonthsColumn; months: number[] };

/**
 * The period's months as columns: one each, or past `MOST_MONTH_COLUMNS`
 * one per financial year, a part year named by its months.
 */
function columnsOf(
  months: readonly Month[],
  period: { fromDate: string; toDate: string },
): Column[] {
  const buckets: { key: string; months: number[] }[] = [];
  if (months.length <= MOST_MONTH_COLUMNS) {
    months.forEach(({ month }, i) => buckets.push({ key: month, months: [i] }));
  } else {
    months.forEach(({ month }, i) => {
      const key = `fy-${financialYearOf(month)}`;
      const last = buckets[buckets.length - 1];
      if (last?.key === key) last.months.push(i);
      else buckets.push({ key, months: [i] });
    });
  }
  return buckets.map((bucket, position) => {
    const first = months[bucket.months[0]].month;
    const last = months[bucket.months[bucket.months.length - 1]].month;
    const byYear = bucket.key.startsWith("fy-");
    const monthName = (month: string) =>
      MONTH_NAMES[Number(month.slice(5)) - 1];
    return {
      months: bucket.months,
      wire: {
        key: bucket.key,
        label: byYear
          ? financialYearLabel(financialYearOf(first))
          : monthName(first),
        detail: byYear
          ? bucket.months.length < 12
            ? first === last
              ? monthName(first)
              : `${monthName(first)}–${monthName(last)}`
            : null
          : position === 0 || first.endsWith("-01")
            ? first.slice(0, 4)
            : null,
        dates: {
          first_date: later(`${first}-01`, period.fromDate),
          last_date: earlier(monthEnd(last), period.toDate),
        },
        in_books: bucket.months.some((i) => months[i].inBooks),
        so_far: bucket.months.some((i) => months[i].soFar),
      },
    };
  });
}

/**
 * A row's figures as the screen shows them: per column (a balance at the
 * column's last month in the books, a flow or change summed over them),
 * the period's total, the monthly average and the months that stand out.
 */
function figureRow(
  figures: Figures,
  months: readonly Month[],
  columns: readonly Column[],
  measure: Measure,
): Pick<
  AccountMonthsRow,
  "opening" | "values" | "total" | "average" | "outliers"
> {
  const values = columns.map((column) => {
    const covered = column.months.filter((i) => months[i].inBooks);
    if (covered.length === 0) return null;
    return measure === "balance"
      ? figures.months[covered[covered.length - 1]]
      : covered.reduce((sum, i) => sum + figures.months[i], 0);
  });
  const closing =
    measure === "balance"
      ? (figures.months[figures.months.length - 1] ?? figures.opening)
      : figures.opening +
        figures.months.reduce((sum, amount) => sum + amount, 0);
  // The months the books cover, before the one holding today.
  const counted = months.flatMap((month, i) =>
    month.inBooks && !month.soFar ? [i] : [],
  );
  const mean = (amount: (i: number) => number) =>
    counted.length === 0
      ? null
      : counted.reduce((sum, i) => sum + amount(i), 0) / counted.length;
  const average = mean((i) => figures.months[i]);
  // A balance drifts, so none stands out; a change stands out either way.
  const base =
    measure === "flow"
      ? average
      : measure === "change"
        ? mean((i) => Math.abs(figures.months[i]))
        : null;
  const outliers = columns.map((column, c) => {
    const value = values[c];
    if (base === null || base <= 0 || value === null) return false;
    // Only a month: a year's sum is not a month's.
    if (column.months.length !== 1) return false;
    const month = months[column.months[0]];
    if (!month.inBooks || month.soFar) return false;
    const size = measure === "change" ? Math.abs(value) : value;
    return size >= OUTLIER * base;
  });
  return {
    opening: figures.opening,
    values,
    total: closing - figures.opening,
    average,
    outliers,
  };
}

function addFigures(a: Figures, b: Figures): Figures {
  return {
    opening: a.opening + b.opening,
    months: a.months.map((amount, i) => amount + b.months[i]),
  };
}

/**
 * Every posted line on the accounts in the period, oldest first, narrated
 * and set against the other side as the account ledger does, signed by the
 * type's normal side as the report's figures are.
 */
export function accountEntries(
  ledger: ReportLedger,
  query: {
    accountIds: readonly number[];
    fromDate: string;
    toDate: string;
    type: AccountType;
  },
): IncomeExpensesEntries {
  const inGroup = new Set(query.accountIds);
  const ledgerQuery = {
    accountIds: [...query.accountIds],
    fromDate: query.fromDate,
    toDate: query.toDate,
  };
  const lines = loadAccountLedgerJournalEntries(ledger, ledgerQuery);
  const accountOf = new Map(
    lines.map((line) => [line.entry_id, line.account_id]),
  );
  const journalLines = groupJournalEntries(lines);
  const sign =
    query.type === "Revenue" ||
    query.type === "Liability" ||
    query.type === "Equity"
      ? -1
      : 1;
  return {
    entries: loadLedgerJournals(ledger, ledgerQuery).flatMap((journal) =>
      ledgerPostings(
        journal,
        journalLines.get(journal.journal_id) ?? [],
        (accountId) => inGroup.has(accountId),
      ).map((posting) => ({
        key: posting.key,
        journal_id: journal.journal_id,
        date: journal.date,
        narration: posting.narration,
        against: posting.against,
        account_id: accountOf.get(posting.entry_id) ?? 0,
        amount: sign * (posting.debit - posting.credit),
      })),
    ),
  };
}

function dayBefore(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function later(a: string, b: string): string {
  return a > b ? a : b;
}

function earlier(a: string, b: string): string {
  return a < b ? a : b;
}
