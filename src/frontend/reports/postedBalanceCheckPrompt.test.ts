import { describe, expect, it } from "vitest";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { PLAN_FIRST_RULE } from "../agent-prompt-rules";
import { PROMPT_ROW_LIMIT } from "../review/agentPrompts";
import {
  postedBalanceCheckPrompt,
  postedDifferences,
  type PostedDifference,
} from "./postedBalanceCheckPrompt";

/** Reconciliation Differences as the server sends it, with these rows. */
function report(rows: Record<string, unknown>[]): GridDataset {
  return {
    name: "balance-assertions",
    label: "Reconciliation Differences",
    rootLevel: "assertion",
    levels: { assertion: { columns: [], childLevels: [] } },
    nodes: rows.map((columns, index) => ({
      rowKey: `journal:${index}`,
      levelName: "assertion",
      columns,
    })),
  };
}

const savings = {
  account_id: 12,
  entry_id: 300,
  account_name: "Sample Savings",
  date: "2026-04-30",
  journal_id: 41,
  running_balance: 10000,
  assertion: 12500,
  diff: -2500,
};
const card = {
  account_id: 15,
  entry_id: 301,
  account_name: "Sample Card",
  date: "2026-05-31",
  journal_id: 7,
  running_balance: -1000,
  // A figure may come as text.
  assertion: "-1500",
  diff: 500,
};

describe("postedDifferences", () => {
  it("reads each row of the report", () => {
    expect(postedDifferences(report([savings, card]))).toEqual([
      {
        accountId: 12,
        account: "Sample Savings",
        date: "2026-04-30",
        journalId: 41,
        books: 10000,
        statement: 12500,
        difference: -2500,
      },
      {
        accountId: 15,
        account: "Sample Card",
        date: "2026-05-31",
        journalId: 7,
        books: -1000,
        statement: -1500,
        difference: 500,
      },
    ]);
  });

  it("is empty with no report, or no rows, and leaves out a row it can't read", () => {
    expect(postedDifferences(null)).toEqual([]);
    expect(postedDifferences(report([]))).toEqual([]);
    expect(
      postedDifferences(report([{ ...savings, diff: null }, card])),
    ).toHaveLength(1);
  });
});

describe("the Find why this stopped matching prompt", () => {
  const prompt = postedBalanceCheckPrompt(
    postedDifferences(report([savings, card])),
  );

  it("opens with the outcome, counting the checks and their accounts", () => {
    expect(prompt).toMatch(
      /^Outcome: Find why 2 posted balance checks in 2 accounts stopped matching their statements/,
    );
    expect(
      postedBalanceCheckPrompt(postedDifferences(report([savings]))),
    ).toMatch(
      /^Outcome: Find why 1 posted balance check in 1 account stopped matching its statement,/,
    );
  });

  it("lists each check's facts in aligned columns, amounts on the right", () => {
    expect(prompt).toContain(
      [
        "Account                         Date           Books  Statement  Difference  Journal",
        "Sample Savings (account id 12)  2026-04-30  10000.00   12500.00    -2500.00       41",
        "Sample Card (account id 15)     2026-05-31  -1000.00   -1500.00      500.00        7",
      ].join("\n"),
    );
  });

  it("names the posted-balance-check playbook and keeps the plan-first rule", () => {
    expect(prompt).toContain(
      "Follow `npx dbu6 docs playbook posted-balance-check`.",
    );
    expect(prompt).toContain(PLAN_FIRST_RULE);
    expect(prompt).toMatch(/\n\*\*Next\*\*: ask whether to apply it\.$/);
  });

  it("lists the first rows and leaves the rest to the app", () => {
    const many: PostedDifference[] = Array.from(
      { length: PROMPT_ROW_LIMIT + 2 },
      (_, i) => ({
        accountId: 12,
        account: "Sample Savings",
        date: "2026-04-30",
        journalId: i + 1,
        books: 1000,
        statement: 2000,
        difference: -1000,
      }),
    );
    const long = postedBalanceCheckPrompt(many);
    expect(long.match(/^Sample Savings/gm)).toHaveLength(PROMPT_ROW_LIMIT);
    expect(long).toContain("and 2 more (read them from the app)");
  });
});
