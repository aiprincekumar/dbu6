import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isProblem,
  isWaitBlock,
  postingBlocks,
  postingCheck,
  readyToAdd,
  type PostReadyResult,
  type ReviewAccount,
} from "../../shared/index";
import { usePageTitle } from "@sapporta/frontend/shell";
import { apiErrorMessage, draftTransactionsApi } from "../api";
import { AccountName } from "../components/account-name";
import { AgentButton } from "../components/agent-prompt";
import { EmptyState } from "../components/empty-state";
import { FactTable, type Fact } from "../components/fact-table";
import { LoadError } from "../components/load-error";
import { Screen, ScreenTitle } from "../components/screen";
import { StatusChip, type StatusTone } from "../components/status-chip";
import { Button } from "../components/ui/button";
import { agree, formatDaySpan, plural } from "../format";
import { refreshDraftStatus, reviewAccountsQuery } from "../queries";
import { fixReviewPrompt } from "./agentPrompts";
import { agentFixes } from "./overview-state";
import { BooksSetUp, HandOffNote, UpdateYourBooks } from "./hand-off";
import { checkText } from "./posting-checks";
import {
  readReviewRun,
  REVIEW_ROUTE,
  reviewHref,
  withReviewRun,
} from "./routes";

/**
 * `/review` (PLAN.md §11 P3): the drafts waiting for the books, by account.
 * Its top says what is left across every account, with one button that
 * hands all of it to the coding agent, and one that adds every account
 * nothing blocks (Add all), each on its own, in an order the accounts'
 * add-first waits allow; what it added and what it left, and why, show
 * under it. Each account opens on its own Overview, where it can be added
 * alone. With one account holding drafts there is nothing to list, so it
 * goes straight to that account's Overview, with what /add handed over, as
 * a later add lands. An account opened here keeps the first run
 * (`?run=setup`).
 *
 * The first run's end, "Your books are set up.", is the list emptied on the
 * first run (`?run=setup`): the by-hand chain's, or the one an Add all from
 * books holding nothing but opening balances starts by putting it in the
 * URL.
 */
export function ReviewAccounts() {
  usePageTitle("Review");
  const { search } = useLocation();
  const navigate = useNavigate();
  const run = readReviewRun(new URLSearchParams(search));
  const queryClient = useQueryClient();
  const query = useQuery(reviewAccountsQuery);
  const accounts = query.data ?? null;
  const error = query.isError ? apiErrorMessage(query.error) : null;
  const [added, setAdded] = useState<PostReadyResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // The first run ends once nothing is left to pick.
  const setUp = run.setup && accounts?.length === 0;
  const handingOff = run.imported && accounts !== null && accounts.length > 0;
  // Add all's result stays on this page, whatever it leaves.
  const only =
    accounts?.length === 1 && added === null ? accounts[0] : undefined;
  if (only) {
    return <Navigate to={`${reviewHref(only.account_id)}${search}`} replace />;
  }

  const ready = accounts === null ? [] : readyToAdd(accounts);

  async function addAll() {
    setAdding(true);
    setAddError(null);
    try {
      const result = await draftTransactionsApi.postReadyDrafts({
        body: { base_account_ids: ready.map((one) => one.account_id) },
      });
      setAdded(result);
      if (result.first_post) {
        navigate(withReviewRun(REVIEW_ROUTE, { ...run, setup: true }), {
          replace: true,
        });
      }
    } catch (e) {
      setAddError(apiErrorMessage(e));
    } finally {
      // The button counts the list, so it waits for the list after the post.
      await refreshDraftStatus(queryClient);
      setAdding(false);
    }
  }

  return (
    <Screen
      width="narrow"
      header={
        <ScreenTitle title="Review">
          {!setUp &&
            !handingOff &&
            accounts !== null &&
            accounts.length > 0 && (
              <p>Drafts waiting to go into your books, by account.</p>
            )}
        </ScreenTitle>
      }
    >
      {handingOff && (
        <HandOffNote left={accounts.some(agentFixes)} className="mt-5" />
      )}
      {added && <AddedAll result={added} />}
      {accounts !== null && accounts.length > 0 && (
        <LeftAcrossAccounts
          accounts={accounts}
          ready={ready}
          adding={adding}
          addAll={addAll}
          error={addError}
        />
      )}
      <div className="mt-5">
        {error ? (
          <LoadError
            title="Couldn't load the accounts to review"
            message={error}
            retry={() => void query.refetch()}
          />
        ) : accounts === null ? (
          <ul
            aria-hidden="true"
            className="rounded-card border border-sap-border bg-card shadow-card"
          >
            {[0, 1].map((i) => (
              <li
                key={i}
                className="border-t border-line-inner px-4 py-2.5 first:border-t-0"
              >
                <div className="h-sap-row rounded-control bg-sap-nested" />
              </li>
            ))}
          </ul>
        ) : setUp ? (
          <BooksSetUp />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            body="Drafts appear here once your statements are imported."
            action={<UpdateYourBooks />}
          />
        ) : (
          <ul className="overflow-hidden rounded-card border border-sap-border bg-card shadow-card">
            {accounts.map((account) => (
              <AccountRow
                key={account.account_id}
                account={account}
                setup={run.setup}
              />
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}

/**
 * What is left across the accounts, as counts under their labels, with the
 * two ways on: the agent for what is left, and Add all for the accounts
 * nothing blocks. Add all is the primary step while there is something to
 * add; with nothing ready, the agent is.
 */
function LeftAcrossAccounts({
  accounts,
  ready,
  adding,
  addAll,
  error,
}: {
  accounts: readonly ReviewAccount[];
  ready: readonly ReviewAccount[];
  adding: boolean;
  addAll: () => void;
  error: string | null;
}) {
  const facts = leftFacts(accounts, ready);
  const entries = ready.reduce((sum, account) => sum + account.drafts, 0);
  const fix = accounts.some(agentFixes);
  if (facts.length === 0 && ready.length === 0) return null;
  return (
    <section aria-label="What's left" className="mt-5 space-y-4">
      {facts.length > 0 && (
        <div className="max-w-sm">
          <FactTable heading="Left to fix" rows={facts} />
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {ready.length > 0 && (
          <Button onClick={addAll} disabled={adding}>
            {adding && <Loader2 className="animate-spin" />}
            {adding
              ? "Adding…"
              : `Add ${plural(entries, "entry", "entries")} from ${plural(ready.length, "account")} to my books`}
          </Button>
        )}
        {fix && (
          <AgentButton
            label="Fix these"
            prompt={fixReviewPrompt(accounts)}
            primary={ready.length === 0}
          />
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="text-body text-destructive [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * The counts of what is left, those above zero: each check's count over
 * every account (an account Add all can add has none), the accounts that
 * wait for one Add all can't add, and the rule requests waiting for the
 * agent.
 */
export function leftFacts(
  accounts: readonly ReviewAccount[],
  ready: readonly ReviewAccount[],
): Fact[] {
  const sum = (count: (account: ReviewAccount) => number) =>
    accounts.reduce((total, account) => total + count(account), 0);
  // Accounts whose only block is a wait that Add all can't get past; one
  // with another block is counted under that block.
  const waiting = accounts.filter((account) => {
    const blocks = postingBlocks(account);
    return (
      blocks.length > 0 && blocks.every(isWaitBlock) && !ready.includes(account)
    );
  }).length;
  return [
    { label: "Need an account", value: sum((one) => one.uncategorised) },
    { label: "Possible duplicates", value: sum((one) => one.duplicates) },
    {
      label: "Failing balance checks",
      value: sum((one) => one.failing_checks),
    },
    { label: "Waiting on another account", value: waiting },
    { label: "Rule requests", value: sum((one) => one.rule_requests) },
  ]
    .filter((fact) => fact.value > 0)
    .map((fact) => ({ label: fact.label, value: String(fact.value) }));
}

/** What Add all added, and what it left and why: an account a row each. */
function AddedAll({ result }: { result: PostReadyResult }) {
  return (
    <section
      role="status"
      aria-label="Add all"
      className="mt-5 grid gap-4 sm:grid-cols-2"
    >
      <FactTable
        heading="Added to your books"
        rows={result.posted.map((one) => ({
          label: one.name,
          value: plural(one.drafts_posted, "entry", "entries"),
        }))}
      />
      <FactTable
        heading="Left"
        rows={result.left.map((one) => ({
          label: one.name,
          value: checkText(one.block),
          face: "words",
        }))}
      />
    </section>
  );
}

function AccountRow({
  account,
  setup,
}: {
  account: ReviewAccount;
  setup: boolean;
}) {
  const status = accountStatus(account);
  return (
    <li className="border-t border-line-inner first:border-t-0">
      <Link
        to={withReviewRun(reviewHref(account.account_id), { setup })}
        className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 text-foreground no-underline outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        <span className="min-w-0 flex-1 basis-[220px]">
          <span title={account.path} className="block">
            <AccountName
              name={account.name}
              parentPath={account.parent_path}
              dense
              className="text-[14.5px] font-semibold"
            />
          </span>
          <span className="mt-0.5 block text-meta text-ink-meta">
            {draftsLine(account)}
          </span>
        </span>
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <span aria-hidden="true" className="text-heading text-ink-meta">
          ›
        </span>
      </Link>
    </li>
  );
}

/** "21 drafts · 1–13 Sep". */
export function draftsLine(account: ReviewAccount): string {
  const span = account.draft_span
    ? ` · ${formatDaySpan(account.draft_span)}`
    : "";
  return `${plural(account.drafts, "draft")}${span}`;
}

function accountStatus(account: ReviewAccount): {
  tone: StatusTone;
  label: string;
} {
  if (postingBlocks(account).some(isProblem)) {
    return { tone: "problem", label: "Problems to fix" };
  }
  const categorization = postingCheck(account, "categorization");
  if (categorization.state === "blocks") {
    return {
      tone: categorization.severity,
      label: `${categorization.count} ${agree(categorization.count, "needs", "need")} an account`,
    };
  }
  const balances = postingCheck(account, "balance-checks");
  if (balances.state === "blocks") {
    return { tone: balances.severity, label: checkText(balances) };
  }
  return { tone: "ok", label: "Ready to add" };
}
