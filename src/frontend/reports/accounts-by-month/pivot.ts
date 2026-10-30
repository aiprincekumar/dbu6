import {
  formatWholeAmount,
  formatWholeMoney,
  type ReportPeriod,
  writeReportPeriod,
} from "../../report-kit";
import {
  ACCOUNT_MONTHS_GROUPS,
  type AccountMonths,
  type AccountMonthsGroup,
  type AccountMonthsRow,
} from "../../../shared/index";

/*
 * Accounts by Month's state in the URL, its rows as the open set shows
 * them, and its figures as text. The server works out every figure; this
 * only reads, lays out and writes.
 *
 *   group=expense|revenue|asset|liability   a type's accounts (Expense)
 *   account=<id>                            one account and all under it;
 *                                           wins over group
 *   show=balance|change                     assets and liabilities only
 *   cell=<row>:<column>                     the open entries panel; row is
 *                                           an id, `<id>.own` or `total`,
 *                                           column a column's key or
 *                                           `period`
 */

export const DEFAULT_PRESET = "last-12-months" as const;

/** What the report covers: a type's accounts, or one account's subtree. */
export type Group =
  | { kind: "type"; group: AccountMonthsGroup }
  | { kind: "account"; accountId: number };

export type Show = "balance" | "change";

/** A cell whose entries are open. */
export type Cell = {
  row: { kind: "total" } | { kind: "account"; accountId: number; own: boolean };
  /** A column's key, or the whole period. */
  column: string;
};

export const PERIOD_COLUMN = "period";

export function readGroup(search: URLSearchParams): Group {
  const account = positiveId(search.get("account"));
  if (account !== null) return { kind: "account", accountId: account };
  const group = search.get("group");
  return {
    kind: "type",
    group: (ACCOUNT_MONTHS_GROUPS as readonly string[]).includes(group ?? "")
      ? (group as AccountMonthsGroup)
      : "expense",
  };
}

export function readShow(search: URLSearchParams): Show {
  return search.get("show") === "change" ? "change" : "balance";
}

export function readCell(search: URLSearchParams): Cell | null {
  const value = search.get("cell");
  const match = value?.match(/^(total|(\d+)(\.own)?):([\w-]+)$/);
  if (!match) return null;
  const [, row, id, own, column] = match;
  if (row === "total") return { row: { kind: "total" }, column };
  const accountId = positiveId(id);
  return accountId === null
    ? null
    : { row: { kind: "account", accountId, own: own !== undefined }, column };
}

function cellValue(cell: Cell): string {
  const row =
    cell.row.kind === "total"
      ? "total"
      : `${cell.row.accountId}${cell.row.own ? ".own" : ""}`;
  return `${row}:${cell.column}`;
}

export function sameCell(a: Cell | null, b: Cell | null): boolean {
  return a !== null && b !== null && cellValue(a) === cellValue(b);
}

/** The query string with the group changed: no cell, nothing else lost. */
export function withGroup(
  search: URLSearchParams,
  group: Group,
): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete("cell");
  next.delete("group");
  next.delete("account");
  if (group.kind === "account") next.set("account", String(group.accountId));
  else if (group.group !== "expense") next.set("group", group.group);
  return next;
}

export function withShow(search: URLSearchParams, show: Show): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete("cell");
  if (show === "balance") next.delete("show");
  else next.set("show", show);
  return next;
}

export function withCell(
  search: URLSearchParams,
  cell: Cell | null,
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (cell === null) next.delete("cell");
  else next.set("cell", cellValue(cell));
  return next;
}

/** A new period keeps the group and what is shown, not the open cell. */
export function withPeriod(
  search: URLSearchParams,
  period: ReportPeriod,
): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete("cell");
  return writeReportPeriod(next, period, DEFAULT_PRESET);
}

/** A line of the table as the open rows show it. */
export type VisibleRow =
  | {
      kind: "account";
      row: AccountMonthsRow;
      depth: number;
      /** Null for a row without children. */
      open: boolean | null;
    }
  | { kind: "own"; parent: AccountMonthsRow; depth: number };

/**
 * The rows in view: the top rows, and under each open one its children
 * and, when it has entries of its own, a row for them last.
 */
export function visibleRows(
  rows: readonly AccountMonthsRow[],
  open: ReadonlySet<number>,
  depth = 0,
): VisibleRow[] {
  return rows.flatMap((row): VisibleRow[] => {
    const hasChildren = row.children.length > 0;
    const isOpen = hasChildren && open.has(row.account_id);
    return [
      { kind: "account", row, depth, open: hasChildren ? isOpen : null },
      ...(isOpen
        ? [
            ...visibleRows(row.children, open, depth + 1),
            ...(row.own !== null
              ? [{ kind: "own" as const, parent: row, depth: depth + 1 }]
              : []),
          ]
        : []),
    ];
  });
}

export function findRow(
  rows: readonly AccountMonthsRow[],
  accountId: number,
): AccountMonthsRow | null {
  for (const row of rows) {
    if (row.account_id === accountId) return row;
    const found = findRow(row.children, accountId);
    if (found) return found;
  }
  return null;
}

/** The ids of the rows above an account, top first; empty when it's a top row. */
export function ancestorIds(
  rows: readonly AccountMonthsRow[],
  accountId: number,
): number[] {
  for (const row of rows) {
    if (findRow(row.children, accountId))
      return [row.account_id, ...ancestorIds(row.children, accountId)];
  }
  return [];
}

/** A figure as a cell shows it, and whether it reads dim. */
export type CellText = { text: string; dim: boolean };

/**
 * A figure in whole units. A flow or balance has no sign when it runs the
 * normal way and `−` when it doesn't; a change is always signed. Zero is a
 * dim 0; null (not in the books) is blank.
 */
export function cellText(
  measure: AccountMonths["measure"] | "change",
  value: number | null,
): CellText {
  if (value === null) return { text: "", dim: false };
  if (Math.round(Math.abs(value)) === 0) return { text: "0", dim: true };
  if (measure === "change")
    return {
      text: formatWholeAmount(value, value > 0 ? "in" : "out"),
      dim: false,
    };
  return {
    text: value > 0 ? formatWholeMoney(value) : formatWholeAmount(value, "out"),
    dim: false,
  };
}

/** The group's name in the title cell. */
export function groupTitle(report: AccountMonths): string {
  if (report.root !== null) return report.root.name;
  return TYPE_TITLES[report.type];
}

export const TYPE_TITLES: Record<AccountMonths["type"], string> = {
  Expense: "Spending",
  Revenue: "Income",
  Asset: "Assets",
  Liability: "Liabilities",
  Equity: "Equity",
};

/** The groups by type, as the picker lists them first. */
export const GROUP_LABELS: Record<AccountMonthsGroup, string> = {
  expense: "Spending",
  revenue: "Income",
  asset: "Assets",
  liability: "Liabilities",
};

function positiveId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}
