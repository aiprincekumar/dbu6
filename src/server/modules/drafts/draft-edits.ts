import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { LedgerAuth } from "../ledger-sql/index.js";
import {
  draftTransactions,
  draftTransactionsTable,
} from "../../schema/draft-journals.js";

/*
 * Changes to drafts already saved: reclassifying some of them, settling a
 * transfer both statements carry, and clearing an account's drafts once they
 * are posted.
 */

export type SavedDraft = typeof draftTransactionsTable.$inferSelect;

// The caller's drafts among `ids`; ids it can't see are left out.
export function loadDraftsById(
  db: any,
  ids: number[],
  auth: LedgerAuth,
): SavedDraft[] {
  const draftAccess = auth.rowSecurity.forTable(draftTransactions);
  return db
    .select()
    .from(draftTransactionsTable)
    .where(draftAccess.ownedRows(inArray(draftTransactionsTable.id, ids)))
    .all();
}

export interface ReclassifiedDraft {
  id: number;
  // The source narration, with a Google Pay recipient now in front when a
  // takeout named one: the one change a saved source narration takes.
  sourceNarration: string;
  accountId: number | null;
  // A comment for a draft that has none yet, such as its Google Pay
  // recipient. A comment the draft already has stays.
  comment?: string | null;
}

// Saves each draft's source narration and account, and its comment where it
// has none, all or none.
export function saveReclassifiedDrafts(
  db: any,
  drafts: readonly ReclassifiedDraft[],
  auth: LedgerAuth,
): void {
  const draftAccess = auth.rowSecurity.forTable(draftTransactions);
  db.transaction((tx: any) => {
    for (const draft of drafts) {
      tx.update(draftTransactionsTable)
        .set({
          source_narration: draft.sourceNarration,
          account_id: draft.accountId,
          ...(draft.comment
            ? {
                comment: sql`coalesce(${draftTransactionsTable.comment}, ${draft.comment})`,
              }
            : {}),
        })
        .where(draftAccess.ownedRows(eq(draftTransactionsTable.id, draft.id)))
        .run();
    }
  });
}

/** A transfer on two statements, settled into one draft. */
export interface TransferSettlement {
  /** The draft that stays, and the account it goes to: the other statement's. */
  keep: { id: number; date: SavedDraft["date"]; accountId: number };
  /** The other statement's draft of the same transfer, deleted. */
  drop: SavedDraft & { base_account_id: number };
}

/**
 * Keeps one draft of a transfer and deletes the other, all or none. The kept
 * draft dates the transfer on both accounts, so the dropped draft's account
 * counts it from `keep.date`. A balance the dropped draft carried moves onto
 * its day's new last draft, if the day has one. That account's balances from
 * `keep.date` up to the day before the dropped draft's are cleared: its
 * statement printed them before the money arrived. Returns how many it
 * cleared.
 */
export function settleTransferDrafts(
  db: any,
  { keep, drop }: TransferSettlement,
  auth: LedgerAuth,
): number {
  const draftAccess = auth.rowSecurity.forTable(draftTransactions);
  const t = draftTransactionsTable;
  return db.transaction((tx: any) => {
    tx.update(t)
      .set({ account_id: keep.accountId })
      .where(draftAccess.ownedRows(eq(t.id, keep.id)))
      .run();
    tx.delete(t)
      .where(draftAccess.ownedRows(eq(t.id, drop.id)))
      .run();
    if (drop.balance_assertion_base_account !== null) {
      const dayLast = tx
        .select({ id: t.id })
        .from(t)
        .where(
          draftAccess.ownedRows(
            and(
              eq(t.base_account_id, drop.base_account_id),
              eq(t.date, drop.date),
            ),
          ),
        )
        .orderBy(desc(t.id))
        .limit(1)
        .get();
      if (dayLast) {
        tx.update(t)
          .set({
            balance_assertion_base_account: drop.balance_assertion_base_account,
          })
          .where(draftAccess.ownedRows(eq(t.id, dayLast.id)))
          .run();
      }
    }
    return tx
      .update(t)
      .set({ balance_assertion_base_account: null })
      .where(
        draftAccess.ownedRows(
          and(
            eq(t.base_account_id, drop.base_account_id),
            gte(t.date, keep.date),
            lt(t.date, drop.date),
            sql`${t.balance_assertion_base_account} IS NOT NULL`,
          ),
        ),
      )
      .run().changes;
  });
}

// Deletes every draft under the account. Runs inside the caller's
// transaction, so posting clears the drafts with the journals it writes.
export function deleteAccountDrafts(
  tx: any,
  baseAccountId: number,
  auth: LedgerAuth,
): void {
  const draftAccess = auth.rowSecurity.forTable(draftTransactions);
  tx.delete(draftTransactionsTable)
    .where(
      draftAccess.ownedRows(
        eq(draftTransactionsTable.base_account_id, baseAccountId),
      ),
    )
    .run();
}
