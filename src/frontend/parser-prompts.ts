// The parts of a coding-agent prompt about parsers and the import presets,
// the same wherever the app asks for one: /import when it can't read a file,
// and /add's Teach card. Each screen writes its own task around them. How a
// parser is written, fixed or parted from another is in the playbooks
// (`unrecognized-statement`, `ambiguous-parsers`) and the parser guides; how
// the presets change is in the books guide.
import { guideCommand } from "../shared/index";
import type { ReportSection } from "./agent-prompt-rules";

/** Where a prompt sends the agent to change the import presets. */
export const PRESETS_SECTION = `"Import presets" in \`${guideCommand("books")}\``;

/** Which saved parsers turned a file down, as a fact line. */
export function triedParsers(candidateParserPaths: readonly string[]): string {
  return candidateParserPaths.length === 0
    ? "Parsers tried: none for this file type"
    : `Parsers that rejected it: ${candidateParserPaths.join(", ")}`;
}

/** What the agent reports once a parser reads the file. */
export const NEW_PARSER_REPORT: ReportSection = {
  heading: "The parser",
  says: "what the statement is, and what the parser reads from it: date range, row count, opening and closing balance.",
};

/** What the agent reports once only one parser reads the file. */
export const PARTED_PARSERS_REPORT: ReportSection = {
  heading: "Which parser reads it",
  says: "the parser that now reads the file, and what tells the two layouts apart.",
};
