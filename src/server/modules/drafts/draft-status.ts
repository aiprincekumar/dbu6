import type Database from "better-sqlite3";
import {
  NO_DRAFTS,
  type DatedBalance,
  type DateSpan,
  type DraftCounts,
  type PostingInputs,
} from "../../../shared/index.js";
import {
  duplicateDraftRowsSql,
  duplicateJournalEntryRowsSql,
  findDuplicateDiagnostics,
  type DuplicateDiagnostic,
  type DuplicateDraftSourceRow,
  type DuplicateJournalEntrySourceRow,
  baseAccountRunningBalanceCtes,
  otherStatementDraftSql,
  draftOrderSql,
  failingDraftAssertionsSelect,
} from "../reconciliation/index.js";
import { allRows, type LedgerAuth } from "../ledger-sql/index.js";

/*
 * What an account's drafts hold (PLAN.md §11 P3). Home, Review, the posting
 * gate and the two draft reports all read these queries. What blocks posting
 * is decided from the counts by `postingChecks` in src/shared, which the gate
 * and the screens share, so a tick on Review and a refusal from the gate
 * cannot disagree.
 *
 * Counts are the reports' rows: a draft that matches two others is two
 * possible duplicates.
 */

/** A draft carrying a statement balance the running balance doesn't reach. */
export type FailingCheck = {
  account_id: number;
  date: string;
  draft_id: number;
  running_balance: number;
  assertion: number;
  diff: number;
};

export interface DraftAccountStatus {
  account_id: number;
  drafts: number;
  /** Drafts with no account (`account_id` is null). */
  uncategorised: number;
  /** The drafts' first and last dates. */
  draft_span: DateSpan;
  /** Drafts carrying a balance the statement printed. */
  balance_checks: number;
  /** The last of those, by date then id. */
  closing: DatedBalance | null;
  failing: FailingCheck[];
  duplicates: DuplicateDiagnostic[];
  /** Accounts whose drafts its balance checks rely on, by id (`addFirst`). */
  add_first: number[];
}

/** Narrows every query to one base account. */
export interface DraftStatusFilter {
  accountId?: number;
}

type DraftCountRow = {
  account_id: number;
  drafts: number;
  uncategorised: number;
  first_date: string;
  last_date: string;
  balance_checks: number;
};

type ClosingRow = { account_id: number; date: string; balance: number };

/** Every account with drafts, keyed by its id. */
export function loadDraftStatus(
  sqlite: Database.Database,
  auth: LedgerAuth,
  filter: DraftStatusFilter = {},
): Map<number, DraftAccountStatus> {
  const params = accountParams(filter);
  const counts = allRows<DraftCountRow>(
    sqlite,
    auth,
    `
    SELECT
      base_account_id AS account_id,
      COUNT(*) AS drafts,
      SUM(CASE WHEN account_id IS NULL THEN 1 ELSE 0 END) AS uncategorised,
      MIN(date) AS first_date,
      MAX(date) AS last_date,
      SUM(CASE WHEN balance_assertion_base_account IS NOT NULL THEN 1 ELSE 0 END)
        AS balance_checks
    FROM scoped_draft_transactions
    WHERE base_account_id IS NOT NULL${accountCondition(filter, "base_account_id")}
    GROUP BY base_account_id`,
    params,
  );
  const closings = allRows<ClosingRow>(
    sqlite,
    auth,
    `
    SELECT account_id, date, balance
    FROM (
      SELECT
        base_account_id AS account_id,
        date,
        balance_assertion_base_account AS balance,
        ROW_NUMBER() OVER (
          PARTITION BY base_account_id ORDER BY ${draftOrderSql("dt", "DESC")}
        ) AS position
      FROM scoped_draft_transactions dt
      WHERE base_account_id IS NOT NULL
        AND balance_assertion_base_account IS NOT NULL${accountCondition(filter, "base_account_id")}
    )
    WHERE position = 1`,
    params,
  );
  const closingById = new Map(closings.map((row) => [row.account_id, row]));
  const failingById = groupBy(
    findFailingChecks(sqlite, auth, filter),
    (row) => row.account_id,
  );
  const duplicatesById = groupBy(
    findDraftDuplicates(sqlite, auth, filter),
    (row) => row.base_account_id,
  );
  const addFirstById = addFirst(sqlite, auth);

  return new Map(
    counts.map((row) => {
      const closing = closingById.get(row.account_id);
      return [
        row.account_id,
        {
          account_id: row.account_id,
          drafts: row.drafts,
          uncategorised: row.uncategorised,
          draft_span: { first_date: row.first_date, last_date: row.last_date },
          balance_checks: row.balance_checks,
          closing: closing
            ? { date: closing.date, balance: closing.balance }
            : null,
          failing: failingById.get(row.account_id) ?? [],
          duplicates: duplicatesById.get(row.account_id) ?? [],
          add_first: addFirstById.get(row.account_id) ?? [],
        },
      ];
    }),
  );
}

/**
 * An account's counts, as the contracts carry them; none without drafts.
 * The accounts it waits for are apart, in `postingInputs`.
 */
export function draftCounts(
  status: DraftAccountStatus | undefined,
): DraftCounts {
  if (status === undefined) return NO_DRAFTS;
  return {
    drafts: status.drafts,
    uncategorised: status.uncategorised,
    duplicates: status.duplicates.length,
    balance_checks: status.balance_checks,
    failing_checks: status.failing.length,
  };
}

/**
 * What the posting checks decide from: the counts, and the accounts to add
 * first, named as `names` has them, the caller's names for the ledger's
 * accounts.
 */
export function postingInputs(
  status: DraftAccountStatus | undefined,
  names: ReadonlyMap<number, string>,
): PostingInputs {
  return {
    ...draftCounts(status),
    add_first: (status?.add_first ?? []).map((accountId) => ({
      account_id: accountId,
      name: names.get(accountId) ?? `account ${accountId}`,
    })),
  };
}

/** The failing draft balance checks, by account, date and draft. */
export function findFailingChecks(
  sqlite: Database.Database,
  auth: LedgerAuth,
  filter: DraftStatusFilter = {},
): FailingCheck[] {
  return allRows<FailingCheck>(
    sqlite,
    auth,
    `${baseAccountRunningBalanceCtes}
    SELECT r.account_id, r.date, r.draft_id, r.running_balance, r.assertion, r.diff
    FROM (${failingDraftAssertionsSelect}) r
    ${accountCondition(filter, "r.account_id", "WHERE")}
    ORDER BY r.account_id, r.date, r.draft_id`,
    accountParams(filter),
  );
}

/**
 * Drafts that look like another draft or a posted entry. A draft matches
 * drafts of its own account, posted entries of any, and the drafts of other
 * accounts categorized to its own. Narrowing to one account loads its drafts
 * and those, and keeps only its rows, which leaves them unchanged.
 */
export function findDraftDuplicates(
  sqlite: Database.Database,
  auth: LedgerAuth,
  filter: DraftStatusFilter = {},
): DuplicateDiagnostic[] {
  const drafts = allRows<DuplicateDraftSourceRow>(
    sqlite,
    auth,
    filter.accountId === undefined
      ? duplicateDraftRowsSql
      : `${duplicateDraftRowsSql}
        AND (dt.base_account_id = @accountId OR dt.account_id = @accountId)`,
    accountParams(filter),
  );
  if (!drafts.some((draft) => inFilter(filter, draft.base_account_id))) {
    return [];
  }
  const journalEntries = allRows<DuplicateJournalEntrySourceRow>(
    sqlite,
    auth,
    duplicateJournalEntryRowsSql,
  );
  return findDuplicateDiagnostics(drafts, journalEntries).filter((row) =>
    inFilter(filter, row.base_account_id),
  );
}

function inFilter(filter: DraftStatusFilter, accountId: number): boolean {
  return filter.accountId === undefined || filter.accountId === accountId;
}

type RelianceRow = { account_id: number; other_id: number };

/**
 * The accounts each account must wait for (`add_first` in the posting
 * checks), by id: the other accounts with a draft categorized to it dated on
 * or before its last draft balance check, which that check counts. An
 * account that, through others, relies on this one back is left out, so two
 * accounts never each wait for the other. Read over every account, since a
 * reliance back can run through any.
 */
export function addFirst(
  sqlite: Database.Database,
  auth: LedgerAuth,
): Map<number, number[]> {
  const rows = allRows<RelianceRow>(
    sqlite,
    auth,
    `
    , last_check AS (
      SELECT base_account_id AS account_id, MAX(date) AS date
      FROM scoped_draft_transactions
      WHERE base_account_id IS NOT NULL
        AND balance_assertion_base_account IS NOT NULL
      GROUP BY base_account_id
    )
    SELECT DISTINCT lc.account_id, dt.base_account_id AS other_id
    FROM last_check lc
    JOIN scoped_draft_transactions dt
      ON ${otherStatementDraftSql("dt")}
      AND dt.account_id = lc.account_id
      AND dt.date <= lc.date`,
  );
  const reliesOn = groupBy(rows, (row) => row.account_id);
  const reaches = (from: number, to: number): boolean => {
    const seen = new Set<number>();
    const stack = [from];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === to) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const row of reliesOn.get(id) ?? []) stack.push(row.other_id);
    }
    return false;
  };
  const waits = new Map<number, number[]>();
  for (const [accountId, others] of reliesOn) {
    const first = others
      .filter((row) => !reaches(row.other_id, accountId))
      .map((row) => row.other_id)
      .sort((a, b) => a - b);
    if (first.length > 0) waits.set(accountId, first);
  }
  return waits;
}

function accountCondition(
  filter: DraftStatusFilter,
  column: string,
  keyword: "AND" | "WHERE" = "AND",
): string {
  return filter.accountId === undefined
    ? ""
    : ` ${keyword} ${column} = @accountId`;
}

function accountParams(filter: DraftStatusFilter): Record<string, unknown> {
  return filter.accountId === undefined ? {} : { accountId: filter.accountId };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => number) {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}
