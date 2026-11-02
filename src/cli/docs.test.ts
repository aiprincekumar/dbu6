import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GUIDES,
  PLAYBOOKS,
  RUN_SECTIONS,
  playbookFile,
  type PlaybookName,
} from "../shared/guides.js";
import { packageDir } from "../server/paths.js";
import { printDocs } from "./docs.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the guides and playbooks ship as files", () => {
  it("has a file for every guide", () => {
    for (const guide of Object.values(GUIDES)) {
      expect(existsSync(packageDir(guide.file)), guide.file).toBe(true);
    }
  });

  it("has a heading in the run guide for every section a prompt starts at", () => {
    const headings = readFileSync(packageDir(GUIDES.run.file), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3));
    for (const section of RUN_SECTIONS) expect(headings).toContain(section);
  });

  it("has a file for every playbook, and a name for every file", () => {
    const files = readdirSync(packageDir("docs", "playbooks")).sort();
    const named = PLAYBOOKS.map((name) =>
      playbookFile(name).slice("docs/playbooks/".length),
    ).sort();
    expect(files).toEqual(named);
  });
});

describe("npx dbu6 docs playbook", () => {
  it("lists the playbooks with no name", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(printDocs(["playbook"])).toBe(0);
    const printed = log.mock.calls.map(([line]) => String(line)).join("\n");
    for (const name of PLAYBOOKS) expect(printed).toContain(name);
    expect(printed).toContain("Possible duplicates in Review");
  });

  it("prints one playbook", () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    expect(printDocs(["playbook", "duplicates"])).toBe(0);
    expect(String(write.mock.calls[0][0])).toMatch(/^# Possible duplicates/);
  });

  it("refuses a name it doesn't have", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(printDocs(["playbook", "nope"])).toBe(1);
    expect(String(error.mock.calls[0][0])).toContain("no playbook named nope");
  });
});
