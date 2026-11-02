// The task Reconciliation Differences hands the coding agent: the posted
// balance checks the books no longer meet, each as the report's row shows
// it. Why a check that once matched stops matching, and how to put the books
// right, is the posted-balance-check playbook's; the report only says which.

import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { agentPrompt, type AgentPrompt } from "../agent-prompt-rules";
import { plural } from "../format";
import { promptTable } from "../prompt-table";
import { PROMPT_ROW_LIMIT } from "../review/agentPrompts";

/** A posted balance check the books miss, as the report's row has it. */
export interface PostedDifference {
  accountId: number;
  account: string;
  date: string;
  journalId: number;
  /** The books' running balance on the day. */
  books: number;
  /** What the statement says it was. */
  statement: number;
  /** Books minus statement. */
  difference: number;
}

/**
 * The report's rows as differences. A row missing one of the columns the
 * server's report always sends is left out.
 */
export function postedDifferences(
  result: GridDataset | null,
): PostedDifference[] {
  if (result === null) return [];
  return result.nodes.flatMap(({ columns }) => {
    const accountId = num(columns.account_id);
    const journalId = num(columns.journal_id);
    const books = num(columns.running_balance);
    const statement = num(columns.assertion);
    const difference = num(columns.diff);
    const { account_name: account, date } = columns;
    if (
      accountId === null ||
      journalId === null ||
      books === null ||
      statement === null ||
      difference === null ||
      typeof account !== "string" ||
      typeof date !== "string"
    ) {
      return [];
    }
    return [
      { accountId, account, date, journalId, books, statement, difference },
    ];
  });
}

export function postedBalanceCheckPrompt(
  differences: readonly PostedDifference[],
): AgentPrompt {
  const accounts = new Set(differences.map((one) => one.accountId)).size;
  return agentPrompt({
    outcome: `Find why ${plural(differences.length, "posted balance check")} in ${plural(accounts, "account")} stopped matching ${differences.length === 1 ? "its statement" : "their statements"}, and get my books to match again.`,
    facts: `Posted balance checks that miss (books minus statement is the difference):
${differencesTable(differences)}`,
    playbook: "posted-balance-check",
    report: [
      {
        heading: "What's wrong",
        says: "why the books stopped matching, in one sentence per account.",
      },
      {
        heading: "The fix",
        says: "each change as date, description, amount, and what it becomes.",
      },
      {
        heading: "After the fix",
        says: "which checks match, and anything still unexplained.",
      },
      { heading: "Next", says: "ask whether to apply it." },
    ],
  });
}

function differencesTable(differences: readonly PostedDifference[]): string {
  const shown = differences.slice(0, PROMPT_ROW_LIMIT);
  const table = promptTable(
    ["Account", "Date", "Books", "Statement", "Difference", "Journal"],
    shown.map((one) => [
      `${one.account} (account id ${one.accountId})`,
      one.date,
      amount(one.books),
      amount(one.statement),
      amount(one.difference),
      String(one.journalId),
    ]),
    [2, 3, 4, 5],
  );
  const rest = differences.length - shown.length;
  return rest > 0
    ? `${table}\nand ${rest} more (read them from the app)`
    : table;
}

function amount(value: number): string {
  return value.toFixed(2);
}

function num(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
