// The tasks /import hands the user's coding agent when the importer can't go
// further on its own: the outcome, the case's facts as the server sent them,
// the playbook that holds the method, and only what the guides don't say. How to reach the app, upload a file,
// change the import presets and ask before changing the books are in
// `npx dbu6 docs books`; how to write or fix a parser, and where it goes, in
// the parser guides.
//
// The app stages every upload it could not import under the project's own
// tmp/, so a prompt names each file by that path and the agent reads it, and
// may upload it again, without asking the user to find it.

import {
  guideCommand,
  type AutoImportPlanFile,
  type PlaybookName,
} from "../../../shared/index";
import {
  agentPrompt,
  PII_RULE,
  type AgentPrompt,
  type ReportSection,
} from "../../agent-prompt-rules";
import {
  NEW_PARSER_REPORT,
  PARTED_PARSERS_REPORT,
  PRESETS_SECTION,
  triedParsers,
} from "../../parser-prompts";
import type { AccountRefusal, RefusalOf } from "./outcome";

type PlanFile<Status extends AutoImportPlanFile["status"]> = Extract<
  AutoImportPlanFile,
  { status: Status }
>;

const BOOKS_GUIDE = guideCommand("books");

const REIMPORT = `Once it's fixed you may import the files again yourself ("Uploads" under
"Reaching the app" in \`${BOOKS_GUIDE}\`).`;

const PRESETS_REPORT: ReportSection = {
  heading: "Import presets",
  says: "what changed in them.",
};
const REDROP_REPORT: ReportSection = {
  heading: "Next",
  says: "press Try again beside the file at /import.",
};
const REIMPORT_REPORT: ReportSection = {
  heading: "Next",
  says: "the files imported again, with what that added to Review, or that I should drop them again.",
};
const PARSER_CHANGE = (says: string): ReportSection => ({
  heading: "The fix",
  says,
});

// Where the agent will find an upload: the staged copy inside this
// project, or the name the user dropped when the app kept none.
function stagedAt(file: {
  file_name: string;
  saved_path: string | null;
}): string {
  return file.saved_path ?? file.file_name;
}

function said(message: string): string {
  return `Server message: "${message}"`;
}

function list(items: readonly string[]): string {
  return items.join(", ");
}

export function unrecognizedPrompt(
  file: PlanFile<"unrecognized">,
): AgentPrompt {
  return agentPrompt({
    outcome: `Import ${file.file_name}, a statement format no saved parser recognises, by writing a parser for it.`,
    facts: `File: ${stagedAt(file)}
${triedParsers(file.candidate_parser_paths)}`,
    playbook: "unrecognized-statement",
    how: "It's for an account already in my books, which I import at /import.",
    report: [NEW_PARSER_REPORT, PRESETS_REPORT, REDROP_REPORT],
  });
}

export function ambiguousPrompt(file: PlanFile<"ambiguous">): AgentPrompt {
  return agentPrompt({
    outcome: `Import ${file.file_name}, which more than one saved parser recognises, by making only one of them read it.`,
    facts: `File: ${stagedAt(file)}
Parsers that read it: ${list(file.matching_parser_paths)}`,
    playbook: "ambiguous-parsers",
    report: [
      PARTED_PARSERS_REPORT,
      PARSER_CHANGE("what changed in each parser."),
      REDROP_REPORT,
    ],
  });
}

// What the importer knew of a file it couldn't tie to an account.
function unresolvedFacts(file: PlanFile<"unresolved">): string {
  const identifier = file.account?.identifier ?? "none emitted";
  return `File: ${stagedAt(file)}
Parser: ${file.parser_path}
Account identifier on the statement: ${identifier}`;
}

// The account a statement goes to isn't set up: no institution lists its
// parser, or the one that does has no accounts.
export function noAccountPrompt(file: PlanFile<"unresolved">): AgentPrompt {
  const institution = file.institution_name;
  const presets =
    institution === null
      ? `no institution lists ${file.parser_path}`
      : `"${institution}" lists ${file.parser_path} but has no accounts`;
  const add =
    institution === null
      ? `add_parser to the institution that covers this bank, or add_institution
with parsers ["${file.parser_path}"]; then add_account to it`
      : `add_account to "${institution}"`;
  const identifiers =
    file.account === null
      ? "leave account_identifiers empty unless the statement prints one the parser should emit"
      : `with account_identifiers ["${file.account.identifier}"]`;
  return agentPrompt({
    outcome: `Import ${file.file_name} by setting up the account it's for in the import presets.`,
    facts: `${unresolvedFacts(file)}
Import presets: ${presets}`,
    playbook: "unresolved-account",
    how: `In the import presets (${PRESETS_SECTION}): ${add}, ${identifiers}.
${REIMPORT}`,
    report: [
      { heading: "Account", says: "the account the statement now goes to." },
      PRESETS_REPORT,
      REIMPORT_REPORT,
    ],
  });
}

export function identifierRequiredPrompt(
  file: PlanFile<"unresolved">,
): AgentPrompt {
  const institution = file.institution_name;
  return agentPrompt({
    outcome: `Import ${file.file_name} by making ${file.parser_path} emit the account number it prints, so it goes to one of "${institution}"'s accounts.`,
    facts: `${unresolvedFacts(file)}
Accounts of "${institution}": ${list(file.candidate_account_names)}
${said(file.message)}`,
    playbook: "identifier-required",
    report: [
      {
        heading: "Account number",
        says: "the number the statement prints, and the account it goes to.",
      },
      PARSER_CHANGE("what changed in the parser."),
      REDROP_REPORT,
    ],
  });
}

export function identifierMismatchPrompt(
  file: PlanFile<"unresolved">,
): AgentPrompt {
  const identifier = file.account?.identifier ?? "(ask me)";
  const institution = file.institution_name;
  return agentPrompt({
    outcome: `Import ${file.file_name}, a statement for ${identifier}, by tying it to one of "${institution}"'s accounts in the import presets.`,
    facts: `${unresolvedFacts(file)}
Accounts of "${institution}": ${list(file.candidate_account_names)}
${said(file.message)}`,
    playbook: "identifier-mismatch",
    report: [
      { heading: "Account", says: "the account the statement now goes to." },
      PRESETS_REPORT,
      REDROP_REPORT,
    ],
  });
}

// Where the failed account's uploads are, in the order the account holds
// them: the staged copies inside this project.
function groupPaths(refusal: AccountRefusal): string[] {
  return refusal.failed_group.file_names.map(
    (name) =>
      refusal.files.find((file) => file.file_name === name)?.saved_path ?? name,
  );
}

// The saved parsers that read the failed account's files.
function groupParsers(refusal: AccountRefusal): string[] {
  const names = refusal.failed_group.file_names;
  return Array.from(
    new Set(
      refusal.files.flatMap((file) =>
        file.status === "resolved" && names.includes(file.file_name)
          ? [file.parser_path]
          : [],
      ),
    ),
  );
}

interface RefusalTask {
  /** Why the importer refused, finishing "…, which the importer refused because". */
  because: string;
  /**
   * The refusal's own figures, as labelled lines. Without them the
   * server's message stands in; with them it would only repeat them.
   */
  facts?: string;
  /** The method; `how` adds only what this case needs beyond it. */
  playbook?: PlaybookName;
  how?: string;
  report: readonly ReportSection[];
}

// Every refusal is one account's statements turned away: the outcome is to
// import them, and the facts open with the account, its files, parser and
// the error code.
function refusalPrompt(
  refusal: AccountRefusal,
  task: RefusalTask,
): AgentPrompt {
  const group = refusal.failed_group;
  const parsers = groupParsers(refusal);
  const facts = [
    `Account: ${group.account_name} (${group.base_account})`,
    `Files: ${list(groupPaths(refusal))}`,
    ...(parsers.length > 0 ? [`Parser: ${list(parsers)}`] : []),
    `Error: ${refusal.error}`,
    task.facts ?? said(refusal.message),
  ].join("\n");
  return agentPrompt({
    outcome: `Import ${list(group.file_names)} into ${group.account_name}, which the importer refused because ${task.because}.`,
    facts,
    playbook: task.playbook,
    how: task.how === undefined ? REIMPORT : `${task.how}\n${REIMPORT}`,
    report: task.report,
  });
}

export function balanceMismatchPrompt(
  refusal: RefusalOf<"balance_mismatch" | "segment_balance_mismatch">,
): AgentPrompt {
  const figures =
    refusal.error === "balance_mismatch"
      ? `Rows add up to: ${refusal.computed_final}
Statement closing: ${refusal.statement_closing}
Difference: ${refusal.difference}`
      : `Printed on ${refusal.from_date}: ${refusal.from_balance}
Rows lead on ${refusal.to_date} to: ${refusal.walked}
Printed on ${refusal.to_date}: ${refusal.printed}
Difference: ${refusal.difference}`;
  const hint =
    refusal.error === "balance_mismatch" && refusal.hint !== undefined
      ? `\nServer hint: "${refusal.hint}"`
      : "";
  return refusalPrompt(refusal, {
    because: "the statement's rows don't add up to its balances",
    facts: figures + hint,
    playbook: "balance-mismatch",
    report: [
      {
        heading: "What's wrong",
        says: "why the balances don't add up, in one sentence.",
      },
      PARSER_CHANGE(
        "what changed in the parser, or the dates of the missing statement.",
      ),
      REIMPORT_REPORT,
    ],
  });
}

export function boundaryGapPrompt(
  refusal: RefusalOf<"statement_boundary_mismatch">,
): AgentPrompt {
  return refusalPrompt(refusal, {
    because: "one statement doesn't start where the earlier one ends",
    facts: `${refusal.earlier_source} ends at: ${refusal.earlier_closing}
${refusal.later_source} starts at: ${refusal.later_opening}
Difference: ${refusal.difference}`,
    playbook: "boundary-gap",
    report: [
      {
        heading: "What's wrong",
        says: "why the two files don't meet: a missing statement, with the period to download, or a misread row.",
      },
      PARSER_CHANGE("what changed in the parser, if anything."),
      REIMPORT_REPORT,
    ],
  });
}

export function disagreementPrompt(
  refusal: RefusalOf<"statement_disagreement">,
): AgentPrompt {
  return refusalPrompt(refusal, {
    because: `two of them disagree on ${refusal.date}`,
    facts: `Parts: ${list(refusal.parts)}
First differing row: ${JSON.stringify(refusal.row)}`,
    playbook: "statement-disagreement",
    report: [
      {
        heading: "What's wrong",
        says: "which file is right, and why the other differs.",
      },
      PARSER_CHANGE("what changed in the parser, or which file to leave out."),
      REIMPORT_REPORT,
    ],
  });
}

export function partInvalidPrompt(
  refusal: RefusalOf<"statement_part_invalid">,
): AgentPrompt {
  return refusalPrompt(refusal, {
    because: `${refusal.part}'s own balances don't add up`,
    facts: `Part: ${refusal.part}
Detail: ${refusal.detail}`,
    playbook: "part-invalid",
    report: [
      {
        heading: "What's wrong",
        says: "whether the bank's export or the parser is wrong, and where.",
      },
      PARSER_CHANGE("what changed in the parser."),
      REIMPORT_REPORT,
    ],
  });
}

export function reconciliationPrompt(
  refusal: RefusalOf<"reconciliation_match_failed">,
): AgentPrompt {
  const date = refusal.checkpoint_date;
  return refusalPrompt(refusal, {
    because: "they don't continue from the last statement balance in my books",
    facts: `Last statement balance in the books: ${refusal.checkpoint_balance} on ${date}
${said(refusal.message)}`,
    playbook: "reconciliation",
    report: [
      {
        heading: "What's wrong",
        says: "where my books and the statement part, and why.",
      },
      {
        heading: "The fix",
        says: "each change to my books, or the statement period to download.",
      },
      { heading: "Next", says: "ask whether to apply it." },
    ],
  });
}

export function missingAccountPrompt(
  refusal: RefusalOf<"import_account_not_found">,
): AgentPrompt {
  const { account_id } = refusal.failed_group;
  return refusalPrompt(refusal, {
    because: "its import preset names a deleted ledger account",
    facts: `Deleted ledger account id: ${account_id}`,
    playbook: "missing-ledger-account",
    report: [
      { heading: "Account", says: "the ledger account it now imports into." },
      PRESETS_REPORT,
      REIMPORT_REPORT,
    ],
  });
}

export function closingBalancePrompt(
  refusal: RefusalOf<"closing_balance_unavailable">,
): AgentPrompt {
  return refusalPrompt(refusal, {
    because: "the parser reads no closing balance from this card statement",
    playbook: "closing-balance",
    report: [
      {
        heading: "Closing balance",
        says: "the one the statement prints, or what it prints instead.",
      },
      PARSER_CHANGE("what changed in the parser."),
      REIMPORT_REPORT,
    ],
  });
}

// For a code without a prompt of its own: the whole reply goes to the agent.
export function genericFailurePrompt(refusal: AccountRefusal): AgentPrompt {
  return refusalPrompt(refusal, {
    because: `of ${refusal.error}`,
    facts: `Full reply:\n${JSON.stringify(refusal, null, 2)}`,
    how: `Start from the error and the files it names. ${PII_RULE}`,
    report: [
      { heading: "What's wrong", says: "in one sentence." },
      PARSER_CHANGE("what changed."),
      REIMPORT_REPORT,
    ],
  });
}
