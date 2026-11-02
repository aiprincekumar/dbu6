import { TsRestApi, type SapportaEnv } from "@sapporta/server";
import { draftTransactionsContract } from "../../shared/index.js";
import {
  setDraftsAccount,
  settleTransfer,
} from "../workflows/reclassification.js";
import { requireWorkflowLedger } from "./workflow-auth.js";

// Choosing an account by hand for many drafts at once, from Review's Improve
// categorization tab, and settling a transfer both statements carry.
const api = new TsRestApi<SapportaEnv>();

api.register(
  "setDraftsAccount",
  draftTransactionsContract.setDraftsAccount,
  async ({ c, request }) => {
    const { ids, account_id } = request.body;
    const outcome = setDraftsAccount(requireWorkflowLedger(c), ids, account_id);
    switch (outcome.kind) {
      case "set":
        return { status: 200, body: { updated: outcome.updated } };
      case "account-not-found":
        return { status: 404, body: { error: "Account not found" } };
      case "drafts-not-found":
        return {
          status: 404,
          body: { error: `Drafts not found: ${outcome.ids.join(", ")}` },
        };
      case "own-account":
        return {
          status: 422,
          body: {
            error: "A draft can't go to the account its statement belongs to",
          },
        };
    }
  },
);

api.register(
  "settleTransfer",
  draftTransactionsContract.settleTransfer,
  async ({ c, request }) => {
    const outcome = settleTransfer(
      requireWorkflowLedger(c),
      request.body.draft_ids,
    );
    switch (outcome.kind) {
      case "settled":
        return {
          status: 200,
          body: {
            kept_draft_id: outcome.keptDraftId,
            deleted_draft_id: outcome.deletedDraftId,
            cleared_balances: outcome.clearedBalances,
          },
        };
      case "drafts-not-found":
        return {
          status: 404,
          body: { error: `Drafts not found: ${outcome.ids.join(", ")}` },
        };
      case "not-a-transfer":
        return {
          status: 422,
          body: {
            error:
              "These two drafts aren't one transfer on two statements: one must be from another account's statement, sent to this one, for the same amount the other way, a few days apart at most",
          },
        };
    }
  },
);

export default api;
