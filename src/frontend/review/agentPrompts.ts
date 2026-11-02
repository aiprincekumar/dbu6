// The tasks Review hands the coding agent. Its Duplicates and Balance checks
// tabs hand one problem: the account and the rows the tab shows. How to
// settle each is in its playbook; how to read the drafts, how a balance check
// is computed and its usual causes, and asking before changing anything are
// in the books guide, which the project's AGENTS.md sends the agent to.
//
// The account list, and an account's Overview, hand everything left at once
// as a run from the drafts (`fixReviewPrompt`): a row of counts per account,
// and the run guide's section that starts there, which holds the method,
// the questions and the report.

import {
  readyToAdd,
  type ReviewAccount,
  type ReviewAccountDetail,
  type ReviewDuplicate,
  type ReviewFailingCheck,
} from "../../shared/index";
import {
  agentPrompt,
  runPrompt,
  type AgentPrompt,
} from "../agent-prompt-rules";
import { plural } from "../format";
import { promptTable } from "../prompt-table";
import { accountsText, duplicatesText } from "./posting-checks";

/** Rows listed in a prompt before the rest are left to the API. */
export const PROMPT_ROW_LIMIT = 50;

/** The run guide's section a run from the drafts follows, by its heading. */
export const DRAFTS_SECTION = "Starting from the drafts";

/**
 * Whether an account has anything left for the agent: a check that Add all
 * can't get past, or rule requests waiting to be turned into rules.
 */
export function leftToFix(
  account: ReviewAccount,
  ready: readonly ReviewAccount[],
): boolean {
  return account.rule_requests > 0 || !ready.includes(account);
}

/**
 * Everything left in Review, for one run: the accounts with something left,
 * a row of counts each, and those ready to add, which it leaves alone. Pass
 * Review's whole list, so an account waiting for another counts as ready
 * when that one is.
 */
export function fixReviewPrompt(
  accounts: readonly ReviewAccount[],
): AgentPrompt {
  const ready = readyToAdd(accounts);
  const left = accounts.filter((account) => leftToFix(account, ready));
  const untouched = ready.filter((account) => account.rule_requests === 0);
  return runPrompt({
    outcome:
      "Get every account in Review ready for me to add to my books, asking me only what you can't settle.",
    facts: [
      `Accounts in Review with something left:\n${leftTable(left)}`,
      ...(untouched.length > 0
        ? [
            `Ready to add, nothing to do: ${untouched.map((account) => `${account.name} (account id ${account.account_id})`).join(", ")}`,
          ]
        : []),
    ].join("\n\n"),
    start: DRAFTS_SECTION,
  });
}

/** What is left in one account's drafts, for the fix-it button on its Overview. */
export function fixAccountPrompt(account: ReviewAccount): AgentPrompt {
  return runPrompt({
    outcome: `Get ${account.name}'s drafts ready for me to add to my books, asking me only what you can't settle.`,
    facts: `What is left in ${account.name}'s drafts:\n${leftTable([account])}`,
    start: DRAFTS_SECTION,
  });
}

// One row per account, counts on the right, the accounts to add first last.
function leftTable(accounts: readonly ReviewAccount[]): string {
  return promptTable(
    [
      "Account",
      "Id",
      "Drafts",
      "Need an account",
      "Duplicates",
      "Failing checks",
      "Rule requests",
      "Add first",
    ],
    accounts.map((account) => [
      account.name,
      String(account.account_id),
      String(account.drafts),
      String(account.uncategorised),
      String(account.duplicates),
      String(account.failing_checks),
      String(account.rule_requests),
      account.add_first.length > 0 ? accountsText(account.add_first) : "",
    ]),
    [1, 2, 3, 4, 5, 6],
  );
}

export function duplicatesPrompt(detail: ReviewAccountDetail): AgentPrompt {
  const { account } = detail;
  return agentPrompt({
    outcome: `Settle ${duplicatesText(detail.duplicates.length)} in ${account.name}'s drafts, so I can add them to my books.`,
    facts: `${accountFacts(detail)}

Possible duplicates (date · amount · draft · what it matched · how):
${rows(detail.duplicates, duplicateLine)}`,
    playbook: "duplicates",
    report: [
      {
        heading: "Verdict",
        says: "for each pair, one transaction or two, and why, in a few words.",
      },
      {
        heading: "The fix",
        says: "the drafts to delete, each by date, description and amount.",
      },
      { heading: "Next", says: "ask whether to apply it." },
    ],
  });
}

export function balanceChecksPrompt(detail: ReviewAccountDetail): AgentPrompt {
  const { account, failing } = detail;
  return agentPrompt({
    outcome: `Get ${account.name}'s ${plural(failing.length, "failing balance check")} to pass, so I can add its drafts to my books.`,
    facts: `${accountFacts(detail)}

Failing checks (running balance minus the statement's is the difference):
${rows(failing, failingLine)}`,
    playbook: "balance-checks",
    report: [
      {
        heading: "What's wrong",
        says: "why the running balance misses the statement's, in one sentence.",
      },
      {
        heading: "The fix",
        says: "each change as date, description, amount, and what it becomes.",
      },
      {
        heading: "After the fix",
        says: "which checks pass, and anything still unexplained.",
      },
      { heading: "Next", says: "ask whether to apply it." },
    ],
  });
}

function accountFacts(detail: ReviewAccountDetail): string {
  const { account, checkpoint } = detail;
  const dates = account.draft_span
    ? `, ${account.draft_span.first_date} to ${account.draft_span.last_date}`
    : "";
  const checked =
    checkpoint === null
      ? "none yet"
      : `${amount(checkpoint.balance)} on ${checkpoint.date}`;
  return `Account: ${account.name} (${account.path}, account id ${account.account_id})
Drafts waiting in Review: ${account.drafts}${dates}
Last statement balance in the books: ${checked}`;
}

function rows<T>(items: readonly T[], line: (item: T) => string): string {
  const shown = items.slice(0, PROMPT_ROW_LIMIT).map(line);
  const rest = items.length - shown.length;
  return [
    ...shown,
    ...(rest > 0 ? [`and ${rest} more (read them from the app)`] : []),
  ].join("\n");
}

function duplicateLine(row: ReviewDuplicate): string {
  const matched =
    row.match_kind === "draft-transfer"
      ? `${row.matched_account ?? "another account"}'s draft ${row.other_draft_id} "${row.other_narration ?? ""}" (a transfer on both statements)`
      : row.other_draft_id !== null
        ? `draft ${row.other_draft_id} "${row.other_narration ?? ""}"`
        : `journal ${row.matched_journal_id} "${row.other_narration ?? ""}" (${row.matched_account ?? "no account"})`;
  return `- ${row.date} · ${row.direction} ${amount(row.amount)} · draft ${row.draft_id} "${row.narration}" · ${matched} · ${row.match_type}, ${Math.round(row.confidence * 100)}%`;
}

function failingLine(row: ReviewFailingCheck): string {
  return `- ${row.date} · draft ${row.draft_id} · running ${amount(row.running_balance)} · statement ${amount(row.assertion)} · difference ${amount(row.diff)}`;
}

function amount(value: number): string {
  return value.toFixed(2);
}
