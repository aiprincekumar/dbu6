import {
  ChevronRight,
  cn,
  type KeyboardEvent,
  type ReactNode,
} from "../../report-kit";
import type {
  IncomeExpenses,
  IncomeExpensesAccount,
} from "../../../shared/index";
import { amountInView, type ChartBar } from "./chart";
import { shadeColor } from "./shade";
import {
  amountDirection,
  formatShare,
  sectionAmount,
  shareOf,
  type Section,
} from "./figures";
import {
  DEFAULT_FOCUS,
  ownMonths,
  sameFocus,
  sectionRows,
  type Focus,
} from "./selection";

/*
 * Income and Spending as two sheets of accounts (PLAN.md §11 P4), on one
 * grid so their columns line up: each section's accounts as their tree, one
 * level open at a time, with what each took in view (the period, or the
 * chart's selected bar) and its share of the section as a bar and a
 * percentage. Each section's heading holds its title and the column labels
 * over one rule; its total closes it.
 *
 * Every row does one thing on click: it brings its account into focus, and
 * the chart and the entries beside the table follow. The chevron alone opens
 * a row. The total row brings its whole section into focus.
 */

const TITLES: Record<Section, string> = {
  spending: "Spending",
  income: "Income",
};

const TOTALS: Record<Section, string> = {
  spending: "Total spent",
  income: "Total income",
};

type RowContext = {
  section: Section;
  sectionTotal: number;
  /** The largest of the section's first rows in view, for the bars' shade. */
  largest: number;
  selectedBar: ChartBar | null;
  focus: Focus;
  onFocus: (focus: Focus) => void;
  open: ReadonlySet<number>;
  onToggle: (accountId: number) => void;
};

export function AccountTable({
  report,
  selectedBar,
  focus,
  onFocus,
  open,
  onToggle,
}: {
  report: IncomeExpenses;
  selectedBar: ChartBar | null;
  focus: Focus;
  onFocus: (focus: Focus) => void;
  open: ReadonlySet<number>;
  onToggle: (accountId: number) => void;
}) {
  const context = { selectedBar, focus, onFocus, open, onToggle };
  return (
    <section
      role="table"
      aria-label="Income and spending by account"
      className="grid grid-cols-[minmax(0,1fr)_auto] text-row sm:grid-cols-[minmax(8rem,max-content)_auto_minmax(48px,1fr)_auto]"
    >
      {(["income", "spending"] as const).map((section) => (
        <SectionRows
          key={section}
          section={section}
          report={report}
          context={context}
        />
      ))}
    </section>
  );
}

function SectionRows({
  section,
  report,
  context,
}: {
  section: Section;
  report: IncomeExpenses;
  context: Omit<RowContext, "section" | "sectionTotal" | "largest">;
}) {
  const { selectedBar } = context;
  const data = report[section];
  const sectionTotal = selectedBar === null ? data.total : selectedBar[section];
  const { rows, ownOf } = sectionRows(data.accounts);
  const largest = Math.max(
    0,
    ...rows.map((account) =>
      amountInView(selectedBar, account.months, account.total),
    ),
  );
  const rowContext: RowContext = {
    ...context,
    section,
    sectionTotal,
    largest,
  };

  return (
    <div
      role="rowgroup"
      className={cn(
        "col-span-full grid grid-cols-subgrid",
        section === "spending" && "mt-10",
      )}
    >
      <div
        role="row"
        className="col-span-full mb-1.5 grid grid-cols-subgrid items-end gap-x-4 border-b border-sap-border pb-2 text-meta text-ink-meta"
      >
        <div role="columnheader">
          <h2 className="text-subheading text-foreground">{TITLES[section]}</h2>
        </div>
        <div role="columnheader" className="justify-self-end">
          {selectedBar?.name ?? "Amount"}
        </div>
        <div
          role="columnheader"
          className="col-span-2 hidden justify-self-end sm:block"
        >
          Share
        </div>
      </div>
      {data.accounts.length === 0 ? (
        <p className="col-span-full py-1.5 text-meta text-ink-meta">
          No {section} in these months
        </p>
      ) : (
        <>
          {rows.map((account) => (
            <AccountRow
              key={account.account_id}
              account={account}
              depth={0}
              context={rowContext}
            />
          ))}
          {ownOf && <OwnRow parent={ownOf} depth={0} context={rowContext} />}
        </>
      )}
      <Row
        context={rowContext}
        focus={{ kind: "section", section }}
        name={<span className="pl-7">{TOTALS[section]}</span>}
        total={sectionTotal}
        depth={0}
        totalRow
      />
    </div>
  );
}

function AccountRow({
  account,
  depth,
  context,
}: {
  account: IncomeExpensesAccount;
  depth: number;
  context: RowContext;
}) {
  const hasChildren = account.children.length > 0;
  const isOpen = hasChildren && context.open.has(account.account_id);
  return (
    <>
      <Row
        context={context}
        focus={{
          kind: "account",
          section: context.section,
          accountId: account.account_id,
        }}
        name={
          <span
            title={account.name}
            className={cn(
              "block max-w-[22rem] truncate",
              depth === 0 ? "text-foreground" : "text-ink-soft",
            )}
          >
            {account.name}
          </span>
        }
        total={amountInView(context.selectedBar, account.months, account.total)}
        depth={depth}
        expander={
          hasChildren
            ? {
                open: isOpen,
                onToggle: () => context.onToggle(account.account_id),
                name: account.name,
              }
            : null
        }
      />
      {isOpen && (
        <>
          {account.children.map((child) => (
            <AccountRow
              key={child.account_id}
              account={child}
              depth={depth + 1}
              context={context}
            />
          ))}
          {account.own !== 0 && (
            <OwnRow parent={account} depth={depth + 1} context={context} />
          )}
        </>
      )}
    </>
  );
}

/**
 * A parent's own entries, so its children add up to its row. Its months are
 * the parent's less its children's.
 */
function OwnRow({
  parent,
  depth,
  context,
}: {
  parent: IncomeExpensesAccount;
  depth: number;
  context: RowContext;
}) {
  const name = `${parent.name}, not in a sub-account`;
  return (
    <Row
      context={context}
      focus={{
        kind: "own",
        section: context.section,
        accountId: parent.account_id,
      }}
      name={
        <span
          title={name}
          className="block max-w-[22rem] truncate italic text-ink-soft"
        >
          {name}
        </span>
      }
      total={amountInView(context.selectedBar, ownMonths(parent), parent.own)}
      depth={depth}
    />
  );
}

/**
 * One line of the table, on the table's columns: name, amount, share bar,
 * share. Clicking anywhere on it but the chevron focuses it. Nothing shows
 * as selected while the page is at rest.
 */
function Row({
  context,
  focus,
  name,
  total,
  depth,
  expander = null,
  totalRow = false,
}: {
  context: RowContext;
  focus: Focus;
  name: ReactNode;
  total: number;
  depth: number;
  expander?: { open: boolean; onToggle: () => void; name: string } | null;
  /** The section's total, closing it under a rule. */
  totalRow?: boolean;
}) {
  const { section, sectionTotal } = context;
  const selected =
    sameFocus(focus, context.focus) && !sameFocus(focus, DEFAULT_FOCUS);
  const share = totalRow ? null : shareOf(total, sectionTotal);
  const select = () => context.onFocus(focus);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    } else if (expander && event.key === "ArrowRight" && !expander.open) {
      expander.onToggle();
    } else if (expander && event.key === "ArrowLeft" && expander.open) {
      expander.onToggle();
    }
  };

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-expanded={expander ? expander.open : undefined}
      onClick={select}
      onKeyDown={onKeyDown}
      className={cn(
        "col-span-full grid min-h-8 cursor-pointer grid-cols-subgrid items-center gap-x-4 pr-1 outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40",
        totalRow && "mt-1 border-t border-sap-border font-semibold",
        selected ? "bg-primary/[0.07] font-semibold" : "hover:bg-sap-row-hover",
      )}
    >
      <div
        role="rowheader"
        className="flex min-w-0 items-center"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {expander ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${expander.open ? "Close" : "Open"} ${expander.name}`}
            onClick={(event) => {
              event.stopPropagation();
              expander.onToggle();
            }}
            className="grid size-7 shrink-0 place-items-center rounded-control text-ink-meta hover:bg-sap-border/60 hover:text-foreground"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-4", expander.open && "rotate-90")}
            />
          </button>
        ) : (
          !totalRow && <span aria-hidden="true" className="w-7 shrink-0" />
        )}
        {name}
      </div>
      <div role="cell" className="justify-self-end">
        <span
          className={cn(
            "tnum font-mono",
            total === 0
              ? "text-ink-meta"
              : amountDirection(section, total) === "in"
                ? "text-money-in"
                : "text-foreground",
          )}
        >
          {total === 0 ? "–" : sectionAmount(section, total)}
        </span>
      </div>
      {/* On a phone, name and amount alone. */}
      <div role="cell" aria-hidden="true" className="hidden min-w-0 sm:block">
        {share !== null && (
          <span
            className="block h-2 rounded-[2px]"
            style={{
              width: `max(2px, ${Math.min(share, 1) * 100}%)`,
              // The biggest account deepest.
              background: shadeColor(
                section,
                context.largest > 0 ? Math.min(1, total / context.largest) : 0,
              ),
            }}
          />
        )}
      </div>
      <div
        role="cell"
        className="tnum hidden w-10 text-right font-mono text-meta text-ink-meta sm:block"
      >
        {share !== null ? formatShare(share) : null}
      </div>
    </div>
  );
}
