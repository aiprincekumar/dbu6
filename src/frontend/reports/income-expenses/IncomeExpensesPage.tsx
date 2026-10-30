import {
  apiErrorMessage,
  booksSpanQuery,
  cn,
  downloadXlsx,
  EmptyState,
  formatDate,
  FRESH_QUERY,
  incomeStatementHref,
  keepPreviousData,
  Link,
  LoadError,
  periodSpan,
  queryOptions,
  readReportPeriod,
  ReportPeriodField,
  type ReportPeriod,
  Screen,
  spanLabel,
  today,
  usePageTitle,
  useEffect,
  useQuery,
  useRef,
  useSearchParams,
  useState,
} from "../../report-kit";
import { reportsApi } from "../client";
import type { DateSpan, IncomeExpenses } from "../../../shared/index";
import { AccountTable } from "./AccountTable";
import {
  amountInView,
  barByKey,
  barSeries,
  chartBars,
  type ChartBar,
  usualAmount,
} from "./chart";
import { EntriesPanel, type DetailFigure } from "./EntriesPanel";
import { incomeExpensesFileName, incomeExpensesSheets } from "./export";
import {
  amountDirection,
  figures,
  formatShare,
  isEmptyPeriod,
  sectionAmount,
  shareOf,
} from "./figures";
import { MonthChart } from "./MonthChart";
import {
  DEFAULT_PRESET,
  emptyPeriodSentence,
  periodHeading,
  withinOneMonth,
  writePeriod,
} from "./period";
import {
  ancestorIds,
  DEFAULT_FOCUS,
  findAccount,
  ownMonths,
  readFocus,
  sameFocus,
  withBar,
  withFocus,
  type Focus,
} from "./selection";

const TITLE = "Income and Expenses";

/** The small links beside the title. */
const HEAD_LINK =
  "text-meta font-semibold text-primary no-underline hover:underline hover:underline-offset-4 disabled:text-ink-meta disabled:no-underline";

/**
 * Income and Expenses for a period. A new period keeps showing the last
 * one's figures until its own arrive, so nothing jumps.
 */
function incomeExpensesQuery(dates: DateSpan) {
  return queryOptions({
    queryKey: ["reports", "income-expenses", dates.first_date, dates.last_date],
    queryFn: () =>
      reportsApi.incomeExpenses({
        query: { from_date: dates.first_date, to_date: dates.last_date },
      }),
    placeholderData: keepPreviousData,
    ...FRESH_QUERY,
  });
}

/**
 * Income and Expenses (PLAN.md §11 P4): where the money came from and
 * where it went over a period, laid out as one sheet. The period's figures
 * in one strip; then on the left where the money went, and on the right the
 * one thing in focus: its months and its entries. Select an account on the
 * left or a month in the chart, and the rest follows; Esc steps back out.
 */
export function IncomeExpensesPage() {
  usePageTitle(TITLE);
  const [search, setSearch] = useSearchParams();
  const day = today();
  const period = readReportPeriod(search, day, DEFAULT_PRESET);
  // All time runs over the days the books cover, so it waits for them.
  const books = useQuery(booksSpanQuery);
  const dates =
    period.kind === "all-time" && books.data === undefined
      ? null
      : periodSpan(period, books.data ?? null, day);
  const query = useQuery({
    ...incomeExpensesQuery(dates ?? { first_date: day, last_date: day }),
    enabled: dates !== null,
  });
  const report = query.data ?? null;
  const error = query.isError
    ? apiErrorMessage(query.error)
    : books.isError
      ? apiErrorMessage(books.error)
      : null;
  // The books end before the period does: its last months aren't in yet.
  const booksUntil =
    dates !== null &&
    books.data != null &&
    books.data.last_date < dates.last_date
      ? books.data.last_date
      : null;

  // A new period keeps the account in focus, not the month.
  const showPeriod = (next: ReportPeriod) =>
    setSearch(writePeriod(search, next));

  return (
    <Screen
      width="full"
      header={
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h1 className="text-title text-foreground">{TITLE}</h1>
          <div className="flex items-baseline gap-5">
            {dates !== null && (
              <Link
                to={incomeStatementHref(dates.first_date, dates.last_date)}
                className={HEAD_LINK}
              >
                Income statement
              </Link>
            )}
            <button
              type="button"
              disabled={
                report === null || dates === null || query.isPlaceholderData
              }
              onClick={() =>
                report &&
                dates &&
                downloadXlsx(
                  incomeExpensesFileName(dates),
                  incomeExpensesSheets(report),
                )
              }
              className={HEAD_LINK}
            >
              Export to Excel
            </button>
          </div>
        </div>
      }
    >
      {/* The period sits on the strip it sums up. */}
      <div className="mt-5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ReportPeriodField
          period={period}
          onChange={showPeriod}
          showSpan={false}
        />
        <span className="text-meta text-ink-meta">
          {dates === null ? " " : periodHeading(dates)}
          {booksUntil && ` · books until ${formatDate(booksUntil)}`}
        </span>
      </div>
      {error ? (
        <LoadError
          title="Couldn't load income and expenses"
          message={error}
          retry={() => {
            void books.refetch();
            void query.refetch();
          }}
        />
      ) : report === null || dates === null ? (
        <>
          <FigureStrip totals={null} scope={null} />
          <div
            aria-hidden="true"
            className="mt-10 grid gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
          >
            <div className="h-[320px] rounded-control bg-sap-nested" />
            <div className="h-[320px] rounded-control bg-sap-nested max-lg:hidden" />
          </div>
        </>
      ) : isEmptyPeriod(report) ? (
        <EmptyState
          className="mt-5"
          title="No income or spending in these months"
          body={emptyPeriodSentence(dates)}
        />
      ) : (
        <PeriodReport
          report={report}
          dates={dates}
          today={day}
          booksUntil={booksUntil}
          search={search}
          setSearch={setSearch}
        />
      )}
    </Screen>
  );
}

function PeriodReport({
  report,
  dates,
  today,
  booksUntil,
  search,
  setSearch,
}: {
  report: IncomeExpenses;
  dates: DateSpan;
  today: string;
  /** The books' last day, when the period runs past it. */
  booksUntil: string | null;
  search: URLSearchParams;
  setSearch: (next: URLSearchParams, options?: { replace?: boolean }) => void;
}) {
  // While a new period loads, the last one's figures stay, months and all.
  const bars = chartBars(report.months, dates, today);
  const showChart = !withinOneMonth(dates);
  const selectedBar = showChart ? barByKey(bars, search.get("month")) : null;
  const focus = readFocus(search, report);
  const focusAccount =
    focus.kind === "section"
      ? null
      : findAccount(report[focus.section].accounts, focus.accountId);

  // Which rows are open; not in the URL. An account in focus from a link
  // opens the rows above it once its report arrives.
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current || focus.kind === "section") return;
    revealed.current = true;
    const above = ancestorIds(report[focus.section].accounts, focus.accountId);
    if (above.length > 0) setOpen((current) => new Set([...current, ...above]));
  }, [report, focus]);
  const toggle = (accountId: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(accountId)) next.add(accountId);
      return next;
    });

  const setFocus = (next: Focus) =>
    setSearch(withFocus(search, next), { replace: true });
  const setBar = (key: string | null) =>
    setSearch(withBar(search, key), { replace: true });
  const focused = !sameFocus(focus, DEFAULT_FOCUS);

  // Esc steps back out: the account first, then the month.
  const escape = useRef<() => void>(() => {});
  escape.current = () => {
    if (focused) setFocus(DEFAULT_FOCUS);
    else if (selectedBar) setBar(null);
  };
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A popover's own Esc closes it, not the focus.
      const { target } = event;
      if (
        target instanceof Element &&
        target.closest("[role=dialog],[role=listbox],[role=menu]")
      )
        return;
      escape.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scope = selectedBar ?? {
    income: report.income.total,
    spending: report.spending.total,
  };
  const series =
    focusAccount === null
      ? null
      : {
          name:
            focus.kind === "own"
              ? `${focusAccount.name}, not in a sub-account`
              : focusAccount.name,
          section: focus.section,
          values: barSeries(
            bars,
            focus.kind === "own"
              ? ownMonths(focusAccount)
              : focusAccount.months,
          ),
        };

  return (
    <>
      <FigureStrip totals={scope} scope={selectedBar} />
      <div className="mt-8 grid items-start gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <AccountTable
            report={report}
            selectedBar={selectedBar}
            focus={focus}
            onFocus={(next) =>
              setFocus(sameFocus(next, focus) ? DEFAULT_FOCUS : next)
            }
            open={open}
            onToggle={toggle}
          />
        </div>
        <EntriesPanel
          report={report}
          dates={dates}
          periodLabel={spanLabel(dates)}
          selectedBar={selectedBar}
          focus={focus}
          onClose={focused ? () => setFocus(DEFAULT_FOCUS) : null}
          figures={detailFigures({
            report,
            bars: showChart ? bars : null,
            selectedBar,
            focus,
            series: series?.values ?? null,
            booksUntil,
          })}
          chart={
            showChart && (
              <MonthChart
                bars={bars}
                selected={selectedBar?.key ?? null}
                onSelect={setBar}
                series={series}
                booksUntil={booksUntil}
              />
            )
          }
          className={cn(
            // Beside the list, following the scroll; on a narrower screen
            // below it, and a sheet over the page while an account is in
            // focus.
            "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)]",
            focused
              ? "max-lg:fixed max-lg:inset-x-2 max-lg:top-16 max-lg:bottom-2 max-lg:z-50 max-lg:bg-background max-lg:px-4 max-lg:shadow-sap-elevated"
              : "max-lg:mt-10",
          )}
        />
      </div>
    </>
  );
}

/**
 * The figures of what is in focus, as label-and-value columns: what it took
 * in view, its usual month (or year) when the chart shows every bar, and an
 * account's share of its section. At rest, the usual income and spending.
 */
function detailFigures({
  report,
  bars,
  selectedBar,
  focus,
  series,
  booksUntil,
}: {
  report: IncomeExpenses;
  /** The chart's bars, or null when the period has no chart. */
  bars: readonly ChartBar[] | null;
  selectedBar: ChartBar | null;
  focus: Focus;
  /** The focused account's bars, or null for a section. */
  series: readonly number[] | null;
  /** The books' last day, when the period runs past it. */
  booksUntil: string | null;
}): DetailFigure[] {
  const { section } = focus;
  const sectionTotal =
    selectedBar === null ? report[section].total : selectedBar[section];
  const account =
    focus.kind === "section"
      ? null
      : findAccount(report[section].accounts, focus.accountId);
  const amount =
    account === null
      ? sectionTotal
      : focus.kind === "own"
        ? amountInView(selectedBar, ownMonths(account), account.own)
        : amountInView(selectedBar, account.months, account.total);
  const figure = (label: string, value: number): DetailFigure => ({
    label,
    figure: sectionAmount(section, value),
    direction: amountDirection(section, value),
  });

  // The usual month (or year), while the chart shows every bar.
  const every =
    bars !== null && bars.length > 1 && selectedBar === null ? bars : null;
  const per = bars?.[0]?.key.startsWith("fy-") ? "year" : "month";
  const usual = (values: readonly number[]) =>
    every === null ? null : usualAmount(every, values, booksUntil);

  // At rest the strip holds the totals; beside them, the usual income and
  // spending.
  if (sameFocus(focus, DEFAULT_FOCUS)) {
    if (every === null) return [];
    const income = usual(every.map((bar) => bar.income));
    const spent = usual(every.map((bar) => bar.spending));
    return [
      ...(income === null
        ? []
        : [
            {
              label: `Income per ${per}`,
              figure: sectionAmount("income", income),
              direction: amountDirection("income", income),
            },
          ]),
      ...(spent === null ? [] : [figure(`Spent per ${per}`, spent)]),
    ];
  }

  const shown = [figure(selectedBar?.name ?? "Total", amount)];
  const typical = usual(series ?? (every ?? []).map((bar) => bar[section]));
  if (typical !== null) shown.push(figure(`Per ${per}`, typical));
  const share = account === null ? null : shareOf(amount, sectionTotal);
  if (share !== null) {
    shown.push({
      label: `Share of ${section}`,
      figure: formatShare(share),
      direction: null,
    });
  }
  return shown;
}

/**
 * The period's figures, or the selected bar's, in one tinted strip:
 * income, spending, what they left, and that as a share of income.
 */
function FigureStrip({
  totals,
  scope,
}: {
  /** Null while they load. */
  totals: { income: number; spending: number } | null;
  scope: ChartBar | null;
}) {
  const shown = totals && figures(totals);
  const overspent = shown?.remaining.tone === "overspent";
  const cells: {
    label: string;
    figure: string | undefined;
    ink?: boolean;
    name?: boolean;
  }[] = [
    ...(scope ? [{ label: "Showing", figure: scope.name, name: true }] : []),
    {
      label: "Income",
      figure: totals ? sectionAmount("income", totals.income) : undefined,
      ink: totals !== null && amountDirection("income", totals.income) === "in",
    },
    {
      label: "Spent",
      figure: totals ? sectionAmount("spending", totals.spending) : undefined,
      ink:
        totals !== null &&
        amountDirection("spending", totals.spending) === "in",
    },
    {
      label: overspent ? "Overspent" : "Saved",
      figure: shown?.remaining.figure,
    },
    {
      label: "Saved %",
      figure: shown ? (shown.remaining.share ?? "—") : undefined,
    },
  ];
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-y-2.5 rounded-lg bg-secondary py-2.5",
        scope ? "sm:grid-cols-5" : "sm:grid-cols-4",
      )}
    >
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={cn(
            "min-w-0 px-4",
            index > 0 && "sm:border-l sm:border-sap-border",
            index % 2 === 1 && "border-l border-sap-border",
          )}
        >
          <dt className="text-meta text-ink-meta">{cell.label}</dt>
          <dd className="mt-0.5">
            {cell.figure === undefined ? (
              <span
                aria-hidden="true"
                className="inline-block h-6 w-28 rounded-control bg-sap-nested"
              />
            ) : (
              <span
                className={cn(
                  "whitespace-nowrap text-[19px] font-medium",
                  cell.name ? "font-sans text-foreground" : "tnum font-mono",
                  cell.ink ? "text-money-in" : "text-foreground",
                )}
              >
                {cell.figure}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
