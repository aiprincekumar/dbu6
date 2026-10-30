import {
  apiErrorMessage,
  booksSpanQuery,
  cn,
  type DateSpan,
  FRESH_QUERY,
  keepPreviousData,
  LoadError,
  periodSpan,
  queryOptions,
  readReportPeriod,
  ReportPeriodField,
  Screen,
  spanLabel,
  today,
  ToggleGroup,
  ToggleGroupItem,
  usePageTitle,
  useEffect,
  useQuery,
  useRef,
  useSearchParams,
  useState,
} from "../../report-kit";
import { reportsApi } from "../client";
import type { AccountMonths } from "../../../shared/index";
import { CellEntries, cellScope } from "./CellEntries";
import { GroupPicker } from "./GroupPicker";
import { PivotTable } from "./PivotTable";
import {
  ancestorIds,
  DEFAULT_PRESET,
  type Group,
  readCell,
  readGroup,
  readShow,
  type Show,
  withCell,
  withGroup,
  withPeriod,
  withShow,
} from "./pivot";

const TITLE = "Accounts by Month";

/**
 * The report for a period, a group and what is shown. A change keeps the
 * last figures up until the new ones arrive, so nothing jumps.
 */
function accountMonthsQuery(dates: DateSpan, group: Group, show: Show) {
  const scope =
    group.kind === "account"
      ? { account_id: group.accountId }
      : { group: group.group };
  return queryOptions({
    queryKey: [
      "reports",
      "account-months",
      dates.first_date,
      dates.last_date,
      scope,
      show,
    ],
    queryFn: () =>
      reportsApi.accountMonths({
        query: {
          from_date: dates.first_date,
          to_date: dates.last_date,
          ...scope,
          show,
        },
      }),
    placeholderData: keepPreviousData,
    ...FRESH_QUERY,
  });
}

/**
 * Accounts by Month: a group of accounts, a type's or one account's
 * subtree, month by month. The group, what is shown, the period and the
 * open cell are all in the URL; which rows are open is not.
 */
export function AccountsByMonthPage() {
  usePageTitle(TITLE);
  const [search, setSearch] = useSearchParams();
  const day = today();
  const period = readReportPeriod(search, day, DEFAULT_PRESET);
  const group = readGroup(search);
  const show = readShow(search);
  // All time runs over the days the books cover, so it waits for them.
  const books = useQuery(booksSpanQuery);
  const dates =
    period.kind === "all-time" && books.data === undefined
      ? null
      : periodSpan(period, books.data ?? null, day);
  const query = useQuery({
    ...accountMonthsQuery(
      dates ?? { first_date: day, last_date: day },
      group,
      show,
    ),
    enabled: dates !== null,
  });
  const report = query.data ?? null;
  const error = query.isError
    ? apiErrorMessage(query.error)
    : books.isError
      ? apiErrorMessage(books.error)
      : null;
  const balances =
    report !== null && report.measure !== "flow" && !query.isPlaceholderData;

  return (
    <Screen
      width="full"
      header={
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-title text-foreground">{TITLE}</h1>
              <p className="mt-1 text-body text-ink-meta">
                {dates === null ? " " : spanLabel(dates)}
              </p>
            </div>
            <ReportPeriodField
              period={period}
              onChange={(next) => setSearch(withPeriod(search, next))}
              showSpan={false}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <GroupPicker
              group={group}
              reportType={report?.type ?? null}
              onChange={(next) => setSearch(withGroup(search, next))}
            />
            {balances && (
              <ToggleGroup<Show>
                aria-label="Show"
                value={[show]}
                onValueChange={(value) => {
                  const [next] = value;
                  if (next !== undefined)
                    setSearch(withShow(search, next), { replace: true });
                }}
              >
                <ToggleGroupItem<Show> value="balance">Balance</ToggleGroupItem>
                <ToggleGroupItem<Show> value="change">Change</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </>
      }
    >
      {error ? (
        <div className="mt-5">
          <LoadError
            title="Couldn't load the report"
            message={error}
            retry={() => {
              void books.refetch();
              void query.refetch();
            }}
          />
        </div>
      ) : report === null || dates === null ? (
        <div aria-hidden="true" className="mt-6 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 rounded-control bg-sap-nested" />
          ))}
        </div>
      ) : (
        <Sheet
          report={report}
          group={group}
          dates={dates}
          search={search}
          setSearch={setSearch}
        />
      )}
    </Screen>
  );
}

function Sheet({
  report,
  group,
  dates,
  search,
  setSearch,
}: {
  report: AccountMonths;
  group: Group;
  dates: DateSpan;
  search: URLSearchParams;
  setSearch: (next: URLSearchParams, options?: { replace?: boolean }) => void;
}) {
  const cell = readCell(search);
  const scope = cell === null ? null : cellScope(report, group, cell, dates);
  const setCell = (next: typeof cell) =>
    setSearch(withCell(search, next), { replace: true });

  // Which rows are open; not in the URL. A cell from a link opens the rows
  // above it once its report arrives.
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current || cell === null || cell.row.kind === "total") return;
    revealed.current = true;
    const above = ancestorIds(report.accounts, cell.row.accountId);
    const own = cell.row.own ? [cell.row.accountId] : [];
    if (above.length + own.length > 0)
      setOpen((current) => new Set([...current, ...above, ...own]));
  }, [report, cell]);
  const toggle = (accountId: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(accountId)) next.add(accountId);
      return next;
    });

  // Esc closes the entries.
  const close = useRef<() => void>(() => {});
  close.current = () => {
    if (scope !== null) setCell(null);
  };
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const { target } = event;
      if (
        target instanceof Element &&
        target.closest("[role=dialog],[role=listbox],[role=menu]")
      )
        return;
      close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={cn(
        "mt-6 grid items-start gap-x-8 gap-y-8",
        scope !== null && "lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]",
      )}
    >
      <div className="min-w-0">
        <PivotTable
          report={report}
          dates={dates}
          cell={scope === null ? null : cell}
          onCell={setCell}
          open={open}
          onToggle={toggle}
        />
      </div>
      {scope !== null && (
        <CellEntries
          key={`${search.get("cell")}`}
          report={report}
          scope={scope}
          onClose={() => setCell(null)}
          className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)]"
        />
      )}
    </div>
  );
}
