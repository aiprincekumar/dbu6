import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePlainDate } from "@sapporta/shared/temporal";
import { draftTransactionsContract } from "../../shared/index.js";
import {
  loadCategorizer,
  type CategorizationLlm,
  type CategorizationProgress,
} from "../modules/categorization/index.js";
import { accountsTable } from "../schema/accounts.js";
import { draftTransactionsTable } from "../schema/draft-journals.js";
import { testLedgerAuth } from "../modules/ledger-sql/testing.js";
import { loadCategorizationRuleRequests } from "../modules/drafts/index.js";
import {
  classifyDraftTransactions,
  forgetCategorizationRuleRequest,
  forgetCategorizationRuleRequests,
  setDraftsAccount,
  settleTransfer,
  requestCategorizationRule,
} from "./reclassification.js";

const auth = testLedgerAuth();

// The engine would detect this machine's coding agents. The mapping rules
// categorize everything these tests classify, so the LLM is never asked.
const llm: CategorizationLlm = {
  agent: "claude-code",
  name: "Claude Code",
  caller: { ready: false, reason: "not called in these tests" },
};
vi.mock("../modules/coding-agent/categorization-llm.js", () => ({
  categorizationLlm: async () => llm,
}));

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("classifyDraftTransactions", () => {
  it("enriches from GPay before categorizing and persists both changes", async () => {
    const { db, sqlite } = setupDatabase();
    const projectDir = makeTempDir("draft-classification-project-");
    vi.stubEnv("DBU6_ROOT", projectDir);
    const configDir = join(projectDir, "user-config");
    mkdirSync(configDir);
    const gpayDir = makeTempDir("draft-classification-gpay-");
    const gpayPath = join(gpayDir, "My Activities.html");
    writeFileSync(
      join(configDir, "transaction_mappings.mjs"),
      `export const mappings = {
        exact: {},
        includes: [{ account: "Coffee", values: ["COFFEE SHOP |"] }],
      };`,
    );
    writeFileSync(
      gpayPath,
      `<div>Sent ₹250 to Coffee Shop using Bank Account</div>
       <div>Apr 24, 2026, 10:15 AM</div>`,
    );

    const first = await classifyDraftTransactions({
      db,
      auth,
      ids: [1],
      customMappingsFilenames: [],
      gpayHtmlPath: gpayPath,
      loadCategorizer,
    });

    expect(first).toEqual({
      transactions: [
        {
          id: 1,
          source_narration: "Coffee Shop | UPI debit",
          comment: "Coffee Shop",
          account_id: 2,
          account_name: "Coffee",
        },
      ],
      gpayEnrichedCount: 1,
      categorization: {
        agent: "claude-code",
        sent_count: 0,
        failed_count: 0,
        error: null,
        failure: null,
      },
      categorizationTally: {
        by_rule: 1,
        by_llm: 0,
        same_account: 0,
        uncategorized: 0,
        accounts: [
          {
            account_id: 2,
            account_name: "Coffee",
            parent_path: "Expenses",
            count: 1,
          },
        ],
      },
    });
    expect(
      sqlite
        .prepare(
          "SELECT source_narration, comment, account_id FROM draft_transactions WHERE id = 1",
        )
        .get(),
    ).toEqual({
      source_narration: "Coffee Shop | UPI debit",
      comment: "Coffee Shop",
      account_id: 2,
    });

    const second = await classifyDraftTransactions({
      db,
      auth,
      ids: [1],
      customMappingsFilenames: [],
      gpayHtmlPath: gpayPath,
      loadCategorizer,
    });
    expect(second.gpayEnrichedCount).toBe(0);

    // A comment the person wrote stays through another reclassification.
    sqlite
      .prepare(
        "UPDATE draft_transactions SET comment = 'sample note' WHERE id = 1",
      )
      .run();
    const third = await classifyDraftTransactions({
      db,
      auth,
      ids: [1],
      customMappingsFilenames: [],
      gpayHtmlPath: gpayPath,
      loadCategorizer,
    });
    expect(third.transactions[0].comment).toBe("sample note");
    expect(
      sqlite
        .prepare("SELECT comment FROM draft_transactions WHERE id = 1")
        .get(),
    ).toEqual({ comment: "sample note" });
    sqlite
      .prepare(
        "UPDATE draft_transactions SET comment = 'Coffee Shop' WHERE id = 1",
      )
      .run();
    expect(second.transactions[0]).toMatchObject({
      source_narration: "Coffee Shop | UPI debit",
      comment: "Coffee Shop",
    });

    sqlite.close();
  });

  it("says how far categorization has got, as an import does", async () => {
    const { db, sqlite } = setupDatabase();
    const projectDir = makeTempDir("draft-classification-project-");
    vi.stubEnv("DBU6_ROOT", projectDir);
    const configDir = join(projectDir, "user-config");
    mkdirSync(configDir);
    writeFileSync(
      join(configDir, "transaction_mappings.mjs"),
      `export const mappings = {
        exact: {},
        includes: [{ account: "Coffee", values: ["UPI debit"] }],
      };`,
    );

    const progress: CategorizationProgress[] = [];
    await classifyDraftTransactions({
      db,
      auth,
      ids: [1],
      customMappingsFilenames: [],
      loadCategorizer,
      onProgress: (event) => progress.push(event),
    });

    expect(progress).toEqual([
      {
        stage: "rules",
        transactions: [expect.objectContaining({ narration: "UPI debit" })],
        answers: new Map([[0, "Coffee"]]),
      },
    ]);
    sqlite.close();
  });
});

describe("setDraftsAccount", () => {
  const account = (sqlite: Database.Database) =>
    sqlite
      .prepare("SELECT account_id FROM draft_transactions WHERE id = 1")
      .get();

  it("sends the drafts to the account", () => {
    const { db, sqlite } = setupDatabase();
    expect(setDraftsAccount({ db, sqlite, auth }, [1, 1], 2)).toEqual({
      kind: "set",
      updated: 1,
    });
    expect(account(sqlite)).toEqual({ account_id: 2 });
  });

  it("changes nothing for an account that isn't in the books", () => {
    const { db, sqlite } = setupDatabase();
    expect(setDraftsAccount({ db, sqlite, auth }, [1], 99)).toEqual({
      kind: "account-not-found",
    });
    expect(account(sqlite)).toEqual({ account_id: null });
  });

  it("changes nothing when a draft isn't there", () => {
    const { db, sqlite } = setupDatabase();
    expect(setDraftsAccount({ db, sqlite, auth }, [1, 7], 2)).toEqual({
      kind: "drafts-not-found",
      ids: [7],
    });
    expect(account(sqlite)).toEqual({ account_id: null });
  });

  it("refuses the drafts' own base account", () => {
    const { db, sqlite } = setupDatabase();
    expect(setDraftsAccount({ db, sqlite, auth }, [1], 1)).toEqual({
      kind: "own-account",
    });
    expect(account(sqlite)).toEqual({ account_id: null });
  });
});

describe("requestCategorizationRule", () => {
  const accounts = (sqlite: Database.Database) =>
    sqlite
      .prepare("SELECT id, account_id FROM draft_transactions ORDER BY id")
      .all();

  it("records the rule request, its drafts oldest first, and leaves them without an account", () => {
    const { db, sqlite } = setupDatabase();
    const ledger = { db, sqlite, auth };
    addDraft(db, 3, "UPI debit again", 1);

    const outcome = requestCategorizationRule(ledger, {
      draftIds: [3, 1],
      accountId: 2,
      note: "  A coffee shop.  ",
    });

    const ruleRequest = {
      id: 1,
      base_account_id: 1,
      account: { id: 2, name: "Coffee", parent_path: "Expenses" },
      transactions: [
        {
          date: "2026-04-24",
          source_narration: "UPI debit",
          direction: "withdrawal",
          amount: 250,
        },
        {
          date: "2026-04-25",
          source_narration: "UPI debit again",
          direction: "withdrawal",
          amount: 1000,
        },
      ],
      note: "A coffee shop.",
    };
    expect(outcome).toEqual({ kind: "requested", ruleRequest });
    expect(accounts(sqlite)).toEqual([
      { id: 1, account_id: null },
      { id: 3, account_id: null },
    ]);
    expect(loadCategorizationRuleRequests(db, auth, 1)).toEqual([ruleRequest]);
    expect(loadCategorizationRuleRequests(db, auth, 4)).toEqual([]);
  });

  it("records no rule request for drafts of more than one statement account", () => {
    const { db, sqlite } = setupDatabase();
    const ledger = { db, sqlite, auth };
    addDraft(db, 3, "NOPII CARD DEBIT", 4);

    expect(
      requestCategorizationRule(ledger, {
        draftIds: [1, 3],
        accountId: 2,
        note: "",
      }),
    ).toEqual({ kind: "not-one-account" });
    expect(accounts(sqlite)).toEqual([
      { id: 1, account_id: null },
      { id: 3, account_id: null },
    ]);
    expect(loadCategorizationRuleRequests(db, auth, 1)).toEqual([]);
  });

  it("records no rule request when the account is refused", () => {
    const { db, sqlite } = setupDatabase();
    const ledger = { db, sqlite, auth };

    expect(
      requestCategorizationRule(ledger, {
        draftIds: [1],
        accountId: 1,
        note: "",
      }),
    ).toEqual({ kind: "own-account" });
    expect(loadCategorizationRuleRequests(db, auth, 1)).toEqual([]);
  });

  it("forgets a rule request, or an account's rule requests", () => {
    const { db, sqlite } = setupDatabase();
    const ledger = { db, sqlite, auth };
    addDraft(db, 3, "UPI debit again", 1);
    requestCategorizationRule(ledger, {
      draftIds: [1],
      accountId: 2,
      note: "",
    });
    requestCategorizationRule(ledger, {
      draftIds: [3],
      accountId: 2,
      note: "",
    });

    expect(forgetCategorizationRuleRequest(ledger, 1)).toBe(1);
    expect(forgetCategorizationRuleRequest(ledger, 1)).toBe(0);
    expect(
      loadCategorizationRuleRequests(db, auth, 1).map(
        (ruleRequest) => ruleRequest.id,
      ),
    ).toEqual([2]);
    expect(forgetCategorizationRuleRequests(ledger, 1)).toBe(1);
    expect(loadCategorizationRuleRequests(db, auth, 1)).toEqual([]);
  });
});

function addDraft(
  db: ReturnType<typeof drizzle>,
  id: number,
  narration: string,
  baseAccountId: number,
) {
  db.insert(draftTransactionsTable)
    .values({
      id,
      workspace_id: "workspace",
      scoped_to_user_id: "user",
      date: parsePlainDate("2026-04-25"),
      source_narration: narration,
      withdrawal: 1000,
      deposit: 0,
      account_id: null,
      base_account_id: baseAccountId,
      balance_assertion_base_account: null,
    })
    .run();
}

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("settleTransfer", () => {
  /*
   * Federal Bank (1) paid Sample Card (4) 1000 on 25 Apr; the card's
   * statement has it as money in on 27 Apr. The card printed balances on 26
   * and 27 Apr, the 27th's on its last draft that day, the payment.
   */
  function withTransfer(bankDate = "2026-04-25"): Database.Database {
    const { sqlite } = setupDatabase();
    sqlite.exec(`
      INSERT INTO draft_transactions
        (id, workspace_id, scoped_to_user_id, date, source_narration,
         withdrawal, deposit, account_id, base_account_id,
         balance_assertion_base_account, created_at, updated_at)
      VALUES
        (10, 'workspace', 'user', '${bankDate}', 'NOPII card payment', 1000, 0, 4, 1, NULL, '2026-04-28T00:00:00Z', '2026-04-28T00:00:00Z'),
        (20, 'workspace', 'user', '2026-04-26', 'NOPII shop', 100, 0, 2, 4, -2100, '2026-04-28T00:00:00Z', '2026-04-28T00:00:00Z'),
        (21, 'workspace', 'user', '2026-04-27', 'NOPII shop', 50, 0, 2, 4, NULL, '2026-04-28T00:00:00Z', '2026-04-28T00:00:00Z'),
        (22, 'workspace', 'user', '2026-04-27', 'NOPII payment received', 0, 1000, NULL, 4, -1150, '2026-04-28T00:00:00Z', '2026-04-28T00:00:00Z');
    `);
    return sqlite;
  }
  const drafts = (sqlite: Database.Database) =>
    sqlite
      .prepare(
        `SELECT id, date, account_id, balance_assertion_base_account AS balance
         FROM draft_transactions WHERE id >= 10 ORDER BY id`,
      )
      .all();

  it("keeps the earlier draft and moves the later one's day balance", () => {
    const sqlite = withTransfer();
    expect(
      settleTransfer({ db: drizzle(sqlite), sqlite, auth }, [22, 10]),
    ).toEqual({
      kind: "settled",
      keptDraftId: 10,
      deletedDraftId: 22,
      clearedBalances: 1,
    });
    expect(drafts(sqlite)).toEqual([
      { id: 10, date: "2026-04-25", account_id: 4, balance: null },
      // The card's 26 Apr balance came before the money arrived.
      { id: 20, date: "2026-04-26", account_id: 2, balance: null },
      { id: 21, date: "2026-04-27", account_id: 2, balance: -1150 },
    ]);
  });

  it("keeps the card's draft when it is the earlier, sent to the bank", () => {
    const sqlite = withTransfer("2026-04-28");
    expect(
      settleTransfer({ db: drizzle(sqlite), sqlite, auth }, [10, 22]),
    ).toMatchObject({ kind: "settled", keptDraftId: 22, deletedDraftId: 10 });
    expect(drafts(sqlite)).toEqual([
      { id: 20, date: "2026-04-26", account_id: 2, balance: -2100 },
      { id: 21, date: "2026-04-27", account_id: 2, balance: null },
      { id: 22, date: "2026-04-27", account_id: 1, balance: -1150 },
    ]);
  });

  it("changes nothing for two drafts that aren't one transfer", () => {
    const sqlite = withTransfer();
    sqlite.exec(`UPDATE draft_transactions SET deposit = 999 WHERE id = 22`);
    const before = drafts(sqlite);
    expect(
      settleTransfer({ db: drizzle(sqlite), sqlite, auth }, [10, 22]),
    ).toEqual({ kind: "not-a-transfer" });
    expect(drafts(sqlite)).toEqual(before);
  });

  it("names a draft that isn't there", () => {
    const sqlite = withTransfer();
    expect(
      settleTransfer({ db: drizzle(sqlite), sqlite, auth }, [10, 99]),
    ).toEqual({ kind: "drafts-not-found", ids: [99] });
  });
});

function setupDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      scoped_to_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      parent_id INTEGER,
      account_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE draft_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      scoped_to_user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      source_narration TEXT NOT NULL,
      comment TEXT,
      withdrawal REAL NOT NULL DEFAULT 0,
      deposit REAL NOT NULL DEFAULT 0,
      account_id INTEGER,
      base_account_id INTEGER,
      balance_assertion_base_account REAL,
      source_reference TEXT,
      source_transaction_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE categorization_rule_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      scoped_to_user_id TEXT NOT NULL,
      base_account_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      transactions TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  const db = drizzle(sqlite);
  db.insert(accountsTable)
    .values([
      scopedAccount(1, "Federal Bank", "Asset"),
      scopedAccount(5, "Expenses", "Expense"),
      scopedAccount(2, "Coffee", "Expense", 5),
      scopedAccount(4, "Sample Card", "Liability"),
    ])
    .run();
  db.insert(draftTransactionsTable)
    .values({
      id: 1,
      workspace_id: "workspace",
      scoped_to_user_id: "user",
      date: parsePlainDate("2026-04-24"),
      source_narration: "UPI debit",
      withdrawal: 250,
      deposit: 0,
      account_id: null,
      base_account_id: 1,
      balance_assertion_base_account: null,
    })
    .run();
  return { db, sqlite };
}

function scopedAccount(
  id: number,
  name: string,
  account_type: typeof accountsTable.$inferInsert.account_type,
  parent_id: number | null = null,
): typeof accountsTable.$inferInsert {
  return {
    id,
    workspace_id: "workspace",
    scoped_to_user_id: "user",
    name,
    parent_id,
    account_type,
  };
}

describe("draft classification response contract", () => {
  it("carries the categorization report with the transactions", () => {
    const report = {
      agent: "codex",
      sent_count: 3,
      failed_count: 3,
      error: "sample failure",
      failure: "partial",
    };
    const transactions = [
      {
        id: 1,
        source_narration: "NOPII SHOP",
        comment: null,
        account_id: null,
        account_name: null,
      },
    ];
    const tally = {
      by_rule: 0,
      by_llm: 0,
      same_account: 0,
      uncategorized: 1,
      accounts: [],
    };

    expect(
      draftTransactionsContract.classifyDraftTransactions.responses[200].parse({
        transactions,
        categorization: report,
        categorization_tally: tally,
      }),
    ).toEqual({
      transactions,
      categorization: report,
      categorization_tally: tally,
    });
    expect(() =>
      draftTransactionsContract.classifyDraftTransactions.responses[200].parse(
        transactions,
      ),
    ).toThrow();
    expect(
      draftTransactionsContract.classifyDraftTransactionsWithGPay.responses[200].parse(
        {
          transactions,
          gpay_enriched_count: 0,
          categorization: report,
          categorization_tally: tally,
        },
      ),
    ).toEqual({
      transactions,
      gpay_enriched_count: 0,
      categorization: report,
      categorization_tally: tally,
    });
  });
});

describe("GPay draft classification upload contract", () => {
  it("parses repeated form fields into typed classification input", () => {
    expect(
      draftTransactionsContract.classifyDraftTransactionsWithGPay.body.parse({
        ids: ["12", "34"],
        custom_mappings_filenames: ["federal.prompt", "shared.prompt"],
      }),
    ).toEqual({
      ids: [12, 34],
      custom_mappings_filenames: ["federal.prompt", "shared.prompt"],
    });
  });
});
