/**
 * Rows of a prompt's facts as a plain-text table: a heading line, then one
 * line per row, each column padded to its widest cell, the columns named in
 * `right` (amounts) lined up on the right. Values go in columns to be
 * scanned, in a prompt as on a screen.
 */
export function promptTable(
  headings: readonly string[],
  rows: readonly (readonly string[])[],
  right: readonly number[] = [],
): string {
  const cells = [headings, ...rows];
  const widths = headings.map((_, column) =>
    Math.max(...cells.map((row) => row[column].length)),
  );
  return cells
    .map((row) =>
      row
        .map((cell, column) =>
          right.includes(column)
            ? cell.padStart(widths[column])
            : cell.padEnd(widths[column]),
        )
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}
