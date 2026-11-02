// The task Settings › Opening balances hands the coding agent: the accounts
// with no statements, cash, deposits, investments and loans, each with what
// it held or owed when the books start. It is a run from the run guide's
// section on them, which reads the chart's opening balances, asks, and
// records what the user answers.

import { runPrompt, type AgentPrompt } from "../../agent-prompt-rules";

export function ownAndOwePrompt(): AgentPrompt {
  return runPrompt({
    outcome:
      "Add what I own and owe that has no statements, such as cash, deposits, investments and loans, each with its opening balance, so my books hold all of it.",
    start: "Accounts with no statements",
  });
}
