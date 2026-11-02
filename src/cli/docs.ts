/**
 * `npx dbu6 docs [name]`: the guides dbu6 ships for coding agents (`GUIDES`);
 * `npx dbu6 docs playbook [name]`: the playbooks (`PLAYBOOKS`).
 */
import { readFileSync } from "node:fs";
import {
  GUIDES,
  PLAYBOOKS,
  playbookFile,
  type GuideName,
  type PlaybookName,
} from "../shared/guides.js";
import { packageDir } from "../server/paths.js";

export function printDocs(args: readonly string[]): number {
  const [name, playbook] = args;
  if (name === "playbook") return printPlaybook(playbook);
  if (name === undefined) {
    console.log("Guides (npx dbu6 docs <name>):\n");
    const width = Math.max(...Object.keys(GUIDES).map((key) => key.length));
    for (const [key, guide] of Object.entries(GUIDES)) {
      console.log(`  ${key.padEnd(width)}  ${guide.title}`);
    }
    console.log(
      "\nPlaybooks, one problem each: npx dbu6 docs playbook lists them.",
    );
    return 0;
  }
  if (!Object.hasOwn(GUIDES, name)) {
    console.error(
      `There is no guide named ${name}. The guides are: ${Object.keys(GUIDES).join(", ")}.`,
    );
    return 1;
  }
  const guide: { file: string; examples?: readonly string[] } =
    GUIDES[name as GuideName];
  process.stdout.write(readFileSync(packageDir(guide.file), "utf8"));
  // The worked example's files, printed from where they are typechecked.
  for (const example of guide.examples ?? []) {
    const fence = "```";
    process.stdout.write(
      `\n### ${example}\n\n${fence}${example.endsWith("x") ? "tsx" : "ts"}\n` +
        `${readFileSync(packageDir(example), "utf8")}${fence}\n`,
    );
  }
  return 0;
}

function printPlaybook(name: string | undefined): number {
  if (name === undefined) {
    console.log("Playbooks (npx dbu6 docs playbook <name>):\n");
    const width = Math.max(...PLAYBOOKS.map((key) => key.length));
    for (const key of PLAYBOOKS) {
      // A playbook's title is its file's first line, a heading.
      const [heading] = readPlaybook(key).split("\n", 1);
      console.log(`  ${key.padEnd(width)}  ${heading.replace(/^#\s*/, "")}`);
    }
    return 0;
  }
  if (!(PLAYBOOKS as readonly string[]).includes(name)) {
    console.error(
      `There is no playbook named ${name}. The playbooks are: ${PLAYBOOKS.join(", ")}.`,
    );
    return 1;
  }
  process.stdout.write(readPlaybook(name as PlaybookName));
  return 0;
}

function readPlaybook(name: PlaybookName): string {
  return readFileSync(packageDir(playbookFile(name)), "utf8");
}
