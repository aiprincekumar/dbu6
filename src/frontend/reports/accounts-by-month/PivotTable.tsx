import {
  accountLedgerHref,
  CELL_LINK,
  ChevronRight,
  cn,
  type DateSpan,
  Link,
  ROW_PAD,
  SheetHead,
  Td,
  Th,
  useEffect,
  useRef,
} from "../../report-kit";
import type { AccountMonths, AccountMonthsRow } from "../../../shared/index";
import {
  type Cell,
  cellText,
  groupTitle,
  PERIOD_COLUMN,
  sameCell,
  visibleRows,
  type VisibleRow,
} from "./pivot";

/*
 * The group's accounts as rows and the period's months (or financial years)
 * as columns, one sheet: the account column, Total and Avg stay put while
 * the months scroll sideways inside the table. A row opens one level at a
 * time with its chevron; an amount opens its entries; a name opens the
 * account's ledger.
 */

/*
 * The Avg column is 112px wide, room for a crore, so Total sticks 112px
 * from the right. On a phone neither sticks: the account column needs the
 * room.
 */
const STICK_AVG = "sm:sticky sm:right-0 w-[112px] min-w-[112px] pl-3";
const STICK_TOTAL = "sm:sticky sm:right-[112px] pl-4";

const STICKY_BG = "bg-background group-hover/row:bg-sap-row-hover";

export function PivotTable({
  report,
  dates,
  cell,
  onCell,
  open,
  onToggle,
}: {
  report: AccountMonths;
  dates: DateSpan;
  cell: Cell | null;
  onCell: (cell: Cell | null) => void;
  open: ReadonlySet<number>;
  onToggle: (accountId: number) => void;
}) {
  const rows = visibleRows(report.accounts, open);
  // The open cell scrolls into view, clear of the columns that stay put
  // (the container's scroll padding), as when the panel narrows the table.
  const scroller = useRef<HTMLDivElement>(null);
  const opened = cell === null ? null : JSON.stringify(cell);
  useEffect(() => {
    if (opened === null) return;
    scroller.current
      ?.querySelector("[aria-pressed=true]")
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [opened, open, report]);
  const { measure } = report;
  const tint =
    report.type === "Expense"
      ? "var(--spend-least)"
      : report.type === "Revenue"
        ? "var(--income-least)"
        : "var(--ink-meta)";
  const pick = (next: Cell) => onCell(sameCell(next, cell) ? null : next);
  const ledgerDates = { from_date: dates.first_date, to_date: dates.last_date };
  const rootLedger =
    report.root === null
      ? null
      : accountLedgerHref(report.root.account_id, ledgerDates);

  return (
    <div
      ref={scroller}
      className="overflow-x-auto scroll-pl-[13rem] sm:scroll-pr-[240px]"
    >
      <table className="w-full border-collapse text-row">
        <SheetHead
          title={groupTitle(report)}
          open={
            rootLedger === null
              ? undefined
              : { to: rootLedger, name: "Account ledger", label: "Open ledger" }
          }
          className="sticky left-0 z-10 min-w-[11rem] bg-background pr-4"
        >
          {report.columns.map((column) => (
            <Th
              key={column.key}
              className={cn("pl-3", !column.in_books && "text-ink-meta/50")}
            >
              <span className={cn("block", column.in_books && "text-ink-soft")}>
                {column.label}
              </span>
              <span className="block">
                {column.so_far ? "so far" : (column.detail ?? " ")}
              </span>
            </Th>
          ))}
          <Th className={cn("bg-background", STICK_TOTAL)}>
            <span className="block text-ink-soft">
              {measure === "balance" ? "Change" : "Total"}
            </span>
            <span className="block">{" "}</span>
          </Th>
          <Th className={cn("bg-background pr-1", STICK_AVG)}>
            <span className="block text-ink-soft">Avg</span>
            <span className="block">a month</span>
          </Th>
        </SheetHead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={report.columns.length + 3}
                className="pt-2 text-ink-meta"
              >
                Nothing in these months.
              </td>
            </tr>
          )}
          {rows.map((line) => (
            <AccountLine
              key={
                line.kind === "own"
                  ? `own-${line.parent.account_id}`
                  : line.row.account_id
              }
              line={line}
              report={report}
              tint={tint}
              cell={cell}
              onPick={pick}
              onToggle={onToggle}
              ledgerDates={ledgerDates}
            />
          ))}
          {rows.length > 0 && (
            <tr className="group/row border-t border-sap-border font-semibold text-foreground hover:bg-sap-row-hover">
              <td className={cn("sticky left-0 z-10 pr-4", ROW_PAD, STICKY_BG)}>
                Total
              </td>
              {report.columns.map((column, index) => {
                const value = report.total.values[index];
                return value === null ? (
                  <td
                    key={column.key}
                    className="whitespace-nowrap py-1.5 pl-3 text-right text-meta font-normal text-ink-meta"
                  >
                    not in books
                  </td>
                ) : (
                  <AmountCell
                    key={column.key}
                    measure={measure}
                    value={value}
                    selected={sameCell(cell, {
                      row: { kind: "total" },
                      column: column.key,
                    })}
                    onClick={() =>
                      pick({ row: { kind: "total" }, column: column.key })
                    }
                    label={`Total, ${column.label}`}
                  />
                );
              })}
              <AmountCell
                measure={measure === "balance" ? "change" : measure}
                value={report.total.total}
                selected={sameCell(cell, {
                  row: { kind: "total" },
                  column: PERIOD_COLUMN,
                })}
                onClick={() =>
                  pick({ row: { kind: "total" }, column: PERIOD_COLUMN })
                }
                label="Total, the whole period"
                className={cn(STICKY_BG, STICK_TOTAL)}
              />
              <Td
                className={cn(
                  "pr-1 font-normal text-ink-soft",
                  STICK_AVG,
                  STICKY_BG,
                )}
              >
                {cellText(measure, report.total.average).text}
              </Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AccountLine({
  line,
  report,
  tint,
  cell,
  onPick,
  onToggle,
  ledgerDates,
}: {
  line: VisibleRow;
  report: AccountMonths;
  tint: string;
  cell: Cell | null;
  onPick: (cell: Cell) => void;
  onToggle: (accountId: number) => void;
  ledgerDates: { from_date: string; to_date: string };
}) {
  const { measure } = report;
  const own = line.kind === "own";
  const row: AccountMonthsRow = own ? line.parent : line.row;
  const values = own ? line.parent.own! : line.row.values;
  const name = own ? `${row.name}, not in a sub-account` : row.name;
  const at = (column: string): Cell => ({
    row: { kind: "account", accountId: row.account_id, own },
    column,
  });
  const ledger = own ? null : accountLedgerHref(row.account_id, ledgerDates);
  return (
    <tr className="group/row hover:bg-sap-row-hover">
      <td
        className={cn(
          "sticky left-0 z-10 max-w-[18rem] pr-4",
          ROW_PAD,
          STICKY_BG,
        )}
      >
        <span
          className="flex min-w-0 items-center gap-1"
          style={{ paddingLeft: line.depth * 18 }}
        >
          {line.kind === "account" && line.open !== null ? (
            <button
              type="button"
              aria-expanded={line.open}
              aria-label={`${line.open ? "Close" : "Open"} ${row.name}`}
              onClick={() => onToggle(row.account_id)}
              className="-ml-1 grid size-5 shrink-0 place-items-center rounded-control text-ink-meta outline-none hover:bg-sap-border/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn("size-3.5", line.open && "rotate-90")}
              />
            </button>
          ) : (
            <span aria-hidden="true" className="-ml-1 w-5 shrink-0" />
          )}
          {ledger ? (
            <Link
              to={ledger}
              title={`${row.name}: account ledger`}
              className="truncate text-foreground no-underline hover:underline hover:underline-offset-4"
            >
              {name}
            </Link>
          ) : (
            <span title={name} className="truncate italic text-ink-soft">
              {name}
            </span>
          )}
        </span>
      </td>
      {report.columns.map((column, index) => {
        const value = values[index];
        return value === null ? (
          <td key={column.key} />
        ) : (
          <AmountCell
            key={column.key}
            measure={measure}
            value={value}
            tint={!own && row.outliers[index] ? tint : null}
            selected={sameCell(cell, at(column.key))}
            onClick={() => onPick(at(column.key))}
            label={`${name}, ${column.label}`}
          />
        );
      })}
      {own ? (
        <>
          <AmountCell
            measure={measure === "balance" ? "change" : measure}
            value={sumOf(values, measure)}
            selected={sameCell(cell, at(PERIOD_COLUMN))}
            onClick={() => onPick(at(PERIOD_COLUMN))}
            label={`${name}, the whole period`}
            className={cn(STICKY_BG, STICK_TOTAL)}
          />
          <Td className={cn("pr-1", STICK_AVG, STICKY_BG)} />
        </>
      ) : (
        <>
          <AmountCell
            measure={measure === "balance" ? "change" : measure}
            value={row.total}
            selected={sameCell(cell, at(PERIOD_COLUMN))}
            onClick={() => onPick(at(PERIOD_COLUMN))}
            label={`${name}, the whole period`}
            className={cn(STICKY_BG, STICK_TOTAL)}
          />
          <Td className={cn("pr-1 text-ink-soft", STICK_AVG, STICKY_BG)}>
            {cellText(measure, row.average).text}
          </Td>
        </>
      )}
    </tr>
  );
}

/**
 * A parent's own entries over the period: for a flow or change their sum;
 * for a balance, how far the last balance moved from the first is not
 * known here, so their sum of months is left out.
 */
function sumOf(
  values: readonly (number | null)[],
  measure: AccountMonths["measure"],
): number | null {
  if (measure === "balance") return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** An amount that opens its entries. */
function AmountCell({
  measure,
  value,
  tint = null,
  selected,
  onClick,
  label,
  className,
}: {
  measure: AccountMonths["measure"] | "change";
  value: number | null;
  /** The outlier's colour, when the month stands out. */
  tint?: string | null;
  selected: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  const shown = cellText(measure, value);
  return (
    <td className={cn("p-0", className)}>
      {value === null ? null : (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected}
          aria-label={`${label}: ${shown.text}, entries`}
          className={cn(
            CELL_LINK,
            ROW_PAD,
            "tnum w-full whitespace-nowrap pl-3 pr-1 text-right font-mono",
            shown.dim ? "text-ink-meta" : "text-foreground",
            selected &&
              "bg-sap-drill-down-link-soft shadow-[inset_0_-2px_0_var(--primary)]",
          )}
          style={
            tint && !selected
              ? {
                  background: `color-mix(in srgb, ${tint} 28%, transparent)`,
                }
              : undefined
          }
        >
          {shown.text}
        </button>
      )}
    </td>
  );
}
