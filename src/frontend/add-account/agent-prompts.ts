import { agentPrompt, type AgentPrompt } from "../agent-prompt-rules";
import { triedParsers } from "../parser-prompts";
import type { Unreadable } from "./state";

/*
 * The Teach card's tasks, for a file no parser reads or several do. /add
 * sets the account up itself, at its Confirm card, once the parser reads
 * the files, so the agent lists the parser on the bank and never adds an
 * account. The read keeps a copy of each file inside the project for these.
 */

type UnreadableFile<Status extends Unreadable["status"]> = Extract<
  Unreadable,
  { status: Status }
>;

// What the user does once the agent is done, under its report's **Next**.
const REDROP_NEXT = "drop the files at /add again.";

export function addUnrecognizedPrompt(
  file: UnreadableFile<"unrecognized">,
): AgentPrompt {
  return agentPrompt({
    outcome: `Add a bank account or card from ${file.file_name}, a statement format no saved parser recognises, by writing a parser for it.`,
    facts: `File: ${file.saved_path}
${triedParsers(file.candidate_parser_paths)}`,
    playbook: "unrecognized-statement",
    how: `I'm adding this bank or card at /add, which sets the account up from the
statements: add no account to the import presets.`,
    next: REDROP_NEXT,
  });
}

export function addAmbiguousPrompt(
  file: UnreadableFile<"ambiguous">,
): AgentPrompt {
  return agentPrompt({
    outcome: `Add a bank account or card from ${file.file_name}, which more than one saved parser recognises, by making only one of them read it.`,
    facts: `File: ${file.saved_path}
Parsers that read it: ${file.matching_parser_paths.join(", ")}`,
    playbook: "ambiguous-parsers",
    next: REDROP_NEXT,
  });
}
