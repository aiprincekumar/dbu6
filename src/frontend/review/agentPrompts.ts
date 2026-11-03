// The tasks Review hands the coding agent. Its Duplicates and Balance checks
// tabs hand one problem: the account and the rows the tab shows. How to
// settle each is in its playbook; how to read the drafts, how a balance check
// is computed and its usual causes, and asking before changing anything are
// in the books guide, which the project's AGENTS.md sends the agent to.
//
// The account list, and an account's Overview, hand everything left as a
// run from the drafts: the run guide's section that starts there surveys
// what is left, and holds the method, the questions and the report.

import {
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
import { duplicatesText } from "./posting-checks";

/** Rows listed in a prompt before the rest are left to the API. */
export const PROMPT_ROW_LIMIT = 50;

/** Everything left in Review, for one run over every account with drafts. */
export function fixReviewPrompt(): AgentPrompt {
  return runPrompt({
    outcome:
      "Get every account in Review ready for me to add to my books, asking me only what you can't settle.",
    start: "Starting from the drafts",
  });
}

/** What is left in one account's drafts, for the Fix these on its Overview. */
export function fixAccountPrompt(account: ReviewAccount): AgentPrompt {
  return runPrompt({
    outcome: `Get ${account.name}'s drafts ready for me to add to my books, asking me only what you can't settle.`,
    scope: `Account: ${account.name} (account id ${account.account_id})`,
    start: "Starting from the drafts",
  });
}

export function duplicatesPrompt(detail: ReviewAccountDetail): AgentPrompt {
  const { account } = detail;
  return agentPrompt({
    outcome: `Settle ${duplicatesText(detail.duplicates.length)} in ${account.name}'s drafts, so I can add them to my books.`,
    facts: `${accountFacts(detail)}

Possible duplicates (date · amount · draft · what it matched · how):
${rows(detail.duplicates, duplicateLine)}`,
    playbook: "duplicates",
    next: "ask whether to apply it.",
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
    next: "ask whether to apply it.",
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
    row.other_draft_id !== null
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
