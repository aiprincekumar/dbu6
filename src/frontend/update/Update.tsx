import { Link } from "react-router-dom";
import { ChevronRight, CreditCard, Landmark, Plus } from "lucide-react";
import { cn } from "@sapporta/ui/cn";
import { useQuery } from "@tanstack/react-query";
import { dayLabel, type HomeAccount } from "../../shared/index";
import { useAuthStore } from "@sapporta/frontend/auth";
import { usePageTitle } from "@sapporta/frontend/shell";
import { apiErrorMessage } from "../api";
import { AccountParentPath } from "../components/account-name";
import { Button } from "../components/ui/button";
import { LoadError } from "../components/load-error";
import { Screen } from "../components/screen";
import { NextStepCard } from "../components/next-step-card";
import { StatusChip } from "../components/status-chip";
import { homeSummaryQuery } from "../queries";
import { accountLedgerHref } from "../reports/links";
import { today } from "../reports/shared";
import { BANKS_SETTINGS_ROUTE } from "../views/settings/routes";
import { formatDate } from "../format";
import {
  accountStatus,
  ADD_BANK_OR_CARD,
  statementsHref,
  updateState,
  type UpdateCard,
} from "./state";

/**
 * Update: where the books stand and one thing to do to bring them up to
 * date (PLAN.md §11 P1, where it is Home). One request; the greeting and the card
 * follow from the summary's state.
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
      width="narrow"
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
      <div className="mt-5">
        {error ? (
          <LoadError
            title="Couldn't load where your books stand"
            message={error}
            retry={() => void query.refetch()}
          />
        ) : view ? (
          <StepCard card={view.card} />
        ) : (
          <div
            aria-hidden="true"
            className="h-[104px] rounded-card bg-sap-nested"
          />
        )}
      </div>

      {(view === null || view.listsAccounts) && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3 pb-3">
            <h2 className="text-heading text-foreground">Banks &amp; cards</h2>
            {summary && (
              <Button
                render={<Link to={ADD_BANK_OR_CARD.to} />}
                nativeButton={false}
                variant="outline"
                size="sm"
              >
                <Plus />
                {ADD_BANK_OR_CARD.label}
              </Button>
            )}
          </div>
          {summary ? (
            <AccountTable
              accounts={summary.accounts}
              statementsTo={statementsHref(summary)}
            />
          ) : error ? null : (
            <ul aria-hidden="true" className="border-t border-line-inner">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="my-2 h-[52px] rounded-control bg-sap-nested"
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </Screen>
  );
}

/** The one thing to do; Overview shows it too until anything is posted. */
export function StepCard({ card }: { card: UpdateCard }) {
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

function AccountTable({
  accounts,
  statementsTo,
}: {
  accounts: readonly HomeAccount[];
  /** Where an account with no statements yet gets them. */
  statementsTo: string;
}) {
  return (
    <div>
      <div
        aria-hidden="true"
        className="flex items-center gap-3 border-b border-line-inner px-2 pb-2 text-meta text-ink-meta"
      >
        <span className="w-5 shrink-0" />
        <span className={NAME_COLUMN}>Account</span>
        <span className={DATE_COLUMN}>Imported until</span>
        <span className="flex-1" />
        <span className="w-4 shrink-0" />
      </div>
      <ul className="divide-y divide-line-inner border-b border-line-inner">
        {accounts.map((account) => (
          <AccountRow
            key={account.account_id}
            account={account}
            statementsTo={statementsTo}
          />
        ))}
      </ul>
    </div>
  );
}

/*
 * The columns keep the same widths in the header and each row. The name's is
 * fixed rather than stretching, so each date sits close to its account; the
 * status takes the rest of the row, or a line of its own on a phone.
 */
const NAME_COLUMN = "w-36 min-w-0 shrink-0 sm:w-56";
const DATE_COLUMN = "w-24 shrink-0 text-right sm:w-28";

/**
 * One account. The whole row opens its ledger: the name's link stretches over
 * the row, and the status link sits above it, going where the status points.
 */
function AccountRow({
  account,
  statementsTo,
}: {
  account: HomeAccount;
  statementsTo: string;
}) {
  const ledger = account.in_ledger
    ? accountLedgerHref(account.account_id)
    : null;
  const status = accountStatus(account, statementsTo);
  const Icon = account.kind === "card" ? CreditCard : Landmark;
  return (
    <li
      className={cn(
        "relative flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 sm:flex-nowrap",
        ledger && "hover:bg-sap-row-hover",
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0 text-ink-meta"
        strokeWidth={1.75}
      />
      <div className={NAME_COLUMN}>
        {account.in_ledger && ledger ? (
          <Link
            to={ledger}
            title={account.path}
            className="block truncate font-semibold text-foreground no-underline outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
          >
            {account.name}
          </Link>
        ) : (
          <span className="block truncate font-semibold text-foreground">
            {account.name}
          </span>
        )}
        {account.in_ledger && account.parent_path && (
          <AccountParentPath path={account.parent_path} className="mt-0.5" />
        )}
        {!account.in_ledger && (
          <div className="mt-0.5 text-meta text-ink-meta">
            Deleted from your books. Remove it in{" "}
            <Link
              to={BANKS_SETTINGS_ROUTE}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Banks &amp; cards
            </Link>
          </div>
        )}
      </div>
      <span className={DATE_COLUMN}>
        <ImportedUntil account={account} />
      </span>
      {status && (
        <div className="order-last flex min-w-0 basis-full pl-8 sm:order-none sm:flex-1 sm:basis-auto sm:justify-end sm:pl-0">
          {status.to ? (
            <Link
              to={status.to}
              className="relative z-10 -my-2 inline-flex min-h-sap-ctl shrink-0 items-center rounded-control no-underline outline-none hover:[&>span]:underline hover:[&>span]:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
            </Link>
          ) : (
            <StatusChip tone={status.tone} className="shrink-0">
              {status.label}
            </StatusChip>
          )}
        </div>
      )}
      <span aria-hidden="true" className="ml-auto w-4 shrink-0">
        {ledger && <ChevronRight className="size-4 text-ink-meta" />}
      </span>
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
