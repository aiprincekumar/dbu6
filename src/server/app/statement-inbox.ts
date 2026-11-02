import { mkdir, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { TsRestApi, type SapportaEnv } from "@sapporta/server";
import {
  statementInboxContract,
  type StatementInboxBatch,
} from "../../shared/index.js";
import { projectRoot, statementInboxDir } from "../paths.js";
import {
  batchFileName,
  batchName,
  filesFromField,
  readBatchFileName,
  type ProjectFile,
} from "./upload-tmp.js";
import { requireOwner } from "./workflow-auth.js";

/*
 * The statement inbox: the user drops every statement they have, the app
 * saves them as one batch under tmp/statement-inbox/<batch>/, and hands their
 * coding agent a prompt that names the inbox. Nothing here reads a statement
 * or touches the books. The agent's run sends inbox files to the imports by
 * their `saved_path` (`inbox_files`); an import that adds a file to the
 * drafts removes it, and a batch with none left goes with it, so no copy of
 * the statements lingers. The owner's only, like every upload.
 */

const api = new TsRestApi<SapportaEnv>();

api.register(
  "listStatementInbox",
  statementInboxContract.listStatementInbox,
  async ({ c }) => {
    requireOwner(c);
    return { status: 200, body: { batches: await listInbox() } };
  },
);

api.register(
  "saveToStatementInbox",
  statementInboxContract.saveToStatementInbox,
  async ({ c, files }) => {
    requireOwner(c);
    const statements = filesFromField(files, "files");
    if (statements.length === 0) {
      return {
        status: 400,
        body: { error: "Send at least one statement as `files`." },
      };
    }
    return { status: 200, body: await saveToInbox(statements) };
  },
);

api.register(
  "removeFromStatementInbox",
  statementInboxContract.removeFromStatementInbox,
  async ({ c, request }) => {
    requireOwner(c);
    const { saved_path } = request.body;
    const file = await inboxFile(saved_path);
    if (file === null) {
      return {
        status: 404,
        body: { error: `${saved_path} isn't a file in the statement inbox` },
      };
    }
    await useUpInboxFiles([file]);
    return { status: 200, body: { removed: saved_path } };
  },
);

export default api;

/** Saves the files as one new batch, in the order they came. */
export async function saveToInbox(
  files: readonly File[],
): Promise<StatementInboxBatch> {
  const batch = batchName();
  const dir = join(statementInboxDir(), batch);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const saved = await Promise.all(
    files.map(async (file, index) => {
      const path = join(dir, batchFileName(file, index));
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(path, bytes, { mode: 0o600 });
      return {
        file_name: file.name,
        saved_path: relative(projectRoot(), path),
        bytes: bytes.length,
      };
    }),
  );
  return { batch, files: saved };
}

/** Every batch waiting, oldest first; an empty inbox has none. */
export async function listInbox(): Promise<StatementInboxBatch[]> {
  const batches = await entries(statementInboxDir());
  const listed = await Promise.all(
    batches.map(async (batch) => {
      const dir = join(statementInboxDir(), batch);
      if (!(await stat(dir)).isDirectory()) return null;
      const names = await entries(dir);
      const files = await Promise.all(
        names.map(async (saved) => {
          const { index, name } = readBatchFileName(saved);
          return {
            file_name: name,
            saved_path: relative(projectRoot(), join(dir, saved)),
            bytes: (await stat(join(dir, saved))).size,
            index,
          };
        }),
      );
      files.sort((left, right) => left.index - right.index);
      return {
        batch,
        files: files.map(({ index: _index, ...file }) => file),
      };
    }),
  );
  return listed.filter((batch) => batch !== null);
}

/**
 * The inbox files a request names in its `inbox_files` field (repeated, each
 * a `saved_path` as the listing gives it), staged where they are; or, in the
 * user's words, why the first one that isn't a file in the inbox is refused.
 */
export async function inboxFilesFromField(
  body: unknown,
): Promise<{ files: ProjectFile[] } | { notInInbox: string }> {
  const raw =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>).inbox_files
      : undefined;
  const named = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
    .filter((value): value is string => typeof value === "string")
    .filter((value) => value !== "");
  const files: ProjectFile[] = [];
  for (const savedPath of named) {
    const file = await inboxFile(savedPath);
    if (file === null) {
      return {
        notInInbox: `${savedPath} isn't a file in the statement inbox: GET /api/statement-inbox lists them.`,
      };
    }
    files.push(file);
  }
  return { files };
}

/** Removes inbox files whose work is done, and each batch left empty. */
export async function useUpInboxFiles(
  files: readonly ProjectFile[],
): Promise<void> {
  for (const file of files) await rm(file.path, { force: true });
  for (const dir of new Set(files.map((file) => dirname(file.path)))) {
    // Only an empty folder goes; one with files left keeps them.
    await rmdir(dir).catch(() => {});
  }
}

// A `saved_path` that is a file in a batch of the inbox, or null.
async function inboxFile(savedPath: string): Promise<ProjectFile | null> {
  const path = resolve(projectRoot(), savedPath);
  const batchDir = dirname(path);
  if (dirname(batchDir) !== statementInboxDir()) return null;
  const isFile = await stat(path)
    .then((found) => found.isFile())
    .catch(() => false);
  if (!isFile) return null;
  return { name: readBatchFileName(basename(path)).name, path };
}

// A folder's entries by name, sorted; a missing folder has none. Batch names
// start with their time, so sorting puts the oldest first.
async function entries(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
