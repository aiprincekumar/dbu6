import { Link } from "react-router-dom";
import { postingCheck } from "../../shared/index";
import { Button } from "../components/ui/button";
import { reportsApi } from "../reports/client";
import { balancesHref } from "../views/settings/routes";
import { EmptyState } from "../components/empty-state";
import { InfoButton } from "../views/import-statements/cards";
import { balanceChecksPrompt } from "./agentPrompts";
import { checkText } from "./posting-checks";
import {
  AccountReport,
  AskYourAgent,
  CheckPasses,
  ReportSummary,
  ReportTab,
} from "./report-tab";
import { useReviewAccount } from "./ReviewAccount";

/**
 * The Balance checks tab (PLAN.md §11 P3): the days the drafts' running
 * balance misses the statement's, read-only, with a prompt to find out why.
 */
export function BalanceChecksTab() {
  const { detail } = useReviewAccount();
  const { account } = detail;
  const check = postingCheck(account, "balance-checks");

  if (check.state === "passes") {
    return (
      <ReportTab>
        <CheckPasses
          title={checkText(check)}
          body="Balances here match the ones on your statement. We compare its opening balance, closing balance and per-transaction running balance against the balances we compute for your drafts — every one lines up. These entries are safe to import."
        />
      </ReportTab>
    );
  }

  if (check.state === "none") {
    return (
      <ReportTab>
        <EmptyState
          className="max-w-[760px]"
          title={checkText(check)}
          body="Drafts from a statement carry the statement's balances. These don't, so there's nothing to compare."
        />
      </ReportTab>
    );
  }

  // The count, first date and difference are the tab's badge and the
  // report's first row, so the summary only says what the columns mean.
  return (
    <ReportTab fitsReport>
      <div className="flex items-center gap-1">
        <ReportSummary>
          Your running balance (books + drafts) doesn't match your statement on
          these dates.
        </ReportSummary>
        <InfoButton label="About balance checks">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Drafts:</strong> Your calculated balance at the end of the
              day (<code className="font-mono">Books + Draft entries</code>
              ).
            </li>
            <li>
              <strong>Statement:</strong> The expected balance from your
              statement. For bank accounts, this is taken directly from each
              transaction line. For cards, dbu6 calculates it from the
              statement's opening and closing balances.
            </li>
          </ul>
          <p>
            When all transactions are imported without gaps or duplicates, then
            these two balances should match.
          </p>
        </InfoButton>
      </div>
      {!detail.has_opening_entry && (
        <MissingOpeningBalance accountName={account.path} />
      )}
      <AccountReport
        report="draft-balance-assertions"
        accountId={account.account_id}
        call={() =>
          reportsApi.draftBalanceAssertions({
            query: { base_account_id: account.account_id },
          })
        }
      />
      <AskYourAgent
        title="Investigate and fix automatically"
        prompt={balanceChecksPrompt(detail)}
      />
    </ReportTab>
  );
}

/**
 * The usual cause when an account has no opening entry: every check is off by
 * the balance it started at. The screen it links to suggests the amount.
 */
function MissingOpeningBalance({ accountName }: { accountName: string }) {
  return (
    <section className="mt-4 flex max-w-[760px] flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-attention-border bg-attention-bg px-4 py-3">
      <div className="min-w-0 flex-1 basis-[280px]">
        <h2 className="text-row font-semibold text-attention-ink">
          No opening balance in your books
        </h2>
        <p className="mt-1 text-body text-ink-soft">
          Until {accountName} has one, every balance check on it is off by what
          it held or owed before its first transaction.
        </p>
      </div>
      <Button
        size="sm"
        render={<Link to={balancesHref(accountName)} />}
        nativeButton={false}
      >
        Record the opening balance
      </Button>
    </section>
  );
}
