import { Link } from "react-router-dom";
import { CreditCard, Landmark, Plus } from "lucide-react";
import { cn } from "@sapporta/ui/cn";
import { useQuery } from "@tanstack/react-query";
import {
  dayLabel,
  type HomeAccount,
  type HomeSummary,
} from "../../shared/index";
import { useAuthStore } from "@sapporta/frontend/auth";
import { usePageTitle } from "@sapporta/frontend/shell";
import { apiErrorMessage } from "../api";
import { Button } from "../components/ui/button";
import { LoadError } from "../components/load-error";
import { Screen } from "../components/screen";
import { NextStepCard } from "../components/next-step-card";
import { StatusChip } from "../components/status-chip";
import { homeSummaryQuery } from "../queries";
import { accountLedgerHref } from "../reports/links";
import { today } from "../reports/shared";
import { BANKS_SETTINGS_ROUTE } from "../views/settings/routes";
import { formatDate, formatMonth } from "../format";
import { DoMyBooks } from "../run/DoMyBooks";
import {
  accountStatus,
  ADD_BANK_OR_CARD,
  GUIDED_IMPORT,
  statementsHref,
  statementsNeededFrom,
  updateState,
  type UpdateCard,
  type UpdateView,
} from "./state";

/**
 * Update: bringing the books up to date (PLAN.md §11 P1, where it is Home).
 * Everything on it helps the user find and drop the statements it needs:
 * the drop and its run, and beside it which statements to download, from
 * which month. One request; the greeting and the card follow from the
 * summary's state.
 */
export function Update() {
  usePageTitle("Update");
  const workspaceName = useAuthStore((s) =>
    s.session.kind === "authenticated"
      ? s.session.context.workspace.name
      : null,
  );
  const query = useQuery(homeSummaryQuery);
  const summary = query.data ?? null;
  const error = query.isError ? apiErrorMessage(query.error) : null;
  const view = summary ? updateState(summary) : null;

  return (
    <Screen
      width="wide"
      header={
        <>
          <p className="text-label uppercase text-ink-meta">
            {dayLabel(today())}
          </p>
          {view ? (
            <h1 className="mt-2 text-title text-foreground sm:text-display">
              {view.greeting}
            </h1>
          ) : (
            <div
              aria-hidden="true"
              className="mt-3 h-sap-ctl w-[min(420px,100%)] rounded-control bg-sap-nested"
            />
          )}
          {workspaceName && (
            <p className="mt-2 text-body text-ink-meta">{workspaceName}</p>
          )}
        </>
      }
    >
      {error ? (
        <div className="mt-5">
          <LoadError
            title="Couldn't load where your books stand"
            message={error}
            retry={() => void query.refetch()}
          />
        </div>
      ) : view ? (
        <>
          {!("kind" in view.card) && (
            <div className="mt-5">
              <StepCard card={view.card} />
            </div>
          )}
          <div
            className={cn(
              "grid gap-x-8 gap-y-8",
              "kind" in view.card ? "mt-5" : "mt-10",
              view.listsAccounts && "lg:grid-cols-[minmax(0,1fr)_352px]",
            )}
          >
            {view.listsAccounts && summary && (
              <StatementsNeeded summary={summary} />
            )}
            <div className="min-w-0 lg:row-start-1">
              {"kind" in view.card ? (
                <DoMyBooks body={view.card.body} byHand={view.card.byHand} />
              ) : (
                <DoMyBooks byHand={GUIDED_IMPORT} />
              )}
            </div>
          </div>
        </>
      ) : (
        <div
          aria-hidden="true"
          className="mt-5 h-[104px] rounded-card bg-sap-nested"
        />
      )}
    </Screen>
  );
}

/**
 * The one thing to do, as Overview shows it until anything is posted: "Do my
 * books", or drafts waiting with the drop below for more statements. Update
 * lays the same out around its statements box.
 */
export function NextStep({ card }: { card: UpdateView["card"] }) {
  if ("kind" in card) {
    return <DoMyBooks body={card.body} byHand={card.byHand} />;
  }
  return (
    <>
      <StepCard card={card} />
      <div className="mt-10">
        <DoMyBooks byHand={GUIDED_IMPORT} />
      </div>
    </>
  );
}

function StepCard({ card }: { card: UpdateCard }) {
  return (
    <NextStepCard
      count={card.count}
      title={card.title}
      body={card.body}
      action={
        <Button render={<Link to={card.action.to} />} nativeButton={false}>
          {card.action.label}
        </Button>
      }
    />
  );
}

/**
 * Which statements to download: each bank and card, the month its next
 * statements start, and the last day its posted statements reached. A side
 * box beside the drop, there to be read before downloading. The month's
 * label is its title; the date stays quieter, there for whoever looks for
 * it. Each name has the box's width to itself, with the two values in
 * columns under it; the account's status, when something waits on it, sits
 * under them.
 */
function StatementsNeeded({ summary }: { summary: HomeSummary }) {
  const statementsTo = statementsHref(summary);
  return (
    <aside
      aria-label="Statements needed"
      className="self-start rounded-card border border-line-inner bg-card px-4 py-3 lg:col-start-2 lg:row-start-1"
    >
      <div
        aria-hidden="true"
        className={cn(
          ROW_GRID,
          "items-baseline border-b border-line-inner pb-2",
        )}
      >
        <span className="col-start-2 text-subheading text-foreground">
          Statement needed from
        </span>
        <span className="text-meta text-ink-meta">Imported until</span>
      </div>
      <ul className="divide-y divide-line-inner">
        {summary.accounts.map((account) => (
          <AccountRow
            key={account.account_id}
            account={account}
            statementsTo={statementsTo}
          />
        ))}
      </ul>
      <div className="border-t border-line-inner pt-2">
        <Link
          to={ADD_BANK_OR_CARD.to}
          className="inline-flex items-center gap-1 text-meta text-ink-meta no-underline hover:text-foreground hover:underline hover:underline-offset-4"
        >
          <Plus className="size-3.5" />
          {ADD_BANK_OR_CARD.label}
        </Link>
      </div>
    </aside>
  );
}

// The icon's gutter, the month's column, and the date's, just wide enough
// for its label, so the month's label fits on one line at phone width; the
// same in the header and each row, so the months and dates line up under
// their labels.
const ROW_GRID = "grid grid-cols-[16px_minmax(0,1fr)_5.5rem] gap-x-2";

/**
 * One account: its name, opening its ledger; under it the month its
 * statements are needed from and the day its posted statements reached; and
 * its status when something waits on it.
 */
function AccountRow({
  account,
  statementsTo,
}: {
  account: HomeAccount;
  statementsTo: string;
}) {
  const status = accountStatus(account, statementsTo);
  const ledger = account.in_ledger
    ? accountLedgerHref(account.account_id)
    : null;
  const Icon = account.kind === "card" ? CreditCard : Landmark;
  return (
    <li className={cn(ROW_GRID, "py-2")}>
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-4 text-ink-meta"
        strokeWidth={1.75}
      />
      <span className="col-span-2 min-w-0 break-words text-row font-semibold">
        {account.in_ledger && ledger ? (
          <Link
            to={ledger}
            title={account.path}
            className="text-foreground no-underline hover:underline hover:underline-offset-4"
          >
            {account.name}
          </Link>
        ) : (
          <span className="text-foreground">{account.name}</span>
        )}
      </span>
      <span className="col-start-2 mt-0.5 self-baseline text-row">
        <NeededFrom account={account} />
      </span>
      <span className="mt-0.5 self-baseline text-meta text-ink-meta">
        <ImportedUntil account={account} />
      </span>
      {!account.in_ledger ? (
        <p className="col-span-2 col-start-2 mt-0.5 text-meta text-ink-meta">
          Deleted from your books. Remove it in{" "}
          <Link
            to={BANKS_SETTINGS_ROUTE}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Banks &amp; cards
          </Link>
        </p>
      ) : (
        status && (
          <div className="col-span-2 col-start-2 mt-1">
            {status.to ? (
              <Link
                to={status.to}
                className="inline-flex rounded-control no-underline outline-none hover:[&>span]:underline hover:[&>span]:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
              </Link>
            ) : (
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
            )}
          </div>
        )
      )}
    </li>
  );
}

/** The date of the account's last posted balance assertion. */
function ImportedUntil({ account }: { account: HomeAccount }) {
  if (!account.in_ledger || account.checkpoint === null) {
    return <span className="text-ink-meta">—</span>;
  }
  return <span className="tnum">{formatDate(account.checkpoint.date)}</span>;
}

/**
 * "Oct 2026": the month the account's next statements start; every statement
 * it has before its first.
 */
function NeededFrom({ account }: { account: HomeAccount }) {
  if (!account.in_ledger) return <span className="text-ink-meta">—</span>;
  const month = statementsNeededFrom(account);
  if (month === null)
    return <span className="text-ink-meta">All you have</span>;
  return <span className="tnum text-foreground">{formatMonth(month)}</span>;
}
