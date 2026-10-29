import type Database from "better-sqlite3";
import { allRows, type LedgerAuth } from "../ledger-sql/index.js";

/*
 * Where an account's drafts begin. Posted, a draft lands on two accounts:
 * its statement's (`base_account_id`) and the one it is categorized to
 * (`account_id`), so each side has a first date here.
 */

export type FirstDrafts = {
  account_id: number;
  first_date: string;
};

/** Each account with drafts from its own statements, by id. */
export function loadFirstDrafts(
  sqlite: Database.Database,
  auth: LedgerAuth,
): Map<number, FirstDrafts> {
  return new Map(
    allRows<FirstDrafts>(
      sqlite,
      auth,
      `SELECT base_account_id AS account_id, MIN(date) AS first_date
       FROM scoped_draft_transactions
       WHERE base_account_id IS NOT NULL
       GROUP BY base_account_id`,
    ).map((row) => [row.account_id, row]),
  );
}

/**
 * The day of each account's first draft categorized to it (`account_id`),
 * by id: a row on another account's statement that, once posted, is on this
 * account too. `loadFirstDrafts` has the drafts from its own statements.
 */
export function loadFirstCategorizedDraftDates(
  sqlite: Database.Database,
  auth: LedgerAuth,
): Map<number, string> {
  return new Map(
    allRows<{ account_id: number; first_date: string }>(
      sqlite,
      auth,
      `SELECT account_id, MIN(date) AS first_date
       FROM scoped_draft_transactions
       WHERE account_id IS NOT NULL
       GROUP BY account_id`,
    ).map((row) => [row.account_id, row.first_date]),
  );
}
