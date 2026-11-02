import { describe, expect, it } from "vitest";
import type { OpeningBalanceAccount } from "../../../shared/index";
import { PLAN_FIRST_RULE } from "../../agent-prompt-rules";
import { ownAndOwePrompt } from "./ownAndOwePrompt";

function account(
  account_id: number,
  path: string,
  more: Partial<OpeningBalanceAccount> = {},
): OpeningBalanceAccount {
  const owed = path.startsWith("Liabilities");
  return {
    account_id,
    name: path.split(":").at(-1) ?? path,
    path,
    account_type: owed ? "Liability" : "Asset",
    section: owed ? "owe" : "own",
    first_activity_date: null,
    default_date: "2026-03-31",
    implied_opening: null,
    opening: null,
    ...more,
  };
}

const opening = (amount: number) => ({
  journal_id: 21,
  date: "2026-03-31",
  amount,
  description: "Opening balance",
  locked: null,
  source: "manual" as const,
});

const ACCOUNTS = [
  account(5, "Assets:Investments:Sample Fund", { opening: opening(50000) }),
  account(3, "Assets:Cash"),
  account(4, "Assets:Investments", { section: null }),
  account(7, "Liabilities:Loans:Sample Loan", { opening: opening(-200000) }),
  account(8, "Assets:Bank:Sample Savings", {
    section: "statement",
    opening: opening(1000),
  }),
];

describe("the Fill in what you own and owe prompt", () => {
  const prompt = ownAndOwePrompt({ equity_account: null, accounts: ACCOUNTS });

  it("opens with the outcome: what has no statements, with opening balances", () => {
    expect(prompt).toMatch(
      /^Outcome: Add what I own and owe that has no statements/,
    );
  });

  it("lists the chart's accounts with no statements, aligned, owed as positive", () => {
    expect(prompt).toContain(
      [
        "Account                                        Type         Opening  As of",
        "Assets:Cash (account id 3)                     Asset           none",
        "Assets:Investments:Sample Fund (account id 5)  Asset       50000.00  2026-03-31",
        "Liabilities:Loans:Sample Loan (account id 7)   Liability  200000.00  2026-03-31",
      ].join("\n"),
    );
    // Banks and cards, and accounts with accounts under them, are left out.
    expect(prompt).not.toContain("Sample Savings");
    expect(prompt).not.toMatch(/^Assets:Investments \(/m);
  });

  it("says so when the chart has none", () => {
    expect(
      ownAndOwePrompt({ equity_account: null, accounts: [ACCOUNTS[4]] }),
    ).toContain("My chart has no accounts without statements yet.");
  });

  it("follows the run guide's section on them, and keeps the plan-first rule", () => {
    expect(prompt).toContain(
      'Follow the "Accounts with no statements" section of `npx dbu6 docs run`.',
    );
    expect(prompt).toContain(PLAN_FIRST_RULE);
    expect(prompt).toContain("**Added**: each account");
  });
});
