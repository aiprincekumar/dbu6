import {
  accountLedgerHref,
  apiErrorMessage,
  cn,
  type DateSpan,
  FRESH_QUERY,
  formatMonth,
  formatShortDate,
  journalHref,
  Link,
  plural,
  queryOptions,
  spanLabel,
  useQuery,
  useState,
  X,
} from "../../report-kit";
import { reportsApi } from "../client";
import type {
  AccountMonths,
  AccountMonthsRow,
  IncomeExpensesEntry,
} from "../../../shared/index";
import {
  type Cell,
  cellText,
  findRow,
  type Group,
  groupTitle,
  PERIOD_COLUMN,
} from "./pivot";

/*
 * The entries behind one cell: every posted line on its account's subtree
 * (or a parent's own, or the whole group's) in its column's dates. A flow's
 * largest come first, since the question is usually what made it so big; a
 * balance's run by date, as a ledger reads. Each opens its journal.
 */

const FIRST_ROWS = 50;

function entriesQuery(group: Group, dates: DateSpan) {
  const scope =
    group.kind === "account"
      ? { account_id: group.accountId }
      : { group: group.group };
  return queryOptions({
    queryKey: [
      "reports",
      "account-months",
      "entries",
      scope,
      dates.first_date,
      dates.last_date,
    ],
    queryFn: () =>
      reportsApi.accountMonthsEntries({
        query: {
          from_date: dates.first_date,
          to_date: dates.last_date,
          ...scope,
        },
      }),
    ...FRESH_QUERY,
  });
}

/** What a cell stands for, read from the report. */
export type CellScope = {
  name: string;
  /** The column's name: "Feb 2026", "FY 2025–26", or the period's days. */
  when: string;
  dates: DateSpan;
  value: number | null;
  /** In balance mode, the balance before and after; else null. */
  balances: { opening: number; closing: number } | null;
  /** What the entries are read for. */
  group: Group;
  /** A parent's own entries: only those on this account. */
  onlyAccount: number | null;
  /** The account the ledger link opens; null for the whole group. */
  ledgerAccount: number | null;
};

/** The cell's scope, or null when the report has no such row or column. */
export function cellScope(
  report: AccountMonths,
  group: Group,
  cell: Cell,
  period: DateSpan,
): CellScope | null {
  const index =
    cell.column === PERIOD_COLUMN
      ? null
      : report.columns.findIndex((column) => column.key === cell.column);
  if (index === -1) return null;
  const column = index === null ? null : report.columns[index];
  const dates = column?.dates ?? period;
  const when =
    column === null
      ? spanLabel(period)
      : column.key.startsWith("fy-")
        ? [column.label, column.detail].filter(Boolean).join(" ")
        : formatMonth(column.key);

  let figures: {
    name: string;
    opening: number;
    values: readonly (number | null)[];
    total: number | null;
  };
  let scopeGroup: Group = group;
  let onlyAccount: number | null = null;
  let ledgerAccount: number | null =
    group.kind === "account" ? group.accountId : null;
  if (cell.row.kind === "total") {
    figures = { name: groupTitle(report), ...report.total };
  } else {
    const row: AccountMonthsRow | null = findRow(
      report.accounts,
      cell.row.accountId,
    );
    if (row === null || (cell.row.own && row.own === null)) return null;
    scopeGroup = { kind: "account", accountId: row.account_id };
    ledgerAccount = row.account_id;
    if (cell.row.own) {
      onlyAccount = row.account_id;
      figures = {
        name: `${row.name}, not in a sub-account`,
        opening: 0,
        values: row.own!,
        total:
          report.measure === "balance"
            ? null
            : row.own!.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      };
    } else {
      figures = row;
    }
  }

  const value = index === null ? figures.total : figures.values[index];
  let balances: CellScope["balances"] = null;
  if (report.measure === "balance" && onlyAccount === null) {
    if (index === null) {
      balances = {
        opening: figures.opening,
        closing: figures.opening + (figures.total ?? 0),
      };
    } else if (figures.values[index] !== null) {
      const before = figures.values
        .slice(0, index)
        .filter((amount): amount is number => amount !== null);
      balances = {
        opening:
          before.length > 0 ? before[before.length - 1] : figures.opening,
        closing: figures.values[index]!,
      };
    }
  }
  return {
    name: figures.name,
    when,
    dates,
    value,
    balances,
    group: scopeGroup,
    onlyAccount,
    ledgerAccount,
  };
}

export function CellEntries({
  report,
  scope,
  onClose,
  className,
}: {
  report: AccountMonths;
  scope: CellScope;
  onClose: () => void;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const query = useQuery(entriesQuery(scope.group, scope.dates));
  const { measure } = report;
  const accountNames = new Map<number, string>();
  const collect = (rows: readonly AccountMonthsRow[]) => {
    for (const row of rows) {
      accountNames.set(row.account_id, row.name);
      collect(row.children);
    }
  };
  collect(report.accounts);

  const entries = (query.data?.entries ?? []).filter(
    (entry) =>
      scope.onlyAccount === null || entry.account_id === scope.onlyAccount,
  );
  const namesAccounts = new Set(entries.map((e) => e.account_id)).size > 1;
  const sorted =
    measure === "flow"
      ? [...entries].sort((a, b) => b.amount - a.amount)
      : entries;
  const shown = showAll ? sorted : sorted.slice(0, FIRST_ROWS);
  const ledgerHref =
    scope.ledgerAccount === null
      ? null
      : accountLedgerHref(scope.ledgerAccount, {
          from_date: scope.dates.first_date,
          to_date: scope.dates.last_date,
        });
  const figure = cellText(
    measure === "balance" ? "change" : measure,
    scope.balances === null
      ? scope.value
      : scope.balances.closing - scope.balances.opening,
  );

  return (
    <aside
      aria-label={`Entries: ${scope.name}, ${scope.when}`}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <header className="border-b border-sap-border pb-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-subheading text-foreground"
              title={scope.name}
            >
              {scope.name}
            </h2>
            <p className="text-meta text-ink-meta">
              {scope.when}
              {query.data && ` · ${plural(entries.length, "entry", "entries")}`}
            </p>
          </div>
          <span className="tnum mt-0.5 whitespace-nowrap font-mono text-[17px] font-semibold text-foreground">
            {figure.text}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="-mr-1 grid size-7 shrink-0 place-items-center rounded-control text-ink-meta outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          {scope.balances ? (
            <dl className="tnum flex items-baseline gap-2 font-mono text-meta text-ink-soft">
              <dt className="sr-only">Opening</dt>
              <dd>{cellText("balance", scope.balances.opening).text}</dd>
              <span aria-hidden="true">→</span>
              <dt className="sr-only">Closing</dt>
              <dd>{cellText("balance", scope.balances.closing).text}</dd>
            </dl>
          ) : (
            <span />
          )}
          {ledgerHref && (
            <Link
              to={ledgerHref}
              className="text-meta font-semibold text-primary no-underline hover:underline hover:underline-offset-4"
            >
              Open ledger
            </Link>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isError ? (
          <p className="py-2 text-meta text-ink-meta">
            Couldn't load the entries: {apiErrorMessage(query.error)}
          </p>
        ) : !query.data ? (
          <ul aria-hidden="true" className="py-1">
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="my-1.5 h-7 rounded-control bg-sap-nested"
              />
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <p className="py-2 text-meta text-ink-meta">
            No entries in {scope.when}.
          </p>
        ) : (
          <ul>
            {shown.map((entry) => (
              <EntryRow
                key={entry.key}
                entry={entry}
                measure={measure}
                accountName={
                  namesAccounts
                    ? (accountNames.get(entry.account_id) ?? null)
                    : null
                }
              />
            ))}
            {!showAll && sorted.length > FIRST_ROWS && (
              <li className="py-1.5">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-meta font-semibold text-primary hover:underline"
                >
                  Show all {sorted.length}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

function EntryRow({
  entry,
  measure,
  accountName,
}: {
  entry: IncomeExpensesEntry;
  measure: AccountMonths["measure"];
  accountName: string | null;
}) {
  const meta = [accountName, entry.against].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        to={journalHref(entry.journal_id)}
        title="Open journal"
        className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5 text-foreground no-underline outline-none hover:bg-sap-row-hover focus-visible:bg-sap-drill-down-link-soft"
      >
        <span className="tnum font-mono text-meta text-ink-meta">
          {formatShortDate(entry.date)}
        </span>
        <span className="min-w-0">
          <span className="block truncate" title={entry.narration}>
            {entry.narration || "—"}
          </span>
          {meta && (
            <span className="block truncate text-meta text-ink-meta">
              {meta}
            </span>
          )}
        </span>
        <span className="tnum whitespace-nowrap font-mono">
          {/* A line moves a balance, so it is signed. */}
          {cellText(measure === "flow" ? "flow" : "change", entry.amount).text}
        </span>
      </Link>
    </li>
  );
}
