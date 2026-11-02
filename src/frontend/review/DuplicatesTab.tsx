import { Link } from "react-router-dom";
import { postingCheck, type ReviewDuplicate } from "../../shared/index";
import { reportsApi } from "../reports/client";
import { duplicatesPrompt } from "./agentPrompts";
import { checkText, duplicatesText } from "./posting-checks";
import {
  AccountReport,
  AskYourAgent,
  CheckPasses,
  ReportSummary,
  ReportTab,
} from "./report-tab";
import { useReviewAccount } from "./ReviewAccount";
import { reviewHref } from "./routes";

/**
 * The Duplicates tab (PLAN.md §11 P3): the drafts that look like another
 * draft or a posted entry, read-only, with a prompt to find out why.
 */
export function DuplicatesTab() {
  const { detail } = useReviewAccount();
  const { account } = detail;
  const check = postingCheck(account, "duplicates");
  const transfers = transfersByAccount(detail.duplicates);

  if (check.state === "passes") {
    return (
      <ReportTab>
        <CheckPasses
          title={checkText(check)}
          body={`None of the drafts for ${account.name} match another draft or anything already in your books.`}
        />
      </ReportTab>
    );
  }

  return (
    <ReportTab fitsReport>
      <ReportSummary>
        {duplicatesText(check.count)}. Each draft below looks like another draft
        or an entry already in your books. If one is extra, select it in{" "}
        <Link
          to={reviewHref(account.account_id, "drafts")}
          className="text-primary hover:underline"
        >
          Drafts
        </Link>{" "}
        and delete it. If both are real transactions, ask your coding agent to
        find out why they match.
      </ReportSummary>
      {transfers.map(([name, count]) => (
        <ReportSummary key={name}>
          {count === 1 ? "One is a transfer" : `${count} are transfers`}, also
          on {name}'s statement. Don't delete either side: your coding agent
          settles each into one entry, dated the earlier day.
        </ReportSummary>
      ))}
      <AccountReport
        report="duplicate-drafts"
        accountId={account.account_id}
        call={() =>
          reportsApi.duplicateDrafts({
            query: { base_account_id: account.account_id },
          })
        }
      />
      <AskYourAgent
        title="Check whether each pair is one transaction"
        prompt={duplicatesPrompt(detail)}
      />
    </ReportTab>
  );
}

// The transfers among the duplicates, counted by the account whose statement
// also has them: [name, count], in the order they come.
function transfersByAccount(
  duplicates: readonly ReviewDuplicate[],
): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of duplicates) {
    if (row.match_kind !== "draft-transfer" || row.matched_account === null)
      continue;
    counts.set(row.matched_account, (counts.get(row.matched_account) ?? 0) + 1);
  }
  return Array.from(counts);
}
