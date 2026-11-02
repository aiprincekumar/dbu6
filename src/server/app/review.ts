import { TsRestApi, type SapportaEnv } from "@sapporta/server";
import {
  reviewContract,
  type ImportInstitution,
  type ReviewAccount,
  type ReviewAccountDetail,
} from "../../shared/index.js";
import { loadImportPresets } from "../modules/import-presets/index.js";
import { accountLabel, accountNames } from "./account-names.js";
import { loadLedgerAccounts } from "../modules/accounts/index.js";
import {
  loadAccountStandings,
  type AccountStanding,
} from "./account-standing.js";
import {
  countDraftsByBaseAccount,
  loadCategorizationRuleRequests,
  postingInputs,
} from "../modules/drafts/index.js";
import { loadOpeningEntries } from "../modules/journals/index.js";
import type { Ledger } from "../modules/ledger-sql/index.js";
import { requireWorkflowLedger } from "./workflow-auth.js";

/*
 * Review (PLAN.md §11 P3): the accounts with drafts, and for one account
 * what blocks adding its drafts to the books. Each account is projected from
 * its standing, whose draft status the posting gate reads too. One account's
 * review reads the standing of that account alone, and of the others only
 * their names and draft counts. Beside what blocks posting, each account
 * says how many rule requests wait for the coding agent, so Review's summary
 * and the agent's prompt count them.
 */

const api = new TsRestApi<SapportaEnv>();

api.register("accounts", reviewContract.accounts, async ({ c }) => {
  const ledger = requireWorkflowLedger(c);
  const institutions = loadImportPresets(ledger.db, ledger.auth);
  return {
    status: 200,
    body: { accounts: listReviewAccounts(ledger, institutions) },
  };
});

api.register("account", reviewContract.account, async ({ c, request }) => {
  const ledger = requireWorkflowLedger(c);
  const detail = loadReviewAccount(
    ledger,
    loadImportPresets(ledger.db, ledger.auth),
    request.params.accountId,
  );
  if (detail === null) {
    return { status: 404, body: { error: "Account not found" } };
  }
  return { status: 200, body: detail };
});

export default api;

/** Every account with drafts, sorted by display name. */
export function listReviewAccounts(
  ledger: Ledger,
  institutions: readonly ImportInstitution[],
): ReviewAccount[] {
  const { sqlite, auth } = ledger;
  const names = accountNames(sqlite, auth, institutions);
  return Array.from(loadAccountStandings(sqlite, auth, institutions).values())
    .filter((standing) => standing.drafts !== undefined)
    .map((standing) => reviewAccount(ledger, standing, names))
    .sort(byName);
}

/** One account's review, or null when the account isn't in scope. */
export function loadReviewAccount(
  ledger: Ledger,
  institutions: readonly ImportInstitution[],
  accountId: number,
): ReviewAccountDetail | null {
  const { sqlite, auth } = ledger;
  const standing = loadAccountStandings(sqlite, auth, institutions, {
    accountId,
  }).get(accountId);
  if (!standing) return null;
  const { drafts } = standing;

  return {
    account: reviewAccount(
      ledger,
      standing,
      accountNames(sqlite, auth, institutions),
    ),
    checkpoint: standing.checkpoint,
    has_opening_entry: loadOpeningEntries(sqlite, auth, { accountId }).has(
      accountId,
    ),
    closing: drafts?.closing ?? null,
    failing: (drafts?.failing ?? []).map(
      ({ date, draft_id, running_balance, assertion, diff }) => ({
        date,
        draft_id,
        running_balance,
        assertion,
        diff,
      }),
    ),
    duplicates: (drafts?.duplicates ?? []).map((row) => ({
      date: row.date,
      draft_id: row.draft_id,
      other_draft_id: row.other_draft_id,
      matched_journal_id: row.matched_journal_id,
      matched_journal_entry_id: row.matched_journal_entry_id,
      match_kind: row.match_kind,
      match_type: row.match_type,
      confidence: row.confidence,
      direction: row.direction,
      amount: row.amount,
      narration: row.narration,
      other_narration: row.other_narration,
      draft_account: row.draft_account,
      matched_account: row.matched_account,
    })),
    other_accounts: otherAccountsWithDrafts(ledger, institutions, accountId),
  };
}

/** The accounts other than `accountId` with drafts, sorted by display name. */
function otherAccountsWithDrafts(
  { sqlite, auth }: Ledger,
  institutions: readonly ImportInstitution[],
  accountId: number,
): ReviewAccountDetail["other_accounts"] {
  const counts = countDraftsByBaseAccount(sqlite, auth);
  return loadLedgerAccounts(sqlite, auth)
    .filter((account) => account.id !== accountId && counts.has(account.id))
    .map((account) => ({
      account_id: account.id,
      name: accountLabel(account, institutions).name,
      drafts: counts.get(account.id)!,
    }))
    .sort(byName);
}

// `names` names the accounts to add first. The rule requests are read one
// account at a time: an account with drafts has few, and Review lists few
// accounts.
function reviewAccount(
  { db, auth }: Ledger,
  standing: AccountStanding,
  names: ReadonlyMap<number, string>,
): ReviewAccount {
  return {
    account_id: standing.account_id,
    path: standing.path,
    parent_path: standing.parent_path,
    name: standing.name,
    kind: standing.kind,
    ...postingInputs(standing.drafts, names),
    draft_span: standing.drafts?.draft_span ?? null,
    rule_requests: loadCategorizationRuleRequests(db, auth, standing.account_id)
      .length,
  };
}

function byName(
  a: { name: string; account_id: number },
  b: { name: string; account_id: number },
): number {
  return a.name.localeCompare(b.name) || a.account_id - b.account_id;
}
