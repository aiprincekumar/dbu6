import {
  TsRestApi,
  type SapportaEnv,
  type ServerInferResponses,
} from "@sapporta/server";
import {
  draftTransactionsContract,
  type ImportInstitution,
  type PostingBlock,
} from "../../shared/index.js";
import type { Ledger } from "../modules/ledger-sql/index.js";
import { loadImportPresets } from "../modules/import-presets/index.js";
import { accountNames } from "./account-names.js";
import { postDrafts } from "../workflows/posting.js";
import { writeCommentsSoon } from "../workflows/comment-writer.js";
import { requireWorkflowLedger } from "./workflow-auth.js";

const api = new TsRestApi<SapportaEnv>();

api.register(
  "postDraftsToJournal",
  draftTransactionsContract.postDraftsToJournal,
  async ({ c, request }) => {
    const ledger = requireWorkflowLedger(c);
    return postDraftsToJournal(
      ledger,
      request.body.base_account_id,
      loadImportPresets(ledger.db, ledger.auth),
    );
  },
);

export default api;

type PostingResponse = ServerInferResponses<
  typeof draftTransactionsContract.postDraftsToJournal,
  200 | 404 | 422
>;

/**
 * Posts one account's drafts, answered in the contract's terms, the accounts
 * named as the presets' `institutions` name them.
 */
export function postDraftsToJournal(
  ledger: Ledger,
  base_account_id: number,
  institutions: readonly ImportInstitution[],
): PostingResponse {
  const names = accountNames(ledger.sqlite, ledger.auth, institutions);
  const outcome = postDrafts(ledger, base_account_id, names);
  // Entries posted after the writer's last run get their comments now.
  if (outcome.kind === "posted") writeCommentsSoon();
  switch (outcome.kind) {
    case "account-not-found":
      return { status: 404, body: { error: "Base account not found" } };
    case "blocked":
      return refusal(outcome.block, outcome.baseAccountName);
    case "posted":
      return {
        status: 200,
        body: {
          base_account: outcome.baseAccountName,
          journals_created: outcome.journalsCreated,
          entries_created: outcome.entriesCreated,
          drafts_posted: outcome.draftsPosted,
        },
      };
  }
}

/** The 422 for the first block, in the codes and counts callers read. */
function refusal(block: PostingBlock, account: string): PostingResponse {
  switch (block.kind) {
    case "categorization":
      return {
        status: 422,
        body: {
          error: `${block.count} draft transaction(s) under ${account} have no account_id`,
          code: "UNCATEGORIZED_DRAFTS",
          uncategorized_count: block.count,
        },
      };
    case "duplicates":
      return {
        status: 422,
        body: {
          error: `${block.count} duplicate draft overlap(s) found under ${account}`,
          code: "DUPLICATE_DRAFTS",
          duplicate_count: block.count,
        },
      };
    case "balance-checks":
      if (block.severity === "attention") {
        const names = block.add_first.map((other) => other.name).join(", ");
        return {
          status: 422,
          body: {
            error: `${account}'s balance checks rely on drafts from ${names}. Add ${names} first.`,
            code: "ADD_OTHER_ACCOUNT_FIRST",
            add_first: block.add_first,
          },
        };
      }
      return {
        status: 422,
        body: {
          error: `${block.count} draft balance assertion(s) failing under ${account}`,
          code: "FAILING_ASSERTIONS",
          failing_count: block.count,
        },
      };
  }
}
