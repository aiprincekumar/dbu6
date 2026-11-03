import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { allRows } from "../ledger-sql/index.js";
import { testLedgerAuth } from "../ledger-sql/testing.js";
import {
  baseAccountRunningBalanceCtes,
  countPostedAssertionFailures,
  failingDraftAssertionsSelect,
  loadAccountActivity,
} from "./running-balance.js";

describe("shared draft running-balance query", () => {
  it("uses journal-before-draft ordering and returns the same failing rows for every caller", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE accounts (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, name TEXT);
      CREATE TABLE journals (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT, description TEXT);
      CREATE TABLE journal_entries (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, journal_id INTEGER, account_id INTEGER, debit REAL, credit REAL, account_balance_assertion REAL);
      CREATE TABLE draft_transactions (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT, base_account_id INTEGER, deposit REAL, withdrawal REAL, balance_assertion_base_account REAL, account_id INTEGER);
      INSERT INTO accounts VALUES (1, 'workspace', 'user', 'Bank');
      INSERT INTO journals VALUES (1, 'workspace', 'user', '2026-05-07', 'Opening');
      INSERT INTO journal_entries VALUES (1, 'workspace', 'user', 1, 1, 100, 0, NULL);
      INSERT INTO draft_transactions VALUES (9, 'workspace', 'user', '2026-05-07', 1, 50, 0, 140, NULL);
    `);
    const rows = allRows(
      sqlite,
      testLedgerAuth(),
      `${baseAccountRunningBalanceCtes}
       SELECT * FROM (${failingDraftAssertionsSelect})`,
    );
    expect(rows).toEqual([
      {
        account_id: 1,
        date: "2026-05-07",
        draft_id: 9,
        running_balance: 150,
        assertion: 140,
        diff: 10,
      },
    ]);
  });

  it("adds a day's drafts up by id, so the day's last draft checks the whole day", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE journals (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT);
      CREATE TABLE journal_entries (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, journal_id INTEGER, account_id INTEGER, debit REAL, credit REAL, account_balance_assertion REAL);
      CREATE TABLE draft_transactions (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT, base_account_id INTEGER, deposit REAL, withdrawal REAL, balance_assertion_base_account REAL, account_id INTEGER);
      INSERT INTO draft_transactions VALUES (8, 'workspace', 'user', '2026-05-07', 1, 1000, 0, 1500, NULL);
      INSERT INTO draft_transactions VALUES (4, 'workspace', 'user', '2026-05-07', 1, 500, 0, NULL, NULL);
      INSERT INTO draft_transactions VALUES (6, 'workspace', 'user', '2026-05-08', 1, 0, 200, 1400, NULL);
    `);
    const rows = allRows(
      sqlite,
      testLedgerAuth(),
      `${baseAccountRunningBalanceCtes}
       SELECT * FROM (${failingDraftAssertionsSelect})`,
    );
    expect(rows).toEqual([
      {
        account_id: 1,
        date: "2026-05-08",
        draft_id: 6,
        running_balance: 1300,
        assertion: 1400,
        diff: -100,
      },
    ]);
  });
});

describe("another account's drafts in the running balance", () => {
  // Sample Savings (2) paid Sample Card (1) 300 on 7 May, drafted from its
  // statement and categorized to the card. The card owed 1,000 and spent 50
  // the same day: it owes 750.
  function books(cardCopy: boolean) {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE journals (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT);
      CREATE TABLE journal_entries (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, journal_id INTEGER, account_id INTEGER, debit REAL, credit REAL, account_balance_assertion REAL);
      CREATE TABLE draft_transactions (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT, base_account_id INTEGER, deposit REAL, withdrawal REAL, balance_assertion_base_account REAL, account_id INTEGER);
      INSERT INTO journals VALUES (1, 'workspace', 'user', '2026-05-01');
      INSERT INTO journal_entries VALUES (1, 'workspace', 'user', 1, 1, 0, 1000, -1000);
      -- The card's own draft has a lower id than the bank's, and still comes after it.
      INSERT INTO draft_transactions VALUES (5, 'workspace', 'user', '2026-05-07', 1, 0, 50, -750, 3);
      INSERT INTO draft_transactions VALUES (9, 'workspace', 'user', '2026-05-07', 2, 0, 300, NULL, 1);
      ${cardCopy ? "INSERT INTO draft_transactions VALUES (4, 'workspace', 'user', '2026-05-07', 1, 300, 0, NULL, 2);" : ""}
    `);
    return allRows(
      sqlite,
      testLedgerAuth(),
      `${baseAccountRunningBalanceCtes}
       SELECT * FROM (${failingDraftAssertionsSelect}) WHERE account_id = 1`,
    );
  }

  it("counts it on the side it will post to, before the account's own drafts that day", () => {
    expect(books(false)).toEqual([]);
  });

  it("fails the check by the transfer when the account's own statement repeats it", () => {
    expect(books(true)).toEqual([
      expect.objectContaining({ draft_id: 5, diff: 300 }),
    ]);
  });
});

describe("posted balance checks the books miss", () => {
  it("counts them by account, adding a day up by journal before its closing check", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE journals (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT);
      CREATE TABLE journal_entries (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, journal_id INTEGER, account_id INTEGER, debit REAL, credit REAL, account_balance_assertion REAL);
      INSERT INTO journals VALUES
        (1, 'workspace', 'user', '2026-05-07'),
        (2, 'workspace', 'user', '2026-05-07'),
        (3, 'workspace', 'user', '2026-05-08'),
        (4, 'workspace', 'other-user', '2026-05-08');
      INSERT INTO journal_entries VALUES
        -- Bank (1): the day's two journals come to 1500, as asserted.
        (11, 'workspace', 'user', 1, 1, 1000, 0, NULL),
        (12, 'workspace', 'user', 1, 9, 0, 1000, NULL),
        (21, 'workspace', 'user', 2, 1, 500, 0, 1500),
        (22, 'workspace', 'user', 2, 9, 0, 500, NULL),
        -- Card (2): -200 where the statement says -300.
        (31, 'workspace', 'user', 3, 2, 0, 200, -300),
        (32, 'workspace', 'user', 3, 9, 200, 0, NULL),
        -- Another user's rows stay out of scope.
        (41, 'workspace', 'other-user', 4, 1, 0, 50, 0);
    `);

    expect(countPostedAssertionFailures(sqlite, testLedgerAuth())).toEqual(
      new Map([[2, 1]]),
    );
  });
});

describe("an account's activity", () => {
  // Sample Bank (1) opened at 1,000 on 1 May, posted. Sample Savings (2)
  // drafted 300 into it on 2 May; its own statement drafts 100 out that day,
  // closing at 1,100, and 50 out on 3 May, closing at 1,000 though the rows
  // reach 1,150.
  function books() {
    const sqlite = new Database(":memory:");
    const row = `'workspace', 'user'`;
    const stamps = `'2026-05-01T00:00:00Z', '2026-05-09T00:00:00Z'`;
    sqlite.exec(`
      CREATE TABLE journals (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT);
      CREATE TABLE journal_entries (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, journal_id INTEGER, account_id INTEGER, debit REAL, credit REAL, account_balance_assertion REAL, source_narration TEXT, comment TEXT, source_transaction_key TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE draft_transactions (id INTEGER, workspace_id TEXT, scoped_to_user_id TEXT, date TEXT, base_account_id INTEGER, deposit REAL, withdrawal REAL, balance_assertion_base_account REAL, account_id INTEGER, source_narration TEXT, comment TEXT, source_transaction_key TEXT, created_at TEXT, updated_at TEXT);
      INSERT INTO journals VALUES (1, ${row}, '2026-05-01');
      INSERT INTO journal_entries VALUES
        (10, ${row}, 1, 1, 1000, 0, 1000, NULL, 'Opening balance', NULL, ${stamps}),
        (11, ${row}, 1, 9, 0, 1000, NULL, NULL, NULL, NULL, ${stamps});
      INSERT INTO draft_transactions VALUES
        (21, ${row}, '2026-05-02', 2, 0, 300, NULL, 1, 'NOPII to bank', NULL, 'k-21', ${stamps}),
        (31, ${row}, '2026-05-02', 1, 0, 100, 1100, 8, 'NOPII shop', NULL, 'k-31', ${stamps}),
        (32, ${row}, '2026-05-03', 1, 0, 50, 1000, 8, 'NOPII shop', NULL, 'k-32', ${stamps});
    `);
    return sqlite;
  }

  it("lists each row as the checks add it up, with each statement balance's difference", () => {
    const rows = loadAccountActivity(books(), testLedgerAuth(), 1);
    expect(
      rows.map(
        ({
          date,
          kind,
          id,
          other_account_id,
          amount,
          statement_balance,
          running,
          diff,
        }) => ({
          date,
          kind,
          id,
          other_account_id,
          amount,
          statement_balance,
          running,
          diff,
        }),
      ),
    ).toEqual([
      {
        date: "2026-05-01",
        kind: "entry",
        id: 10,
        other_account_id: null,
        amount: 1000,
        statement_balance: 1000,
        running: 1000,
        diff: 0,
      },
      {
        date: "2026-05-02",
        kind: "other draft",
        id: 21,
        other_account_id: 2,
        amount: 300,
        statement_balance: null,
        running: 1300,
        diff: null,
      },
      {
        date: "2026-05-02",
        kind: "draft",
        id: 31,
        other_account_id: null,
        amount: -100,
        statement_balance: 1100,
        running: 1200,
        diff: 100,
      },
      {
        date: "2026-05-03",
        kind: "draft",
        id: 32,
        other_account_id: null,
        amount: -50,
        statement_balance: 1000,
        running: 1150,
        diff: 150,
      },
    ]);
    expect(rows[1]).toMatchObject({
      journal_id: null,
      source_narration: "NOPII to bank",
      source_transaction_key: "k-21",
    });
    expect(rows[0]).toMatchObject({
      journal_id: 1,
      created_at: "2026-05-01T00:00:00Z",
    });
  });

  it("narrows the rows by date but keeps the running total from the first", () => {
    const rows = loadAccountActivity(books(), testLedgerAuth(), 1, {
      from: "2026-05-03",
    });
    expect(rows.map((one) => [one.id, one.running])).toEqual([[32, 1150]]);
  });

  it("counts posted entries alone when asked, as the books' checks do", () => {
    const rows = loadAccountActivity(books(), testLedgerAuth(), 1, {
      postedOnly: true,
    });
    expect(rows.map((one) => [one.kind, one.id, one.running])).toEqual([
      ["entry", 10, 1000],
    ]);
  });
});
