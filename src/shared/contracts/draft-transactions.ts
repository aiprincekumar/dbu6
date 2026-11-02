import { z } from "zod";
import { initContract } from "@sapporta/rest-core";
import {
  categorizationReportSchema,
  categorizationTallySchema,
} from "./import-drafts.js";
import {
  importProgressIdSchema,
  importProgressSchema,
} from "./import-progress.js";
import { postingBlockSchema } from "./posting-checks.js";

const c = initContract();

const errorSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
    detail: z.string().optional(),
    hint: z.string().optional(),
    code: z.string().optional(),
    uncategorized_count: z.number().optional(),
    failing_count: z.number().optional(),
    duplicate_count: z.number().optional(),
    // ADD_OTHER_ACCOUNT_FIRST: the accounts whose drafts to add first.
    add_first: z
      .array(z.object({ account_id: z.number(), name: z.string() }))
      .optional(),
  })
  .passthrough();

const classifiedDraftTransactionSchema = z.object({
  id: z.number(),
  source_narration: z.string(),
  comment: z.string().nullable(),
  account_id: z.number().nullable(),
  account_name: z.string().nullable(),
});

// Classifying drafts again: each draft's texts and account, how the LLM
// fared on what the mapping rules didn't categorize, and the drafts by who
// categorized them.
export const draftClassificationSchema = z.object({
  transactions: z.array(classifiedDraftTransactionSchema),
  categorization: categorizationReportSchema,
  categorization_tally: categorizationTallySchema,
});
export type DraftClassification = z.infer<typeof draftClassificationSchema>;

export const gpayDraftClassificationSchema = draftClassificationSchema.extend({
  gpay_enriched_count: z.number(),
});
export type GPayDraftClassification = z.infer<
  typeof gpayDraftClassificationSchema
>;

const repeatedFormStringSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : [value]));

const repeatedFormIdSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : [value]),
  z.array(z.coerce.number().int().positive()).min(1),
);

// Whether the books held nothing but opening balances before this post: the
// first run's end ("Your books are set up.") is the post that leaves
// nothing to review after such a start.
const firstPostSchema = z.boolean();

/**
 * What Add all did: the accounts it added, in the order it added them, and
 * the ones it left, each with the first check that kept it out when it
 * stopped.
 */
export const postReadyResultSchema = z.object({
  posted: z.array(
    z.object({
      account_id: z.number(),
      name: z.string(),
      drafts_posted: z.number(),
    }),
  ),
  left: z.array(
    z.object({
      account_id: z.number(),
      name: z.string(),
      block: postingBlockSchema,
    }),
  ),
  first_post: firstPostSchema,
});
export type PostReadyResult = z.infer<typeof postReadyResultSchema>;

export const draftTransactionsContract = c.router({
  classifyDraftTransactions: c.mutation({
    method: "POST",
    path: "/draft-transactions/classify",
    summary:
      "Classify selected draft transactions; an optional `progress_id` for classifyProgress",
    body: z.object({
      ids: z.array(z.number().int()).min(1),
      custom_mappings_filenames: z.array(z.string()).optional(),
      progress_id: importProgressIdSchema.optional(),
    }),
    responses: {
      200: draftClassificationSchema,
      400: errorSchema,
      403: errorSchema,
    },
  }),
  classifyDraftTransactionsWithGPay: c.mutation({
    method: "POST",
    path: "/draft-transactions/classify-with-gpay",
    summary:
      "Enrich selected drafts from GPay HTML, then classify them; an optional `progress_id` for classifyProgress",
    contentType: "multipart/form-data",
    body: z.object({
      ids: repeatedFormIdSchema,
      custom_mappings_filenames: repeatedFormStringSchema
        .optional()
        .default([]),
      progress_id: importProgressIdSchema.optional(),
    }),
    responses: {
      200: gpayDraftClassificationSchema,
      400: errorSchema,
      403: errorSchema,
    },
  }),
  classifyProgress: c.query({
    method: "GET",
    path: "/draft-transactions/classify/progress/:progressId",
    summary:
      "How far the running classification sent with this `progress_id` has got, its drafts and their accounts so far. Stage `done` for a minute after it has answered; 404 before it starts and after that minute",
    pathParams: z.object({ progressId: importProgressIdSchema }),
    query: z.object({}),
    responses: {
      200: importProgressSchema,
      403: errorSchema,
      404: errorSchema,
    },
  }),
  setDraftsAccount: c.mutation({
    method: "POST",
    path: "/draft-transactions/set-account",
    summary: "Send the drafts to one account, all or none",
    body: z.object({
      ids: z.array(z.number().int().positive()).min(1),
      account_id: z.number().int().positive(),
    }),
    responses: {
      200: z.object({ updated: z.number() }),
      403: errorSchema,
      // The account, or one of the drafts, isn't in the books.
      404: errorSchema,
      // The account is one of the drafts' own base account.
      422: errorSchema,
    },
  }),
  settleTransfer: c.mutation({
    method: "POST",
    path: "/draft-transactions/settle-transfer",
    summary:
      "Settle a transfer both statements carry (a `draft-transfer` duplicate): the earlier draft stays, sent to the other account; the later is deleted, its day's balance moved onto that day's last draft; the later account's balances between the two dates are cleared",
    body: z.object({
      draft_ids: z.tuple([
        z.number().int().positive(),
        z.number().int().positive(),
      ]),
    }),
    responses: {
      200: z.object({
        kept_draft_id: z.number(),
        deleted_draft_id: z.number(),
        cleared_balances: z.number(),
      }),
      403: errorSchema,
      // One of the drafts isn't in the books.
      404: errorSchema,
      // The two aren't one transfer on two statements.
      422: errorSchema,
    },
  }),
  renderDraftHledger: c.query({
    method: "GET",
    path: "/draft-transactions/hledger",
    summary: "Render draft transactions as hledger journal text",
    query: z.object({
      base_account_id: z.coerce.number().int().positive(),
    }),
    responses: {
      200: z.object({
        hledger_journal: z.string(),
        transaction_count: z.number(),
        base_account: z.string(),
      }),
      403: errorSchema,
      404: errorSchema,
    },
  }),
  postDraftsToJournal: c.mutation({
    method: "POST",
    path: "/draft-transactions/post-to-journal",
    summary: "Post draft transactions for a base account",
    body: z.object({
      base_account_id: z.number().int().positive(),
    }),
    responses: {
      200: z.object({
        base_account: z.string(),
        journals_created: z.number(),
        entries_created: z.number(),
        drafts_posted: z.number(),
        first_post: firstPostSchema,
      }),
      403: errorSchema,
      404: errorSchema,
      422: errorSchema,
    },
  }),
  postReadyDrafts: c.mutation({
    method: "POST",
    path: "/draft-transactions/post-ready",
    summary:
      "Add all: post the drafts of every account named that nothing blocks, each account on its own, in an order the accounts' add-first waits allow; the rest are left with the check that blocks them. Only the accounts named are ever posted. The person's own button, on Review",
    body: z.object({
      base_account_ids: z.array(z.number().int().positive()).min(1),
    }),
    responses: {
      200: postReadyResultSchema,
      403: errorSchema,
      // One of the accounts isn't in the books; nothing was posted.
      404: errorSchema,
    },
  }),
});
