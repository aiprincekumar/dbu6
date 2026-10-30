import type {
  GridDataset,
  GridDatasetFooterRow,
  GridDatasetNode,
} from "@sapporta/shared/grid-dataset";
import { wholeUnits } from "../format";

/**
 * A report's grid with its amounts in whole units, for the screens that sum
 * up the books rather than list their entries. The grid draws a currency
 * column with paise, so each currency column's values are rounded here,
 * each from its exact value, and the column is drawn as a plain number.
 * Nothing else changes: a total can differ by 1 from the sum of its rounded
 * rows. The server's figures stay exact; this is only what the screen shows.
 */
export function wholeAmounts(dataset: GridDataset): GridDataset {
  const amounts = new Map(
    Object.entries(dataset.levels).map(([name, level]) => [
      name,
      level.columns
        .filter(
          (column) =>
            column.kind === "number" && column.displayFormat === "currency",
        )
        .map((column) => column.id),
    ]),
  );
  const round = (
    levelName: string,
    columns: Record<string, unknown>,
  ): Record<string, unknown> => {
    const ids = amounts.get(levelName) ?? [];
    if (ids.length === 0) return columns;
    const next = { ...columns };
    for (const id of ids) {
      const value = next[id];
      if (typeof value === "number") next[id] = wholeUnits(value);
      else if (typeof value === "string" && value.trim() !== "") {
        const number = Number(value);
        if (Number.isFinite(number)) next[id] = wholeUnits(number);
      }
    }
    return next;
  };
  const footer = (levelName: string, rows: GridDatasetFooterRow[]) =>
    rows.map((row) => ({ ...row, columns: round(levelName, row.columns) }));
  const node = (n: GridDatasetNode): GridDatasetNode => ({
    ...n,
    columns: round(n.levelName, n.columns),
    ...(n.rollup && { rollup: round(n.levelName, n.rollup) }),
    ...(n.children && {
      children: Object.fromEntries(
        Object.entries(n.children).map(([level, nodes]) => [
          level,
          nodes.map(node),
        ]),
      ),
    }),
    ...(n.childFooterRows && {
      childFooterRows: Object.fromEntries(
        Object.entries(n.childFooterRows).map(([level, rows]) => [
          level,
          footer(level, rows),
        ]),
      ),
    }),
  });
  return {
    ...dataset,
    levels: Object.fromEntries(
      Object.entries(dataset.levels).map(([name, level]) => [
        name,
        {
          ...level,
          columns: level.columns.map((column) =>
            column.kind === "number" && column.displayFormat === "currency"
              ? { ...column, displayFormat: undefined }
              : column,
          ),
        },
      ]),
    ),
    nodes: dataset.nodes.map(node),
    ...(dataset.footerRows && {
      footerRows: footer(dataset.rootLevel, dataset.footerRows),
    }),
  };
}
