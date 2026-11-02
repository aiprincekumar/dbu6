import type { AddFirst, PostingCheck } from "../../shared/index";
import { agree, plural } from "../format";

/*
 * What a posting check says, in the words every screen shares (PLAN.md §11
 * P1, P3): Overview's rows, the Duplicates and Balance checks tabs, the
 * button's waiting reason, Update's card and the agent prompts. A screen that
 * frames a check its own way keeps its sentence: Update's "possible duplicate
 * entries", the picker's "12 need an account", the button's "12 still need an
 * account".
 */

/** "12 transactions need an account" */
export function uncategorisedText(count: number): string {
  return `${plural(count, "transaction")} ${agree(count, "needs", "need")} an account`;
}

/** "2 possible duplicates" */
export function duplicatesText(count: number): string {
  return plural(count, "possible duplicate");
}

/** "3 balance checks fail" */
export function failingChecksText(count: number): string {
  return `${plural(count, "balance check")} ${agree(count, "fails", "fail")}`;
}

/** "Add HDFC Savings first", for balance checks that count its drafts. */
export function addFirstText(addFirst: AddFirst): string {
  return `Add ${accountsText(addFirst)} first`;
}

/** "HDFC Savings", "HDFC Savings and ICICI Card". */
export function accountsText(accounts: AddFirst): string {
  const names = accounts.map((account) => account.name);
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A check in one line, whether it passes, blocks, or has nothing to check. */
export function checkText(check: PostingCheck): string {
  switch (check.kind) {
    case "categorization":
      if (check.state === "blocks") return uncategorisedText(check.count);
      return check.drafts === 1
        ? "The transaction goes to an account"
        : `All ${check.drafts} transactions go to an account`;
    case "duplicates":
      return check.state === "blocks"
        ? duplicatesText(check.count)
        : "No possible duplicates";
    case "balance-checks":
      switch (check.state) {
        case "none":
          return "These drafts have no balance checks";
        case "passes":
          return "Your books agree with the bank";
        case "blocks":
          return check.severity === "attention"
            ? addFirstText(check.add_first)
            : failingChecksText(check.count);
      }
  }
}
