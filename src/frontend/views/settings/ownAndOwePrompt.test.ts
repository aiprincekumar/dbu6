import { describe, expect, it } from "vitest";
import { PLAN_FIRST_RULE, RUN_PLAN_FIRST_RULE } from "../../agent-prompt-rules";
import { ownAndOwePrompt } from "./ownAndOwePrompt";

describe("the Fill in what you own and owe prompt", () => {
  const prompt = ownAndOwePrompt();

  it("opens with the outcome: what has no statements, with opening balances", () => {
    expect(prompt).toMatch(
      /^Outcome: Add what I own and owe that has no statements/,
    );
  });

  it("is a run from the run guide's section on them, which reads the chart itself", () => {
    expect(prompt).toContain(
      'Follow `npx dbu6 docs run`, starting at its section "Accounts with no statements".',
    );
    expect(prompt).toContain(RUN_PLAN_FIRST_RULE);
    expect(prompt).not.toContain(PLAN_FIRST_RULE);
    expect(prompt).not.toContain("account id");
  });
});
