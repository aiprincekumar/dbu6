import { z } from "zod";
import { initContract } from "@sapporta/rest-core";
import { errorBodySchema } from "@sapporta/shared/contracts";
import { ledgerAccountTypeSchema } from "./setup.js";

const c = initContract();

/*
 * One account's name, type and parent, changed together. The triggers in
 * migrations/0004_account_tree_rules.sql check each written row, so a type
 * change writes the account and its whole branch in one transaction
 * (workflows/chart-of-accounts.ts). The generated table API stays writable;
 * these two routes are what the Accounts page uses, because the rules the
 * triggers can't see (Opening Balances, a bank or card's type, what a delete
 * is standing on) live in the workflow.
 */

/** One account as the chart holds it, in the order the chart reads them. */
export const chartAccountFieldsSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  parent_id: z.number().int().nullable(),
  account_type: ledgerAccountTypeSchema,
});
export type ChartAccountFields = z.infer<typeof chartAccountFieldsSchema>;

/**
 * A change to one account. The name is not `min(1)` here: an empty one is a
 * refusal the workflow explains (`name_required`), not a 400 from the
 * contract.
 */
export const accountChangeSchema = z.object({
  name: z.string(),
  account_type: ledgerAccountTypeSchema,
  parent_id: z.number().int().positive().nullable(),
});
export type AccountChange = z.infer<typeof accountChangeSchema>;

/** Why changing one account was refused. */
export const ACCOUNT_CHANGE_REFUSAL_CODES = [
  // No account in scope has this id.
  "unknown_account",
  // The name is empty, or already another account's.
  "name_required",
  "ledger_name_taken",
  // The parent is another type, or the account itself or under it.
  "parent_not_suitable",
  // Opening Balances keeps its name and stays Equity.
  "opening_balances_fixed",
  // A bank or card's type follows its import preset.
  "bank_or_card_type_fixed",
] as const;
export const accountChangeRefusalCodeSchema = z.enum(
  ACCOUNT_CHANGE_REFUSAL_CODES,
);
export type AccountChangeRefusalCode = z.infer<
  typeof accountChangeRefusalCodeSchema
>;

/** The field a change refusal is about, when it is about one. */
export const accountChangeFieldSchema = z
  .enum(["name", "account_type", "parent_id"])
  .nullable();
export type AccountChangeField = z.infer<typeof accountChangeFieldSchema>;

export const accountChangeRefusalSchema = z.object({
  error: z.string(),
  code: accountChangeRefusalCodeSchema,
  field: accountChangeFieldSchema,
});
export type AccountChangeRefusal = z.infer<typeof accountChangeRefusalSchema>;

/** Why deleting one account was refused. */
export const ACCOUNT_DELETE_REFUSAL_CODES = [
  "unknown_account",
  // An account under it, an entry or a draft on it, or a bank or card.
  "has_sub_accounts",
  "bank_or_card",
  "has_entries",
  "has_drafts",
] as const;
export const accountDeleteRefusalCodeSchema = z.enum(
  ACCOUNT_DELETE_REFUSAL_CODES,
);
export type AccountDeleteRefusalCode = z.infer<
  typeof accountDeleteRefusalCodeSchema
>;

export const accountDeleteRefusalSchema = z.object({
  error: z.string(),
  code: accountDeleteRefusalCodeSchema,
});
export type AccountDeleteRefusal = z.infer<typeof accountDeleteRefusalSchema>;

/**
 * One row of an account's running balance, as its balance checks add it up:
 * a posted entry, another statement's draft categorized to the account
 * ("other draft"), or one of its own drafts.
 */
export const accountActivityRowSchema = z.object({
  date: z.string(),
  kind: z.enum(["entry", "other draft", "draft"]),
  // The entry's or the draft's id.
  id: z.number().int(),
  journal_id: z.number().int().nullable(),
  // Whose statement an "other draft" came from.
  other_account_id: z.number().int().nullable(),
  // What the row adds to the account's balance.
  amount: z.number(),
  // The statement's balance the row carries.
  statement_balance: z.number().nullable(),
  // The running balance after the row.
  running: z.number(),
  // Running balance minus the statement's.
  diff: z.number().nullable(),
  source_narration: z.string().nullable(),
  comment: z.string().nullable(),
  source_transaction_key: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AccountActivityRow = z.infer<typeof accountActivityRowSchema>;

const dayQuery = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const accountsContract = c.router({
  accountActivity: c.query({
    method: "GET",
    path: "/accounts/:id/activity",
    summary:
      "An account's running balance, a row per entry and draft in the order its balance checks add them up, with each statement balance and the difference: for finding why a check fails. `from` and `to` (YYYY-MM-DD) narrow the rows, not the running total. `posted_only=true` counts posted entries alone, as the books' checks do (Reconciliation Differences); without it, drafts count as Review's checks count them",
    pathParams: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({
      from: dayQuery,
      to: dayQuery,
      posted_only: z.enum(["true", "false"]).optional(),
    }),
    responses: {
      200: z.object({ rows: z.array(accountActivityRowSchema) }),
      403: errorBodySchema,
      404: errorBodySchema,
    },
  }),
  changeAccount: c.mutation({
    method: "PUT",
    path: "/accounts/:id",
    summary:
      "Rename, retype or move one account; a type change moves its whole branch, in one transaction",
    pathParams: z.object({ id: z.coerce.number().int().positive() }),
    body: accountChangeSchema,
    responses: {
      200: z.object({
        account: chartAccountFieldsSchema,
        // How many sub-accounts changed type with it.
        moved: z.number().int(),
      }),
      403: errorBodySchema,
      422: accountChangeRefusalSchema,
    },
  }),
  deleteAccount: c.mutation({
    method: "DELETE",
    path: "/accounts/:id",
    summary: "Delete one empty account: no sub-accounts, entries or drafts",
    pathParams: z.object({ id: z.coerce.number().int().positive() }),
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      403: errorBodySchema,
      422: accountDeleteRefusalSchema,
    },
  }),
});
