import { describe, expect, it } from "vitest";
import { NO_DRAFTS, postingBlocks, postingChecks } from "../../shared/index";
import { checkText } from "./posting-checks";

const NO_POSTING_INPUTS = { ...NO_DRAFTS, add_first: [] };
import { REVIEW_TABS } from "./routes";

describe("checkText", () => {
  it("says a passing check the way Overview and the tabs both show it", () => {
    expect(
      postingChecks({
        ...NO_POSTING_INPUTS,
        drafts: 21,
        balance_checks: 13,
      }).map(checkText),
    ).toEqual([
      "All 21 transactions go to an account",
      "No possible duplicates",
      "Your books agree with the bank",
    ]);
    expect(
      postingChecks({ ...NO_POSTING_INPUTS, drafts: 1 }).map(checkText),
    ).toEqual([
      "The transaction goes to an account",
      "No possible duplicates",
      "These drafts have no balance checks",
    ]);
  });

  it("counts what a blocking check flags, with the verb agreeing", () => {
    const one = { ...NO_DRAFTS, drafts: 3, balance_checks: 2 };
    expect(
      postingChecks({
        ...one,
        uncategorised: 1,
        duplicates: 1,
        failing_checks: 1,
        add_first: [],
      }).map(checkText),
    ).toEqual([
      "1 transaction needs an account",
      "1 possible duplicate",
      "1 balance check fails",
    ]);
    expect(
      postingChecks({
        ...one,
        uncategorised: 2,
        duplicates: 2,
        failing_checks: 2,
        add_first: [],
      }).map(checkText),
    ).toEqual([
      "2 transactions need an account",
      "2 possible duplicates",
      "2 balance checks fail",
    ]);
  });
});

describe("balance checks that count another account's drafts", () => {
  const counts = { ...NO_DRAFTS, drafts: 3, balance_checks: 2 };
  const savings = { account_id: 1, name: "Sample Savings" };
  const wallet = { account_id: 2, name: "Sample Wallet" };

  it("wait for that account, which needs attention, not a fix", () => {
    const [block] = postingBlocks({ ...counts, add_first: [savings] });
    expect(block).toMatchObject({
      kind: "balance-checks",
      severity: "attention",
    });
    expect(checkText(block)).toBe("Add Sample Savings first");
    expect(
      checkText(postingBlocks({ ...counts, add_first: [savings, wallet] })[0]),
    ).toBe("Add Sample Savings and Sample Wallet first");
  });

  it("fail first, when they also fail", () => {
    expect(
      postingBlocks({ ...counts, failing_checks: 1, add_first: [savings] }),
    ).toEqual([
      {
        kind: "balance-checks",
        state: "blocks",
        severity: "problem",
        count: 1,
      },
    ]);
  });
});

describe("REVIEW_TABS", () => {
  it("follows the checks' order, Improve categorization and Run categorizer after Drafts", () => {
    expect(REVIEW_TABS).toEqual([
      "drafts",
      "improve-categorization",
      "run-categorizer",
      "duplicates",
      "balance-checks",
    ]);
  });
});
