// The task Settings › Opening balances hands the coding agent: the accounts
// with no statements, cash, deposits, investments and loans, each with what
// it held or owed when the books start. The chart's own such accounts go in
// the prompt, with the balance each has so far; which to add, and the
// questions to ask, are the run guide's section on them.

import {
  guideCommand,
  type OpeningBalanceAccount,
  type OpeningBalances,
} from "../../../shared/index";
import { agentPrompt, type AgentPrompt } from "../../agent-prompt-rules";
import { typedAmount } from "../../opening-balances";
import { promptTable } from "../../prompt-table";

/** The run guide's section the agent follows, by its heading. */
export const NO_STATEMENTS_SECTION = "Accounts with no statements";

export function ownAndOwePrompt(balances: OpeningBalances): AgentPrompt {
  return agentPrompt({
    outcome:
      "Add what I own and owe that has no statements, such as cash, deposits, investments and loans, each with its opening balance, so my books hold all of it.",
    facts: noStatementFacts(balances.accounts),
    how: `Follow the "${NO_STATEMENTS_SECTION}" section of \`${guideCommand("run")}\`.`,
    report: [
      {
        heading: "Added",
        says: "each account, with what it held or owed and the day, one per line.",
      },
      {
        heading: "Left out",
        says: "what I named but gave no figure for.",
      },
    ],
  });
}

/**
 * The chart's accounts with no statements, a table of each with its opening
 * balance as the user types it (owed is positive). Banks and cards, whose
 * statements set theirs, and accounts with accounts under them are left out.
 */
function noStatementFacts(accounts: readonly OpeningBalanceAccount[]): string {
  const listed = accounts
    .filter((one) => one.section === "own" || one.section === "owe")
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (listed.length === 0) {
    return "My chart has no accounts without statements yet.";
  }
  const table = promptTable(
    ["Account", "Type", "Opening", "As of"],
    listed.map((one) => [
      `${one.path} (account id ${one.account_id})`,
      one.account_type,
      one.opening === null
        ? "none"
        : typedAmount(one.account_type, one.opening.amount),
      one.opening?.date ?? "",
    ]),
    [2],
  );
  return `Accounts in my chart with no statements (Opening is what it held, or for a Liability what was owed):
${table}`;
}
