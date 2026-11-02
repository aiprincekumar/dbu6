// The reconciliation module: matching statement rows against stored drafts
// and journals, the draft balance-check rule and the running balance behind
// it, the balance checks the posted books miss, the opening balance each
// account's first check implies, and the filter that keeps only what is new
// since the last checkpoint.
// Import from here rather than from the files.
export {
  assertionFailsSql,
  dayClosings,
  draftOrderBy,
  draftOrderSql,
} from "./balance-check.js";
export {
  duplicateDraftRowsSql,
  duplicateJournalEntryRowsSql,
  findDuplicateDiagnostics,
  isTransferPair,
  TRANSFER_MATCH_DAYS,
  type DuplicateDiagnostic,
  type DuplicateDraftSourceRow,
  type DuplicateJournalEntrySourceRow,
  type TransferSide,
} from "./duplicate-diagnostics.js";
export { AmbiguousDuplicateError, findDuplicate } from "./duplicate-store.js";
export {
  baseAccountRunningBalanceCtes,
  countPostedAssertionFailures,
  failingDraftAssertionsSelect,
  loadImpliedOpenings,
  otherStatementDraftSql,
  postedAssertionFailuresCtes,
} from "./running-balance.js";
export {
  newTransactionsSinceReconciliation,
  ReconciliationMatchError,
} from "./since-checkpoint.js";
