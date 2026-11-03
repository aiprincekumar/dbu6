import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { draftOrderSql } from "../modules/reconciliation/index.js";
import { packageDir } from "../paths.js";

/*
 * Deleting the draft that carries its day's statement balance
 * (migrations/0015_keep_draft_day_balance.sql), on a database migrated from
 * scratch: a later migration that rebuilds `draft_transactions` without the
 * trigger fails here.
 *
 * Sample Bank (1) has three drafts on 1 Mar, the last carrying the day's
 * balance, and one on 2 Mar carrying its own. Sample Card (2) has a draft on
 * 1 Mar, and so does Sample Bank in another user's books (3).
 */
function books(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: packageDir("migrations") });
  sqlite.exec(`
    INSERT INTO accounts
      (id, workspace_id, scoped_to_user_id, name, parent_id, account_type, created_at, updated_at)
    VALUES
      (1, 'workspace', 'user', 'Sample Bank', NULL, 'Asset', '', ''),
      (2, 'workspace', 'user', 'Sample Card', NULL, 'Liability', '', ''),
      (3, 'workspace', 'other-user', 'Sample Bank', NULL, 'Asset', '', '');
    INSERT INTO draft_transactions
      (id, workspace_id, scoped_to_user_id, date, source_narration, withdrawal, deposit, base_account_id, balance_assertion_base_account, created_at, updated_at)
    VALUES
      (11, 'workspace', 'user', '2026-03-01', 'NOPII one', 100, 0, 1, NULL, '', ''),
      (12, 'workspace', 'user', '2026-03-01', 'NOPII two', 200, 0, 1, NULL, '', ''),
      (13, 'workspace', 'user', '2026-03-01', 'NOPII three', 300, 0, 1, 4000, '', ''),
      (14, 'workspace', 'user', '2026-03-02', 'NOPII four', 100, 0, 1, 3900, '', ''),
      (21, 'workspace', 'user', '2026-03-01', 'NOPII card', 50, 0, 2, NULL, '', ''),
      (31, 'workspace', 'other-user', '2026-03-01', 'NOPII other', 50, 0, 3, NULL, '', '');
  `);
  return sqlite;
}

function balances(sqlite: Database.Database): Record<number, number | null> {
  const rows = sqlite
    .prepare(
      `SELECT id, balance_assertion_base_account AS balance FROM draft_transactions ORDER BY id`,
    )
    .all() as { id: number; balance: number | null }[];
  return Object.fromEntries(rows.map((row) => [row.id, row.balance]));
}

describe("deleting a draft that carries its day's balance", () => {
  it("moves the balance onto the day's new last draft, in the order the checks read", () => {
    const sqlite = books();
    sqlite.exec(`DELETE FROM draft_transactions WHERE id = 13`);
    expect(balances(sqlite)).toEqual({
      11: null,
      12: 4000,
      14: 3900,
      21: null,
      31: null,
    });
    const last = sqlite
      .prepare(
        `SELECT id FROM draft_transactions dt
         WHERE base_account_id = 1 AND date = '2026-03-01'
         ORDER BY ${draftOrderSql("dt", "DESC")} LIMIT 1`,
      )
      .get();
    expect(last).toEqual({ id: 12 });
  });

  it("lands on the draft left last when several of the day go at once", () => {
    const sqlite = books();
    sqlite.exec(`DELETE FROM draft_transactions WHERE id IN (12, 13)`);
    expect(balances(sqlite)).toMatchObject({ 11: 4000, 14: 3900 });
  });

  it("goes with the day's only draft, touching no other day, account or user", () => {
    const sqlite = books();
    sqlite.exec(`DELETE FROM draft_transactions WHERE id = 14`);
    expect(balances(sqlite)).toEqual({
      11: null,
      12: null,
      13: 4000,
      21: null,
      31: null,
    });
  });

  it("leaves the balance where it is when a draft without one goes", () => {
    const sqlite = books();
    sqlite.exec(`DELETE FROM draft_transactions WHERE id = 11`);
    expect(balances(sqlite)).toMatchObject({ 12: null, 13: 4000 });
  });

  it("deletes a whole account's drafts, as posting does", () => {
    const sqlite = books();
    sqlite.exec(`DELETE FROM draft_transactions WHERE base_account_id = 1`);
    expect(balances(sqlite)).toEqual({ 21: null, 31: null });
  });
});
