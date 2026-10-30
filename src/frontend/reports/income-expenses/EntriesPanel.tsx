import {
  accountLedgerHref,
  apiErrorMessage,
  cn,
  type Direction,
  FRESH_QUERY,
  formatShortDate,
  journalHref,
  Link,
  plural,
  queryOptions,
  type ReactNode,
  SheetHead,
  Th,
  useQuery,
  useState,
  X,
} from "../../report-kit";
import { reportsApi } from "../client";
import type {
  DateSpan,
  IncomeExpenses,
  IncomeExpensesEntry,
} from "../../../shared/index";
import { inBar, type ChartBar } from "./chart";
import { amountDirection, sectionAmount, type Section } from "./figures";
import {
  DEFAULT_FOCUS,
  findAccount,
  sameFocus,
  subtreeIds,
  type Focus,
} from "./selection";

/*
 * The one thing in focus (PLAN.md §11 P4), beside the table: a section, an
 * account with its sub-accounts, or a parent's own, over the period or the
 * chart's selected bar. Its figures, its months in the chart, then the
 * entries behind it: largest first, since the question is usually "what
 * made this so big", or by date, as a ledger reads. Each entry opens its
 * journal; the account's ledger is one link away. At rest it is income and
 * spending side by side, with spending's entries.
 */

const FIRST_ROWS = 50;

type Order = "largest" | "date";

/** One of the focus's figures, as a label over its value. */
export type DetailFigure = {
  label: string;
  figure: string;
  /** Null for a figure with no direction, such as a share. */
  direction: Direction | null;
};

function entriesQuery(section: Section, dates: DateSpan) {
  return queryOptions({
    queryKey: [
      "reports",
      "income-expenses",
      "entries",
      section,
      dates.first_date,
      dates.last_date,
    ],
    queryFn: () =>
      reportsApi.incomeExpensesEntries({
        query: {
          from_date: dates.first_date,
          to_date: dates.last_date,
          section,
        },
      }),
    ...FRESH_QUERY,
  });
}

export function EntriesPanel({
  report,
  dates,
  periodLabel,
  selectedBar,
  focus,
  onClose,
  figures,
  chart,
  className,
}: {
  report: IncomeExpenses;
  dates: DateSpan;
  periodLabel: string;
  selectedBar: ChartBar | null;
  focus: Focus;
  /** Null when there is nothing to close back to. */
  onClose: (() => void) | null;
  figures: readonly DetailFigure[];
  /** The focus's months, when the period has more than one. */
  chart: ReactNode;
  className?: string;
}) {
  const [order, setOrder] = useState<Order>("largest");
  const [showAll, setShowAll] = useState(false);
  const query = useQuery(entriesQuery(focus.section, dates));
  const { section } = focus;
  const account =
    focus.kind === "section"
      ? null
      : findAccount(report[section].accounts, focus.accountId);
  const accountIds =
    focus.kind === "section" || account === null
      ? null
      : focus.kind === "own"
        ? new Set([focus.accountId])
        : subtreeIds(account);
  // Name each entry's account when the list spans more than one.
  const namesAccounts = accountIds === null || accountIds.size > 1;
  const accountNames = new Map<number, string>();
  const collect = (accounts: IncomeExpenses["income"]["accounts"]) => {
    for (const node of accounts) {
      accountNames.set(node.account_id, node.name);
      collect(node.children);
    }
  };
  collect(report[section].accounts);

  const entries = (query.data?.entries ?? []).filter(
    (entry) =>
      (accountIds === null || accountIds.has(entry.account_id)) &&
      (selectedBar === null || inBar(selectedBar, entry.date)),
  );
  const sorted =
    order === "largest"
      ? [...entries].sort((a, b) => b.amount - a.amount)
      : [...entries].reverse();
  const shown = showAll ? sorted : sorted.slice(0, FIRST_ROWS);
  const sectionName = section === "spending" ? "Spending" : "Income";
  const title =
    account === null
      ? sameFocus(focus, DEFAULT_FOCUS)
        ? "Income and spending"
        : sectionName
      : focus.kind === "own"
        ? `${account.name}, not in a sub-account`
        : account.name;
  const ledgerHref =
    account === null
      ? null
      : accountLedgerHref(account.account_id, {
          from_date: (selectedBar?.dates ?? dates).first_date,
          to_date: (selectedBar?.dates ?? dates).last_date,
        });

  return (
    <aside
      aria-label={`In focus: ${title}`}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <table className="w-full border-collapse text-row">
        <SheetHead
          title={
            <span
              className="inline-block max-w-[24rem] truncate align-bottom"
              title={title}
            >
              {title}
            </span>
          }
          open={
            ledgerHref
              ? { to: ledgerHref, name: "Account ledger", label: "Open ledger" }
              : undefined
          }
        >
          <Th>{selectedBar?.name ?? periodLabel}</Th>
          {onClose && (
            <Th className="w-0 pl-2">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                title="Close (Esc)"
                className="-my-1 grid size-6 place-items-center rounded-control text-ink-meta outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </Th>
          )}
        </SheetHead>
      </table>
      <dl className="mt-2 flex flex-wrap gap-x-9 gap-y-2">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0">
            <dt className="text-meta text-ink-meta">{figure.label}</dt>
            <dd
              className={cn(
                "tnum font-mono text-[17px] font-medium",
                figure.direction === "in" ? "text-money-in" : "text-foreground",
              )}
            >
              {figure.figure}
            </dd>
          </div>
        ))}
      </dl>
      {chart}
      <table className="mt-8 w-full border-collapse text-row">
        <SheetHead
          title={
            <>
              {account === null ? `${sectionName} entries` : "Entries"}
              {query.data && (
                <span className="ml-2 text-meta font-normal text-ink-meta">
                  {plural(entries.length, "entry", "entries")}
                </span>
              )}
            </>
          }
        >
          <Th>
            <span role="group" aria-label="Order" className="flex gap-3">
              <OrderButton order="largest" current={order} onPick={setOrder}>
                Largest
              </OrderButton>
              <OrderButton order="date" current={order} onPick={setOrder}>
                Latest
              </OrderButton>
            </span>
          </Th>
        </SheetHead>
      </table>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isError ? (
          <p className="py-1.5 text-meta text-ink-meta">
            Couldn't load the entries: {apiErrorMessage(query.error)}
          </p>
        ) : !query.data ? (
          <ul aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="my-2 h-8 rounded-control bg-sap-nested" />
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <p className="py-1.5 text-meta text-ink-meta">
            No entries in {selectedBar?.name ?? "these months"}
          </p>
        ) : (
          <ul>
            {shown.map((entry) => (
              <EntryRow
                key={entry.key}
                entry={entry}
                section={section}
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
                  className="text-meta font-medium text-sap-link hover:underline"
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

/** One of the entries' orders, as a word that is underlined when chosen. */
function OrderButton({
  order,
  current,
  onPick,
  children,
}: {
  order: Order;
  current: Order;
  onPick: (order: Order) => void;
  children: ReactNode;
}) {
  const on = order === current;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onPick(order)}
      className={cn(
        "rounded-control outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        on
          ? "font-semibold text-foreground underline underline-offset-4"
          : "text-ink-meta hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EntryRow({
  entry,
  section,
  accountName,
}: {
  entry: IncomeExpensesEntry;
  section: Section;
  accountName: string | null;
}) {
  const meta = [accountName, entry.against].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        to={journalHref(entry.journal_id)}
        title="Open journal"
        className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5 text-foreground no-underline outline-none hover:bg-sap-row-hover focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40"
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
        <span
          className={cn(
            "tnum font-mono",
            amountDirection(section, entry.amount) === "in"
              ? "text-money-in"
              : "text-foreground",
          )}
        >
          {sectionAmount(section, entry.amount)}
        </span>
      </Link>
    </li>
  );
}
