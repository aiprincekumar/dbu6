import { describe, expect, it } from "vitest";
import type {
  DraftCounts,
  HomeAccount,
  HomeLedgerAccount,
  HomeSummary,
} from "../../shared/index";
import {
  accountStatus,
  updateState,
  statementsNeededFrom,
  waitingInUpdate,
  type UpdateCard,
  type UpdateView,
} from "./state";

function account(
  overrides: Partial<HomeLedgerAccount> = {},
): HomeLedgerAccount {
  return {
    in_ledger: true,
    account_id: 2,
    path: "Sample Savings",
    parent_path: null,
    name: "Sample Savings",
    kind: "bank",
    has_parser: true,
    checkpoint: { date: "2026-08-31", balance: 250000 },
    statements_until: "2026-08-31",
    statement_differences: 0,
    drafts: 0,
    uncategorised: 0,
    duplicates: 0,
    balance_checks: 0,
    failing_checks: 0,
    add_first: [],
    ...overrides,
  };
}

// A preset account whose ledger account was deleted.
const deleted: HomeAccount = {
  in_ledger: false,
  account_id: 9,
  name: "Sample Deleted",
  kind: "bank",
  has_parser: true,
};

function summary(
  accounts: HomeAccount[],
  overrides: Partial<HomeSummary> = {},
): HomeSummary {
  const listed = accounts.filter((a): a is HomeLedgerAccount => a.in_ledger);
  return {
    has_chart: true,
    accounts,
    totals: {
      drafts: sum(listed, "drafts"),
      uncategorised: sum(listed, "uncategorised"),
      duplicates: sum(listed, "duplicates"),
      balance_checks: sum(listed, "balance_checks"),
      failing_checks: sum(listed, "failing_checks"),
    },
    any_imported: listed.some((a) => a.checkpoint !== null),
    ...overrides,
  };
}

function sum(accounts: HomeLedgerAccount[], key: keyof DraftCounts): number {
  return accounts.reduce((total, a) => total + a[key], 0);
}

// The card of a state past the first run, which is a step to take.
function stepCard(view: UpdateView): UpdateCard {
  if ("kind" in view.card) throw new Error("expected a step card");
  return view.card;
}

describe("updateState", () => {
  it("offers Do my books, or the chart by hand, when the books have none", () => {
    const view = updateState(summary([], { has_chart: false }));
    expect(view.state).toBe("no-chart");
    expect(view.greeting).toBe("Let's set up your books");
    expect(view.card).toEqual({
      kind: "do-my-books",
      body: "Your coding agent proposes your accounts for your OK before it imports anything.",
      byHand: { label: "Set up by hand", to: "/setup" },
    });
    // The card is the one thing to do: no empty list of accounts below it.
    expect(view.listsAccounts).toBe(false);
  });

  it("offers Do my books, or the first bank or card by hand, once there is a chart", () => {
    const view = updateState(summary([]));
    expect(view.state).toBe("nothing-imported");
    expect(view.greeting).toBe("Let's set up your books");
    expect(view.card).toEqual({
      kind: "do-my-books",
      byHand: { label: "Add a bank or card", to: "/add?run=setup" },
    });
    expect(view.listsAccounts).toBe(false);
  });

  it("names the banks and cards set up with no transactions yet", () => {
    // Set up by an agent, or an add left unfinished: the drop finishes them.
    const view = updateState(
      summary([
        account({ checkpoint: null, statements_until: null }),
        account({
          account_id: 1,
          path: "Sample Card",
          name: "Sample Card",
          kind: "card",
          checkpoint: null,
          statements_until: null,
        }),
        deleted,
      ]),
    );
    expect(view.state).toBe("nothing-imported");
    expect(view.listsAccounts).toBe(true);
    // A preset whose account the books deleted isn't one to finish.
    expect(view.card).toEqual({
      kind: "do-my-books",
      body: "Set up, no transactions yet: Sample Savings and Sample Card.",
      byHand: { label: "Add a bank or card", to: "/add?run=setup" },
    });
  });

  it("says drafts are waiting, whatever they still need", () => {
    const view = updateState(
      summary([account({ drafts: 12, uncategorised: 5, failing_checks: 2 })]),
    );
    expect(view.state).toBe("drafts");
    expect(view.greeting).toBe("Update your books");
    expect(view.card).toEqual({
      title: "There are draft entries waiting to be posted to your books",
      action: { label: "Review transactions", to: "/review/2" },
      byHand: { label: "Import statements, guided", to: "/import" },
    });
  });

  it("adds a bank or card by hand in the first run while its first drafts wait", () => {
    // Nothing posted yet: /import can't add the bank or card the first run
    // may still be missing, so the drop's link is the first run's /add.
    const view = updateState(
      summary([
        account({
          checkpoint: null,
          statements_until: "2026-08-31",
          drafts: 12,
        }),
      ]),
    );
    expect(view.state).toBe("drafts");
    expect(stepCard(view).byHand).toEqual({
      label: "Add a bank or card",
      to: "/add?run=setup",
    });
  });

  it("sends drafts on several accounts to the account picker", () => {
    const view = updateState(
      summary([
        account({ drafts: 21 }),
        account({
          account_id: 1,
          path: "Sample Card",
          name: "Sample Card",
          kind: "card",
          drafts: 4,
        }),
      ]),
    );
    expect(stepCard(view).action.to).toBe("/review");
  });

  it("sends drafts on unlisted accounts to the account picker", () => {
    const view = updateState(
      summary([account()], {
        totals: {
          drafts: 3,
          uncategorised: 0,
          duplicates: 0,
          balance_checks: 0,
          failing_checks: 0,
        },
      }),
    );
    expect(view.state).toBe("drafts");
    expect(stepCard(view).action.to).toBe("/review");
  });

  it("gives the only account with drafts its own Review", () => {
    // An account deleted from the ledger holds no drafts.
    const view = updateState(summary([account({ drafts: 21 }), deleted]));
    expect(stepCard(view).action.to).toBe("/review/2");
  });

  it("offers Do my books for new statements, importing by hand as a link, when nothing is pending", () => {
    const view = updateState(summary([account()]));
    expect(view.state).toBe("import-new");
    expect(view.greeting).toBe("Update your books");
    expect(view.card).toEqual({
      kind: "do-my-books",
      byHand: { label: "Import statements, guided", to: "/import" },
    });
    expect(view.listsAccounts).toBe(true);
  });
});

describe("accountStatus", () => {
  it("sends an account that needs its first statement to the drop", () => {
    // Whether or not anything is imported yet: the run reads its format.
    expect(accountStatus(account({ has_parser: false }))).toEqual({
      tone: "attention",
      label: "Needs a first statement",
      to: "/update#drop",
    });
  });

  it("puts drafts waiting before a first statement", () => {
    expect(accountStatus(account({ has_parser: false, drafts: 3 }))).toEqual({
      tone: "attention",
      label: "3 drafts waiting",
      to: "/review/2",
    });
  });

  it("says nothing of an account nothing waits on", () => {
    expect(accountStatus(account())).toBeNull();
  });
});

describe("statementsNeededFrom", () => {
  it("asks from the month the statements stop in, whole", () => {
    expect(
      statementsNeededFrom(account({ statements_until: "2026-10-13" })),
    ).toBe("2026-10");
  });

  it("asks from the next month when the statements end with theirs", () => {
    expect(
      statementsNeededFrom(account({ statements_until: "2026-09-30" })),
    ).toBe("2026-10");
    expect(
      statementsNeededFrom(account({ statements_until: "2025-12-31" })),
    ).toBe("2026-01");
  });

  it("asks for every statement before the first", () => {
    expect(
      statementsNeededFrom(
        account({ checkpoint: null, statements_until: null }),
      ),
    ).toBeNull();
  });
});

describe("waitingInUpdate", () => {
  it("counts the accounts Update shows something waiting on", () => {
    const view = summary([
      account(),
      account({ account_id: 3, drafts: 3 }),
      account({ account_id: 4, statement_differences: 1 }),
      account({ account_id: 5, has_parser: false }),
    ]);
    expect(waitingInUpdate(view)).toBe(3);
  });
});
