import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inboxFilesFromField,
  listInbox,
  saveToInbox,
  useUpInboxFiles,
} from "./statement-inbox.js";

// A scratch project root, so nothing lands in the real one.
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dbu6-statement-inbox-"));
  vi.stubEnv("DBU6_ROOT", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("the statement inbox", () => {
  it("saves a drop as one batch inside the project, names and sizes kept", async () => {
    const saved = await saveToInbox([
      new File(["first"], "sample-statement.csv"),
      new File(["second!"], "sample-statement.csv"),
    ]);

    expect(saved.batch).toMatch(/^[0-9A-Za-z-]+$/);
    expect(saved.files).toEqual([
      {
        file_name: "sample-statement.csv",
        saved_path: `tmp/statement-inbox/${saved.batch}/0-sample-statement.csv`,
        bytes: 5,
      },
      {
        file_name: "sample-statement.csv",
        saved_path: `tmp/statement-inbox/${saved.batch}/1-sample-statement.csv`,
        bytes: 7,
      },
    ]);
    expect(await readFile(join(root, saved.files[1].saved_path), "utf8")).toBe(
      "second!",
    );
  });

  it("lists what waits as it was saved, and nothing for an empty inbox", async () => {
    expect(await listInbox()).toEqual([]);
    const saved = await saveToInbox([
      new File(["a"], "b.pdf"),
      new File(["bb"], "a.pdf"),
    ]);

    expect(await listInbox()).toEqual([saved]);
  });

  it("takes inbox files by their saved path, and nothing outside the inbox", async () => {
    const saved = await saveToInbox([new File(["a"], "sample.pdf")]);
    const [file] = saved.files;

    expect(await inboxFilesFromField({ inbox_files: file.saved_path })).toEqual(
      {
        files: [{ name: "sample.pdf", path: join(root, file.saved_path) }],
      },
    );
    for (const outside of [
      "package.json",
      "tmp/statement-inbox/../../package.json",
      `tmp/statement-inbox/${saved.batch}`,
      `tmp/statement-inbox/${saved.batch}/9-missing.pdf`,
    ]) {
      expect(await inboxFilesFromField({ inbox_files: [outside] })).toEqual({
        notInInbox: `${outside} isn't a file in the statement inbox: GET /api/statement-inbox lists them.`,
      });
    }
    expect(await inboxFilesFromField({})).toEqual({ files: [] });
  });

  it("removes used files, and a batch once none are left", async () => {
    const saved = await saveToInbox([
      new File(["a"], "first.pdf"),
      new File(["b"], "second.pdf"),
    ]);
    const field = await inboxFilesFromField({
      inbox_files: saved.files.map((file) => file.saved_path),
    });
    if (!("files" in field)) throw new Error("expected inbox files");
    const [first, second] = field.files;

    await useUpInboxFiles([first]);
    expect(await listInbox()).toEqual([
      { batch: saved.batch, files: [saved.files[1]] },
    ]);

    await useUpInboxFiles([second]);
    expect(await exists(join(root, "tmp/statement-inbox", saved.batch))).toBe(
      false,
    );
    expect(await listInbox()).toEqual([]);
  });
});
