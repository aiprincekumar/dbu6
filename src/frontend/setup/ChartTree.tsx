import { useId, useState } from "react";
import { Lock } from "lucide-react";
import { Checkbox } from "@sapporta/ui";
import { cn } from "@sapporta/ui/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@sapporta/ui/tooltip";
import {
  OPENING_BALANCES_NAME,
  type ChartAccount,
  type ChartRow,
} from "../../shared/index";
import { ACCOUNT_TYPE_TERMS } from "../account-type-terms";
import { chartCards, type ChartCardRow, type Ticks } from "./chart-checklist";

export interface ChartChecklist {
  ticks: Ticks;
  locked: Ticks;
  onToggle: (name: string) => void;
}

// The groups a later setup step fills in, marked on their row so nobody
// looks for where to name their bank here. Bank Accounts and Credit Cards
// are where the banks and cards step files each one (BANK_CARD_LOAN_GROUPS
// on the server); Cash and Loans are what the next step records.
const LATER_STEP: Record<string, { step: string; why: string }> = {
  "Bank Accounts": {
    step: "Step 2",
    why: "Add each savings and current account in step 2, Banks & cards.",
  },
  "Credit Cards": {
    step: "Step 2",
    why: "Add each card in step 2, Banks & cards.",
  },
  Cash: {
    step: "Step 3",
    why: "Record the cash you hold in step 3, Cash & loans.",
  },
  Loans: {
    step: "Step 3",
    why: "Record what you owe on each loan in step 3, Cash & loans.",
  },
};

/**
 * A chart of accounts as one section per account type, two levels deep, with deeper accounts folded behind their
 * parent and the first of them named there. A section's one top account,
 * named by its heading, isn't listed again. The sections flow down newspaper
 * columns, so a long one carries on into the next column rather than leaving
 * the others short. With `checklist`, each account has a box; without, it is
 * read-only.
 */
export function ChartTree({
  accounts,
  checklist,
}: {
  accounts: readonly ChartAccount[];
  checklist?: ChartChecklist;
}) {
  // The parents whose folded accounts are on view.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const toggleFold = (name: string) =>
    setUnfolded((was) => {
      const next = new Set(was);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  return (
    <div className="columns-1 gap-x-8 md:columns-2 lg:columns-3">
      {chartCards(accounts).map(({ type, rows }) => {
        const tops = rows.filter((cardRow) => cardRow.row.depth === 0);
        const outdent = tops.length === 1 ? 1 : 0;
        return (
          <section key={type} className="mb-5 last:mb-0">
            <div className="flex break-after-avoid items-baseline justify-between gap-3 border-b border-sap-border pb-2">
              <h3 className="text-label font-semibold uppercase text-foreground">
                {ACCOUNT_TYPE_TERMS[type].term}
              </h3>
            </div>
            <ul className="mt-2">
              {rows.slice(outdent).map((cardRow) => (
                <FoldedRows
                  key={cardRow.row.account.name}
                  cardRow={cardRow}
                  outdent={outdent}
                  open={unfolded.has(cardRow.row.account.name)}
                  onFold={() => toggleFold(cardRow.row.account.name)}
                  checklist={checklist}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// An account on view, its fold toggle, and, when open, what folds under it.
function FoldedRows({
  cardRow: { row, folded },
  outdent,
  open,
  onFold,
  checklist,
}: {
  cardRow: ChartCardRow;
  /** Levels the rows sit left of their depth, for a top account not listed. */
  outdent: number;
  open: boolean;
  onFold: () => void;
  checklist?: ChartChecklist;
}) {
  const fold = folded.length > 0 && (
    <button
      type="button"
      aria-expanded={open}
      onClick={onFold}
      className="ml-auto flex min-w-0 gap-1 rounded-control px-1 text-left text-meta text-ink-meta outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      {open ? (
        `▾ Hide ${folded.length}`
      ) : (
        <FoldedPreview row={row} folded={folded} />
      )}
    </button>
  );
  return (
    <>
      <ChartTreeRow
        row={row}
        outdent={outdent}
        checklist={checklist}
        fold={fold}
      />
      {open &&
        folded.map((below) => (
          <ChartTreeRow
            key={below.account.name}
            row={below}
            outdent={outdent}
            checklist={checklist}
          />
        ))}
    </>
  );
}

// "Rent, Maintenance +1 ▸": the first accounts right under `row`, so what
// folds there reads without opening it. A narrow column cuts the names short,
// never the count.
function FoldedPreview({
  row,
  folded,
}: {
  row: ChartRow;
  folded: readonly ChartRow[];
}) {
  const children = folded.filter((below) => below.depth === row.depth + 1);
  const named = children.slice(0, 2).map((below) => below.account.name);
  const rest = folded.length - named.length;
  return (
    <>
      <span className="truncate">{named.join(", ")}</span>
      <span className="shrink-0">{rest > 0 ? `+${rest} ▸` : "▸"}</span>
    </>
  );
}

function ChartTreeRow({
  row,
  outdent = 0,
  checklist,
  fold,
}: {
  row: ChartRow;
  outdent?: number;
  checklist?: ChartChecklist;
  fold?: React.ReactNode;
}) {
  const { account, depth } = row;
  const id = useId();
  const nameClass = cn(
    "text-row",
    depth === 0 && "font-semibold",
    checklist && !checklist.ticks.has(account.name)
      ? "text-ink-meta"
      : "text-foreground",
  );
  const later = LATER_STEP[account.name];
  // A note shows on hover or focus, marked by a dotted underline. A group a
  // later step fills in says so on its row instead.
  const name =
    account.note && !later ? (
      <Tooltip>
        <TooltipTrigger
          delay={0}
          render={<span tabIndex={0} />}
          className={cn(
            nameClass,
            "rounded-control underline decoration-ink-meta decoration-dotted underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
          )}
        >
          {account.name}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          {account.note}
        </TooltipContent>
      </Tooltip>
    ) : (
      <span className={nameClass}>{account.name}</span>
    );
  const indent = { paddingLeft: `${(depth - outdent) * 20}px` };
  const step = later && (
    <span
      title={later.why}
      className="ml-auto shrink-0 rounded-control bg-muted px-1.5 text-meta text-ink-meta"
    >
      {later.step}
    </span>
  );

  if (!checklist) {
    return (
      <li
        className="flex break-inside-avoid items-baseline gap-2 py-1"
        style={indent}
      >
        {name}
        {step}
        {fold}
      </li>
    );
  }
  const locked = checklist.locked.has(account.name);
  // The label sits beside the box rather than around it, so a click on the
  // box reaches it once.
  return (
    <li
      className="flex break-inside-avoid items-center gap-2 py-1"
      style={indent}
      title={
        !locked
          ? undefined
          : account.name === OPENING_BALANCES_NAME
            ? "dbu6 records the starting balances of your banks and cards against this account, so it can't be unchecked."
            : "Every chart needs this account."
      }
    >
      <Checkbox
        id={id}
        checked={checklist.ticks.has(account.name)}
        disabled={locked}
        onCheckedChange={() => checklist.onToggle(account.name)}
      />
      <label
        htmlFor={id}
        className={cn("shrink-0", locked ? "cursor-default" : "cursor-pointer")}
      >
        {name}
      </label>
      {locked && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-meta text-ink-meta">
          <Lock aria-hidden="true" className="size-3" />
          Required
        </span>
      )}
      {step}
      {fold}
    </li>
  );
}
