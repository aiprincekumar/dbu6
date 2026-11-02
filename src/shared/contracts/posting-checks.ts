import { z } from "zod";

/*
 * What an account's drafts hold, and the checks they must pass before they are
 * added to the books (PLAN.md §11 P3). The API's draft status module counts
 * them; each check's state is decided here from the counts, and the posting
 * gate, Update and Review all read it, so no screen decides on its own whether
 * drafts can be posted. Which accounts Review's Add all can add is decided
 * here too (`readyToAdd`).
 *
 * Counts are the draft reports' rows: a draft that matches two others is two
 * possible duplicates.
 *
 * A balance check can rely on another account's drafts: a transfer or card
 * payment drafted from that account's statement and categorized to this one
 * counts in this account's running balance. Adding this account's drafts
 * first would put balances in the books that miss until that account's are
 * added, so it waits for them (`add_first`). Two accounts whose checks rely
 * on each other can't both wait; neither names the other.
 */

export const draftCountsSchema = z.object({
  drafts: z.number(),
  /** Drafts with no account. */
  uncategorised: z.number(),
  duplicates: z.number(),
  /** Drafts carrying a balance the statement printed. */
  balance_checks: z.number(),
  failing_checks: z.number(),
});
export type DraftCounts = z.infer<typeof draftCountsSchema>;

/** Accounts whose drafts the balance checks rely on, to add first, by name. */
export const addFirstSchema = z.array(
  z.object({ account_id: z.number(), name: z.string() }),
);
export type AddFirst = z.infer<typeof addFirstSchema>;

/** What the checks are decided from: the counts, and the accounts to add first. */
export const postingInputsSchema = draftCountsSchema.extend({
  add_first: addFirstSchema,
});
export type PostingInputs = z.infer<typeof postingInputsSchema>;

/** An account with no drafts. */
export const NO_DRAFTS: DraftCounts = {
  drafts: 0,
  uncategorised: 0,
  duplicates: 0,
  balance_checks: 0,
  failing_checks: 0,
};

/**
 * The checks, in Review's tab order, which is also the order the posting gate
 * refuses in.
 */
export const POSTING_CHECK_KINDS = [
  "categorization",
  "duplicates",
  "balance-checks",
] as const;
export type PostingCheckKind = (typeof POSTING_CHECK_KINDS)[number];

/**
 * A check that blocks posting. A block is a problem when the numbers don't
 * add up (usually a wrong or missing statement), and needs attention when
 * drafts only need an account, or only wait for another account's drafts to
 * be added first. A schema, since Add all answers with the block that kept
 * each account out.
 */
export const postingBlockSchema = z.union([
  z.object({
    kind: z.literal("categorization"),
    state: z.literal("blocks"),
    severity: z.literal("attention"),
    count: z.number(),
  }),
  z.object({
    kind: z.literal("duplicates"),
    state: z.literal("blocks"),
    severity: z.literal("problem"),
    count: z.number(),
  }),
  z.object({
    kind: z.literal("balance-checks"),
    state: z.literal("blocks"),
    severity: z.literal("problem"),
    count: z.number(),
  }),
  z.object({
    kind: z.literal("balance-checks"),
    state: z.literal("blocks"),
    severity: z.literal("attention"),
    add_first: addFirstSchema,
  }),
]);
export type PostingBlock = z.infer<typeof postingBlockSchema>;

/**
 * One check on an account's drafts: it passes, or it blocks posting.
 * Drafts that carry no balance check have none to pass, which doesn't block.
 */
export type PostingCheck =
  | { kind: "categorization"; state: "passes"; drafts: number }
  | { kind: "duplicates"; state: "passes" }
  | { kind: "balance-checks"; state: "none" }
  | { kind: "balance-checks"; state: "passes" }
  | PostingBlock;

export type ProblemBlock = Extract<PostingBlock, { severity: "problem" }>;

const CHECKS: {
  [Kind in PostingCheckKind]: (
    counts: PostingInputs,
  ) => Extract<PostingCheck, { kind: Kind }>;
} = {
  categorization: (counts) =>
    counts.uncategorised > 0
      ? {
          kind: "categorization",
          state: "blocks",
          severity: "attention",
          count: counts.uncategorised,
        }
      : { kind: "categorization", state: "passes", drafts: counts.drafts },
  duplicates: (counts) =>
    counts.duplicates > 0
      ? {
          kind: "duplicates",
          state: "blocks",
          severity: "problem",
          count: counts.duplicates,
        }
      : { kind: "duplicates", state: "passes" },
  "balance-checks": (counts) => {
    if (counts.failing_checks > 0) {
      return {
        kind: "balance-checks",
        state: "blocks",
        severity: "problem",
        count: counts.failing_checks,
      };
    }
    if (counts.add_first.length > 0) {
      return {
        kind: "balance-checks",
        state: "blocks",
        severity: "attention",
        add_first: counts.add_first,
      };
    }
    return counts.balance_checks === 0
      ? { kind: "balance-checks", state: "none" }
      : { kind: "balance-checks", state: "passes" };
  },
};

/** One check on the drafts these counts describe. */
export function postingCheck<Kind extends PostingCheckKind>(
  counts: PostingInputs,
  kind: Kind,
): Extract<PostingCheck, { kind: Kind }> {
  return CHECKS[kind](counts);
}

/** Every check, in tab order. */
export function postingChecks(counts: PostingInputs): PostingCheck[] {
  return POSTING_CHECK_KINDS.map((kind) => postingCheck(counts, kind));
}

/** The checks that block, in tab order; none when the drafts can be added. */
export function postingBlocks(counts: PostingInputs): PostingBlock[] {
  return postingChecks(counts).filter(isBlock);
}

export function isBlock(check: PostingCheck): check is PostingBlock {
  return check.state === "blocks";
}

export function isProblem(block: PostingBlock): block is ProblemBlock {
  return block.severity === "problem";
}

export type WaitBlock = Extract<PostingBlock, { add_first: AddFirst }>;

/**
 * Whether a block only waits for other accounts' drafts to be added first:
 * every check would pass once they are. A wait shows only when no balance
 * check fails, so it is never beside a failing one.
 */
export function isWaitBlock(block: PostingBlock): block is WaitBlock {
  return block.kind === "balance-checks" && block.severity === "attention";
}

/**
 * The accounts of `accounts` that Add all can add: those with drafts and no
 * block but waiting for accounts it adds first. It starts from the accounts with no
 * block and takes in, round by round, those whose only block is waiting for
 * accounts already taken, until a round takes none; so the accounts come
 * back in an order they can be added in, and an account waiting for one
 * outside `accounts`, or for one with a problem, stays out. Accounts that
 * wait for each other wait forever, and stay out too; the draft status
 * drops such waits before they get here (`addFirst`).
 */
export function readyToAdd<
  Account extends PostingInputs & { account_id: number },
>(accounts: readonly Account[]): Account[] {
  const waiting = accounts.filter(
    (account) =>
      account.drafts > 0 && postingBlocks(account).every(isWaitBlock),
  );
  const ready: Account[] = [];
  const taken = new Set<number>();
  for (;;) {
    const round = waiting.filter(
      (account) =>
        !taken.has(account.account_id) &&
        account.add_first.every((first) => taken.has(first.account_id)),
    );
    if (round.length === 0) return ready;
    for (const account of round) {
      ready.push(account);
      taken.add(account.account_id);
    }
  }
}
