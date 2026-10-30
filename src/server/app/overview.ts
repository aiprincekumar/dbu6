import {
  TsRestApi,
  workspaceTimeZone,
  type SapportaEnv,
} from "@sapporta/server";
import { Temporal, type TimeZone } from "@sapporta/shared/temporal";
import {
  overviewContract,
  type OverviewAccount,
  type OverviewCategory,
  type OverviewWorthGroup,
  OVERVIEW_AVERAGE_MONTHS,
  type PostedOverview,
  todayIn,
} from "../../shared/index.js";
import { accountTree, branchingLevel } from "./account-tree.js";
import { loadImportPresets } from "../modules/import-presets/index.js";
import { cents, hasJournalsBesideOpenings } from "../modules/journals/index.js";
import {
  readOnlyLedger,
  type ReportLedger,
} from "../modules/ledger-sql/index.js";
import { loadHomeSummary } from "./home.js";
import {
  loadAccountBalances,
  loadMonthlyAmounts,
  type AccountBalance,
} from "./reports/account-amounts.js";
import { incomeExpensesReport } from "./reports/income-expenses.js";
import { authorizeReport, monthEnd } from "./reports/shared.js";

/*
 * The Overview screen's one request: where the money stands for one month.
 * The figures, categories and trend come from Income and Expenses over the
 * month and the months it is averaged against, so the two screens agree, and
 * the charts draw every month an average covers; net worth and the
 * accounts' balances are the ledger's at the month's end. Only posted entries
 * count, never drafts, and until anything beyond the opening balances is
 * posted there is nothing to show.
 */

const api = new TsRestApi<SapportaEnv>();

api.register("overview", overviewContract.overview, ({ c, request }) => {
  const auth = authorizeReport(c, "overview");
  const sqlite = c.get("sqlite");
  if (!hasJournalsBesideOpenings(sqlite, auth)) {
    return { status: 200, body: { posted: false as const } };
  }
  // Home's accounts, so the two screens list and order them alike.
  const summary = loadHomeSummary(
    sqlite,
    auth,
    loadImportPresets(c.get("db"), auth),
  );
  const accounts = summary.accounts.flatMap((account) =>
    account.in_ledger
      ? [
          {
            account_id: account.account_id,
            name: account.name,
            kind: account.kind,
            books_until: account.checkpoint?.date ?? null,
          },
        ]
      : [],
  );
  return {
    status: 200,
    body: overviewReport(readOnlyLedger(sqlite, auth), {
      month: request.query.month ?? null,
      timeZone: workspaceTimeZone(c.get("auth")),
      accounts,
    }),
  };
});

export default api;

/** An account Overview lists, before its balance is read. */
export type OverviewAccountInput = Omit<OverviewAccount, "balance">;

/** The most categories Overview lists. */
const CATEGORY_LIMIT = 8;

export function overviewReport(
  ledger: ReportLedger,
  query: {
    month: string | null;
    // The workspace's, for the month it is today.
    timeZone: TimeZone;
    accounts: readonly OverviewAccountInput[];
  },
): PostedOverview {
  // This month, however far the books go.
  const month = query.month ?? todayIn(query.timeZone).slice(0, 7);

  const yearMonth = Temporal.PlainYearMonth.from(month);
  const report = incomeExpensesReport(ledger, {
    fromDate: `${yearMonth.subtract({ months: OVERVIEW_AVERAGE_MONTHS })}-01`,
    toDate: monthEnd(month),
  });
  const current = report.months.length - 1;
  // The first month with any income or spending, at any date.
  const firstMonth =
    loadMonthlyAmounts(ledger, { fromDate: null, toDate: null })[0]?.month ??
    null;
  // Whether the books cover a month; the months before them count as
  // nothing, not as zeros.
  const inBooks = (row: { month: string }) =>
    firstMonth !== null && row.month >= firstMonth;
  // The months before `month` the books cover, for the averages.
  const covered = report.months
    .slice(0, current)
    .flatMap((row, index) => (inBooks(row) ? [index] : []));
  // Null when the books cover none of them: there is nothing to average.
  const average =
    covered.length === 0
      ? null
      : (amounts: readonly number[]) =>
          covered.reduce((sum, index) => sum + amounts[index], 0) /
          covered.length;
  // Each month's amount, null before the books start.
  const monthly = (amounts: readonly number[]) =>
    report.months.map((row, index) => (inBooks(row) ? amounts[index] : null));
  const spendingMonths = report.months.map((row) => row.spending);

  const listed = branchingLevel(report.spending.accounts)
    .filter(
      (node) =>
        node.months[current] !== 0 || (average?.(node.months) ?? 0) !== 0,
    )
    .sort(
      (a, b) =>
        b.months[current] - a.months[current] || a.name.localeCompare(b.name),
    )
    .slice(0, CATEGORY_LIMIT);
  // What the listed categories leave of the spending, month by month. It is
  // taken from the spending rather than summed from the rest of the tree,
  // which leaves out an account whose months cancel out.
  const otherMonths = spendingMonths.map((spending, index) =>
    cents(listed.reduce((left, node) => left - node.months[index], spending)),
  );

  const balances = loadBalances(ledger, monthEnd(month));
  const previous = loadBalances(
    ledger,
    monthEnd(yearMonth.subtract({ months: 1 }).toString()),
  );

  return {
    posted: true,
    month,
    first_month: firstMonth,
    figures: {
      income: report.months[current].income,
      spending: report.months[current].spending,
      average: average && {
        months: covered.length,
        income: average(report.months.map((row) => row.income)),
        spending: average(spendingMonths),
      },
      spending_monthly: monthly(spendingMonths),
    },
    categories: [
      ...listed.map((node): OverviewCategory => ({
        account_id: node.account_id,
        name: node.name,
        amount: node.months[current],
        average: average?.(node.months) ?? null,
        monthly: monthly(node.months),
      })),
      ...(otherMonths.some((amount) => amount !== 0)
        ? [
            {
              account_id: null,
              name: "Other",
              amount: otherMonths[current],
              average: average?.(otherMonths) ?? null,
              monthly: monthly(otherMonths),
            },
          ]
        : []),
    ],
    months: report.months,
    net_worth: {
      assets: balances.assets,
      liabilities: balances.liabilities,
      net: balances.assets - balances.liabilities,
      previous_net: previous.assets - previous.liabilities,
      asset_groups: worthGroups(balances.ofType("Asset")),
      liability_groups: worthGroups(balances.ofType("Liability")),
    },
    accounts: query.accounts.map((account) => ({
      ...account,
      balance: balances.byAccount.get(account.account_id) ?? 0,
    })),
  };
}

/**
 * Each asset and liability account's balance at the end of `asOf`, what is
 * owed positive for a liability, and the two totals.
 */
function loadBalances(ledger: ReportLedger, asOf: string) {
  const rows = loadAccountBalances(ledger, {
    types: ["Asset", "Liability"],
    asOf,
  });
  const ofType = (type: "Asset" | "Liability") =>
    rows.filter((row) => row.account_type === type);
  const total = (type: "Asset" | "Liability") =>
    ofType(type).reduce((sum, row) => sum + row.amount, 0);
  return {
    assets: total("Asset"),
    liabilities: total("Liability"),
    ofType,
    byAccount: new Map(rows.map((row) => [row.account_id, row.amount])),
  };
}

/** The most groups Net worth lists under assets or liabilities. */
const GROUP_LIMIT = 5;

/**
 * Where a type's balance sits: the first level of its tree that branches,
 * largest first, and Other for the rest past the limit. None when the level
 * has a single account, which would only repeat the total.
 */
function worthGroups(rows: readonly AccountBalance[]): OverviewWorthGroup[] {
  const level = branchingLevel(accountTree(rows));
  if (level.length < 2) return [];
  const groups = level.map((node): OverviewWorthGroup => ({
    account_id: node.account.account_id,
    name: node.account.name,
    amount: node.total,
  }));
  if (groups.length <= GROUP_LIMIT) return groups;
  const shown = groups.slice(0, GROUP_LIMIT - 1);
  const rest = groups.slice(GROUP_LIMIT - 1);
  return [
    ...shown,
    {
      account_id: null,
      name: "Other",
      amount: rest.reduce((sum, group) => sum + group.amount, 0),
    },
  ];
}
