// The task the Accounts page hands the coding agent: reorganize the chart,
// with the entries on the accounts that change. The page names no accounts:
// the person says what they want once the agent asks, or the agent proposes
// changes from the chart and how each account is used. How to rename, move,
// merge or split an account without losing its entries is the chart-change
// playbook's; the account dialogs stay the way to change one by hand.

import { agentPrompt, type AgentPrompt } from "../../agent-prompt-rules";

export const REORGANIZE_CHART_PROMPT: AgentPrompt = agentPrompt({
  outcome:
    "Reorganize my chart of accounts, renaming, moving, merging or splitting accounts with their entries, so it groups my money the way I think about it.",
  facts: "My chart is the accounts in my books, the tree on the Accounts page.",
  playbook: "chart-change",
  how: `When I say go I may name the changes I want: make those. If I name none,
read the chart and how each account is used, and propose the changes as a
list before you make any.`,
  report: [
    {
      heading: "Changed",
      says: "each account renamed, moved, merged or split, as before → after.",
    },
    {
      heading: "Entries moved",
      says: "how many entries went to another account, by account.",
    },
    {
      heading: "Check",
      says: "whether net worth and each month's income and expenses are what they were before.",
    },
  ],
});
