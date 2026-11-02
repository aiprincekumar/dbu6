import { postingBlocks, type PostingBlock } from "../../shared/index.js";
import { unsafeAsChrono } from "../modules/values/index.js";
import {
  deleteAccountDrafts,
  partitionByCategorization,
  loadCategorizedDrafts,
  postingInputs,
  loadDraftStatus,
} from "../modules/drafts/index.js";
import { planJournals } from "../modules/journal-plan/index.js";
import {
  hasJournalsBesideOpenings,
  insertJournalPlan,
} from "../modules/journals/index.js";
import type { Ledger } from "../modules/ledger-sql/index.js";

export type PostingOutcome =
  | { kind: "account-not-found" }
  // The first thing the draft status shows that keeps the drafts off the
  // books; nothing was written.
  | { kind: "blocked"; block: PostingBlock; baseAccountName: string }
  | {
      kind: "posted";
      baseAccountName: string;
      journalsCreated: number;
      entriesCreated: number;
      draftsPosted: number;
      // The books held nothing but opening balances before this post.
      firstPost: boolean;
    };

/**
 * Adds one account's drafts to the books: a journal per draft, the drafts
 * deleted. Refuses while the draft status shows anything that blocks, with
 * the accounts to add first named as `names` has them.
 */
export function postDrafts(
  { db, sqlite, auth }: Ledger,
  baseAccountId: number,
  names: ReadonlyMap<number, string>,
): PostingOutcome {
  const loaded = loadCategorizedDrafts(db, baseAccountId, auth);
  if (loaded === null) return { kind: "account-not-found" };

  // The same blocks Review shows, so its ticks and this gate agree.
  const status = loadDraftStatus(sqlite, auth, {
    accountId: baseAccountId,
  }).get(baseAccountId);
  const [block] = postingBlocks(postingInputs(status, names));
  if (block) {
    return { kind: "blocked", block, baseAccountName: loaded.baseAccountName };
  }

  // The drafts and the status were read in one synchronous pass, so every
  // draft loaded here has an account.
  const { categorized, uncategorized } = partitionByCategorization([
    ...loaded.categorized,
  ]);
  if (uncategorized.length > 0) {
    throw new Error("Drafts changed while they were being posted.");
  }

  const plan = planJournals(
    unsafeAsChrono(
      categorized.map((draft) => ({
        transaction: draft.transaction,
        account: draft.accountId,
        assertion: draft.assertion,
        comment: draft.comment,
      })),
    ),
    baseAccountId,
  );
  const firstPost = !hasJournalsBesideOpenings(sqlite, auth);
  const inserted = db.transaction((tx: any) => {
    const written = insertJournalPlan(tx, plan, auth);
    deleteAccountDrafts(tx, baseAccountId, auth);
    return written;
  });

  return {
    kind: "posted",
    baseAccountName: loaded.baseAccountName,
    journalsCreated: inserted.journals,
    entriesCreated: inserted.entries,
    draftsPosted: loaded.drafts.length,
    firstPost,
  };
}

export type PostReadyOutcome =
  // Accounts not in the books; nothing was posted.
  | { kind: "accounts-not-found"; accountIds: number[] }
  | {
      kind: "done";
      posted: { accountId: number; name: string; draftsPosted: number }[];
      left: { accountId: number; name: string; block: PostingBlock }[];
      firstPost: boolean;
    };

/**
 * Add all: posts each of `accountIds` that nothing blocks, one account at a
 * time, each in its own transaction, so an account whose drafts changed
 * since the person counted them is left without undoing the others. An
 * account waiting for another to be added first is tried again once that
 * one is in, round after round until a round adds nothing, so the order the
 * ids come in doesn't matter, and an order the waits change while posting
 * is followed too. An account with no drafts left is neither added nor
 * left. Only `accountIds` are posted; `names` names them, and holds every
 * account in the books.
 */
export function postReady(
  ledger: Ledger,
  accountIds: readonly number[],
  names: ReadonlyMap<number, string>,
): PostReadyOutcome {
  const missing = accountIds.filter((id) => !names.has(id));
  if (missing.length > 0) {
    return { kind: "accounts-not-found", accountIds: missing };
  }
  const posted: {
    accountId: number;
    name: string;
    draftsPosted: number;
  }[] = [];
  const blocks = new Map<number, PostingBlock>();
  const firstPost = !hasJournalsBesideOpenings(ledger.sqlite, ledger.auth);
  let remaining = [...new Set(accountIds)];
  for (;;) {
    const still: number[] = [];
    for (const accountId of remaining) {
      const outcome = postDrafts(ledger, accountId, names);
      if (outcome.kind === "posted") {
        // Posted in another tab, or twice: nothing was added.
        if (outcome.draftsPosted === 0) continue;
        posted.push({
          accountId,
          name: names.get(accountId)!,
          draftsPosted: outcome.draftsPosted,
        });
      } else if (outcome.kind === "blocked") {
        blocks.set(accountId, outcome.block);
        still.push(accountId);
      }
      // Not found: every id was found above, and nothing runs between.
    }
    const progressed = still.length < remaining.length;
    remaining = still;
    if (!progressed || remaining.length === 0) break;
  }
  return {
    kind: "done",
    posted,
    left: remaining.map((accountId) => ({
      accountId,
      name: names.get(accountId)!,
      block: blocks.get(accountId)!,
    })),
    firstPost,
  };
}
