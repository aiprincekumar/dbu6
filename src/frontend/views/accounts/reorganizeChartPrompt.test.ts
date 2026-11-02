import { describe, expect, it } from "vitest";
import { PLAN_FIRST_RULE } from "../../agent-prompt-rules";
import { REORGANIZE_CHART_PROMPT } from "./reorganizeChartPrompt";

describe("the Reorganize my chart prompt", () => {
  const prompt: string = REORGANIZE_CHART_PROMPT;

  it("opens with the outcome: the chart changed, with its entries", () => {
    expect(prompt).toMatch(/^Outcome: Reorganize my chart of accounts/);
    expect(prompt).toContain("with their entries");
  });

  it("leaves the method to the chart-change playbook, named by its command", () => {
    expect(prompt).toContain("Follow `npx dbu6 docs playbook chart-change`.");
    expect(prompt).not.toMatch(/docs\/playbooks\//);
  });

  it("takes the changes I name, else proposes them before making any", () => {
    expect(prompt).toContain("I may name the changes I want");
    expect(prompt).toMatch(
      /propose the changes as a\s+list before you make any/,
    );
  });

  it("keeps the plan-first rule, and ends with what changed and the check", () => {
    expect(prompt).toContain(PLAN_FIRST_RULE);
    expect(prompt).toContain("**Changed**: each account renamed, moved");
    expect(prompt).toMatch(/\n\*\*Check\*\*: whether net worth .*\.$/);
  });
});
