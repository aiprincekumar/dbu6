import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@sapporta/ui/cn";

/*
 * A screen laid out as one sheet (Overview, Accounts by Month): tables
 * whose heading row holds the section's title and its column labels over
 * one rule, tight rows with no dividers between them, and cells that are
 * links filling the cell.
 */

/**
 * A small link beside a section's title: the report the section opens, with
 * its name for the link's title, and the link's text when it isn't "Open".
 */
export type SheetLink = { to: string; name: string; label?: string };

/**
 * A section's heading: its title, small links to the full reports, and its
 * column labels, over one rule.
 */
export function SheetHead({
  title,
  open,
  className,
  children,
}: {
  title: ReactNode;
  open?: SheetLink | readonly SheetLink[];
  /** For the title's cell. */
  className?: string;
  children?: ReactNode;
}) {
  return (
    <thead>
      <tr>
        <th
          className={cn(
            "w-full whitespace-nowrap border-b border-sap-border pb-2 text-left align-bottom text-subheading text-foreground",
            className,
          )}
        >
          {title}
          {(open === undefined ? [] : "to" in open ? [open] : open).map(
            (link) => (
              <Link
                key={link.to}
                to={link.to}
                title={link.name}
                className="ml-2.5 text-meta font-semibold text-primary no-underline hover:underline hover:underline-offset-4"
              >
                {link.label ?? "Open"}
              </Link>
            ),
          )}
        </th>
        {children}
      </tr>
      {/* Room between the rule and the first row. */}
      <tr aria-hidden="true" className="h-1.5" />
    </thead>
  );
}

/** A row's padding: tight, with no dividers between rows. */
export const ROW_PAD = "py-1.5";

/**
 * A link that fills its table cell, so the whole cell is the target and its
 * fill shows at once under the pointer or keyboard focus. The cell drops its
 * padding and the link carries it.
 */
export const CELL_LINK =
  "block text-inherit no-underline outline-none hover:bg-sap-drill-down-link-soft focus-visible:bg-sap-drill-down-link-soft";

/** A column label in a section's heading row. */
export function Th({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-sap-border pb-2 pl-5 text-right align-bottom text-meta font-normal text-ink-meta",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** A figure's cell: mono, tabular, right-aligned. */
export function Td({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "tnum whitespace-nowrap py-1.5 pl-5 text-right font-mono",
        className,
      )}
    >
      {children}
    </td>
  );
}
