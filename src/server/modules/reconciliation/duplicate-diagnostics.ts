import {
  matchDraftTransactions,
  matchTransactionToJournal,
  type JournalCandidate,
  type TransactionMatchType,
  type TransactionIdentityInput,
} from "../transaction-identity/index.js";
import {
  amount as transactionAmount,
  direction as transactionDirection,
  transactionAmountMinor,
} from "../values/index.js";

/*
 * A transfer between two of the person's accounts, or a card payment, is on
 * both statements. Drafted from A's statement and categorized to B, it is
 * already the movement on B, so B's own draft of it is a duplicate: same
 * amount, the other way (A's withdrawal is B's deposit), a few days apart at
 * most, since a card payment can land a day or two after it leaves the bank.
 * Each draft of A's pairs with at most one of B's, the nearest in date, so
 * three equal payments in a week are three duplicates, not nine.
 */

/** How many days apart the two statements may date one transfer. */
export const TRANSFER_MATCH_DAYS = 3;

/** How sure a transfer match is: amount and dates, nothing more. */
const TRANSFER_CONFIDENCE = 0.85;

export const duplicateDraftRowsSql = `
SELECT
  dt.id AS draft_id,
  dt.date AS date,
  dt.source_narration AS narration,
  dt.withdrawal AS withdrawal,
  dt.deposit AS deposit,
  dt.account_id AS account_id,
  dt.base_account_id AS base_account_id,
  dt.source_reference AS source_reference,
  dt.source_transaction_key AS source_transaction_key,
  base.name AS base_account,
  cp.name AS draft_account
FROM scoped_draft_transactions dt
LEFT JOIN scoped_accounts base ON base.id = dt.base_account_id
LEFT JOIN scoped_accounts cp ON cp.id = dt.account_id
WHERE dt.base_account_id IS NOT NULL`;

export const duplicateJournalEntryRowsSql = `
SELECT
  j.id AS journal_id,
  j.date AS date,
  j.description AS journal_description,
  je.id AS entry_id,
  je.account_id AS account_id,
  je.debit AS debit,
  je.credit AS credit,
  je.source_narration AS source_narration,
  je.comment AS comment,
  je.source_reference AS source_reference,
  je.source_transaction_key AS source_transaction_key,
  a.name AS account
FROM scoped_journal_entries je
JOIN scoped_journals j ON j.id = je.journal_id
JOIN scoped_accounts a ON a.id = je.account_id`;

export interface DuplicateDraftSourceRow {
  draft_id: number;
  date: string;
  narration: string;
  withdrawal: number;
  deposit: number;
  account_id: number | null;
  base_account_id: number;
  source_reference: string | null;
  source_transaction_key: string | null;
  base_account: string;
  draft_account: string | null;
}

export interface DuplicateJournalEntrySourceRow {
  journal_id: number;
  date: string;
  journal_description: string;
  entry_id: number;
  account_id: number;
  debit: number;
  credit: number;
  source_narration: string | null;
  comment: string | null;
  source_reference: string | null;
  source_transaction_key: string | null;
  account: string;
}

export interface DuplicateDiagnostic extends Record<string, unknown> {
  match_kind: "draft-draft" | "draft-journal" | "draft-transfer";
  match_type: TransactionMatchType | "other-statement-transfer";
  confidence: number;
  date: string;
  base_account_id: number;
  base_account: string;
  draft_id: number;
  other_draft_id: number | null;
  matched_journal_id: number | null;
  matched_journal_entry_id: number | null;
  direction: "deposit" | "withdrawal";
  amount: number;
  narration: string;
  other_narration: string | null;
  source_reference: string | null;
  source_transaction_key: string | null;
  other_source_reference: string | null;
  other_source_transaction_key: string | null;
  /** The account the draft is categorized to, if any. */
  draft_account_id: number | null;
  draft_account: string | null;
  /**
   * The matched draft's account, or the matched journal entry's; for a
   * transfer, the account whose statement the matched draft is from.
   */
  matched_account_id: number | null;
  matched_account: string | null;
}

function identity(row: DuplicateDraftSourceRow): TransactionIdentityInput {
  return {
    baseAccountId: row.base_account_id,
    date: row.date,
    narration: row.narration,
    withdrawal: row.withdrawal,
    deposit: row.deposit,
    accountId: row.account_id,
    sourceReference: row.source_reference,
    sourceTransactionKey: row.source_transaction_key,
  };
}

export function findDuplicateDiagnostics(
  drafts: DuplicateDraftSourceRow[],
  journalEntryRows: DuplicateJournalEntrySourceRow[],
): DuplicateDiagnostic[] {
  const journalsById = new Map<number, JournalCandidate>();
  const journalRowsByEntryId = new Map<
    number,
    DuplicateJournalEntrySourceRow
  >();
  for (const row of journalEntryRows) {
    journalRowsByEntryId.set(row.entry_id, row);
    let journal = journalsById.get(row.journal_id);
    if (!journal) {
      journal = {
        id: row.journal_id,
        date: row.date,
        description: row.journal_description,
        entries: [],
      };
      journalsById.set(row.journal_id, journal);
    }
    journal.entries.push({
      id: row.entry_id,
      accountId: row.account_id,
      debit: row.debit,
      credit: row.credit,
      sourceNarration: row.source_narration,
      sourceReference: row.source_reference,
      sourceTransactionKey: row.source_transaction_key,
    });
  }

  const diagnostics: DuplicateDiagnostic[] = [];
  for (let leftIndex = 0; leftIndex < drafts.length; leftIndex++) {
    const left = drafts[leftIndex];
    const leftIdentity = identity(left);
    const direction = transactionDirection(leftIdentity);
    const amount = transactionAmount(leftIdentity);

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < drafts.length;
      rightIndex++
    ) {
      const right = drafts[rightIndex];
      const match = matchDraftTransactions(leftIdentity, identity(right));
      if (!match) continue;
      diagnostics.push({
        match_kind: "draft-draft",
        match_type: match.matchType,
        confidence: match.confidence,
        date: left.date,
        base_account_id: left.base_account_id,
        base_account: left.base_account,
        draft_id: left.draft_id,
        other_draft_id: right.draft_id,
        matched_journal_id: null,
        matched_journal_entry_id: null,
        direction,
        amount,
        narration: left.narration,
        other_narration: right.narration,
        source_reference: left.source_reference,
        source_transaction_key: left.source_transaction_key,
        other_source_reference: right.source_reference,
        other_source_transaction_key: right.source_transaction_key,
        draft_account_id: left.account_id,
        draft_account: left.draft_account,
        matched_account_id: right.account_id,
        matched_account: right.draft_account,
      });
    }

    for (const journal of journalsById.values()) {
      for (const match of matchTransactionToJournal(leftIdentity, journal)) {
        const entry = journalRowsByEntryId.get(match.journalEntryId)!;
        diagnostics.push({
          match_kind: "draft-journal",
          match_type: match.matchType,
          confidence: match.confidence,
          date: left.date,
          base_account_id: left.base_account_id,
          base_account: left.base_account,
          draft_id: left.draft_id,
          other_draft_id: null,
          matched_journal_id: match.journalId,
          matched_journal_entry_id: match.journalEntryId,
          direction,
          amount,
          narration: left.narration,
          // A manual entry, matched by its reference, has only its comment.
          other_narration: entry.source_narration ?? entry.comment,
          source_reference: left.source_reference,
          source_transaction_key: left.source_transaction_key,
          other_source_reference: entry.source_reference,
          other_source_transaction_key: entry.source_transaction_key,
          draft_account_id: left.account_id,
          draft_account: left.draft_account,
          matched_account_id: entry.account_id,
          matched_account: entry.account,
        });
      }
    }
  }
  diagnostics.push(...transferDiagnostics(drafts));
  return diagnostics.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.draft_id - right.draft_id,
  );
}

// Each draft paired with another account's draft categorized to its own: the
// nearest in date first, every draft in at most one pair.
function transferDiagnostics(
  drafts: DuplicateDraftSourceRow[],
): DuplicateDiagnostic[] {
  // The drafts by the account they're categorized to, so each draft is
  // compared only with those sent to its own account.
  const byAccount = new Map<number, DuplicateDraftSourceRow[]>();
  for (const draft of drafts) {
    if (draft.account_id === null) continue;
    const sent = byAccount.get(draft.account_id) ?? [];
    sent.push(draft);
    byAccount.set(draft.account_id, sent);
  }
  const pairs = drafts.flatMap((own) =>
    (byAccount.get(own.base_account_id) ?? [])
      .filter((other) => isTransferPair(own, other))
      .map((other) => ({ own, other, days: daysApart(own.date, other.date) })),
  );
  pairs.sort(
    (a, b) =>
      a.days - b.days ||
      a.own.draft_id - b.own.draft_id ||
      a.other.draft_id - b.other.draft_id,
  );
  const paired = new Set<number>();
  const diagnostics: DuplicateDiagnostic[] = [];
  for (const { own, other } of pairs) {
    // A draft is the own side of one pair and the other side of another
    // only when both accounts' drafts are categorized to each other.
    const ownKey = own.draft_id * 2;
    const otherKey = other.draft_id * 2 + 1;
    if (paired.has(ownKey) || paired.has(otherKey)) continue;
    paired.add(ownKey);
    paired.add(otherKey);
    const ownIdentity = identity(own);
    diagnostics.push({
      match_kind: "draft-transfer",
      match_type: "other-statement-transfer",
      confidence: TRANSFER_CONFIDENCE,
      date: own.date,
      base_account_id: own.base_account_id,
      base_account: own.base_account,
      draft_id: own.draft_id,
      other_draft_id: other.draft_id,
      matched_journal_id: null,
      matched_journal_entry_id: null,
      direction: transactionDirection(ownIdentity),
      amount: transactionAmount(ownIdentity),
      narration: own.narration,
      other_narration: other.narration,
      source_reference: own.source_reference,
      source_transaction_key: own.source_transaction_key,
      other_source_reference: other.source_reference,
      other_source_transaction_key: other.source_transaction_key,
      draft_account_id: own.account_id,
      draft_account: own.draft_account,
      matched_account_id: other.base_account_id,
      matched_account: other.base_account,
    });
  }
  return diagnostics;
}

/** What the transfer rule reads of a draft. */
export interface TransferSide {
  date: string;
  withdrawal: number;
  deposit: number;
  account_id: number | null;
  base_account_id: number;
}

/**
 * Whether `other`, from another account's statement and categorized to
 * `own`'s account, is the same transfer as `own`: the same amount the other
 * way, at most `TRANSFER_MATCH_DAYS` apart.
 */
export function isTransferPair(
  own: TransferSide,
  other: TransferSide,
): boolean {
  return (
    other.account_id === own.base_account_id &&
    other.base_account_id !== own.base_account_id &&
    transactionDirection(other) !== transactionDirection(own) &&
    transactionAmountMinor(other) === transactionAmountMinor(own) &&
    daysApart(own.date, other.date) <= TRANSFER_MATCH_DAYS
  );
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}
