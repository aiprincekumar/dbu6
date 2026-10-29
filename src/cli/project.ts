/**
 * The project folder a command works on, and its environment file. Every
 * command resolves both the same way before it does anything else.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  databaseFile,
  packageDir,
  setCommandProjectRoot,
} from "../server/paths.js";

/**
 * `DBU6_ROOT` when it is set, otherwise the nearest directory at or above the
 * working directory with a package.json, otherwise the working directory. When
 * the working directory is in a project, a `DBU6_ROOT` naming any other folder
 * is refused rather than followed: it is most likely inherited from another
 * project's dbu6, and following it would work on that project's books.
 *
 * The root is kept in the process (`setCommandProjectRoot`), never exported,
 * so no child inherits it. A child that is dbu6 resolves it again from its
 * working directory.
 */
export function resolveProjectRoot(cwd = process.cwd()): string {
  const here = nearestPackageJsonDir(cwd);
  const named = process.env.DBU6_ROOT
    ? resolve(cwd, process.env.DBU6_ROOT)
    : null;
  if (named !== null && here !== null && named !== here) {
    throw new Error(
      `DBU6_ROOT names ${named}, but the working directory is in the project ${here}. ` +
        "Unset DBU6_ROOT, which another project's dbu6 may have left in this shell, " +
        `or run this from ${named}.`,
    );
  }
  const root = named ?? here ?? cwd;
  setCommandProjectRoot(root);
  return root;
}

function nearestPackageJsonDir(start: string): string | null {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * What `dbu6 dev` finds in `root`. It sets up only an `"empty"` folder, one
 * holding nothing but hidden files such as .DS_Store or .git. Anywhere else it
 * creates and overwrites nothing, so a folder with files but no database is
 * refused instead of being made into a project.
 */
export function devFolder(root: string): "empty" | "project" {
  if (readdirSync(root).every((name) => name.startsWith("."))) return "empty";
  const database = databaseFile(root);
  if (!existsSync(database)) {
    throw new Error(
      `${root} has files in it but no database at ${database}, so \`dbu6 dev\` creates nothing here. Run it in a project folder, or in an empty folder to start a project there.`,
    );
  }
  return "project";
}

/** Whether this dbu6 is its repository, with src/, rather than an install. */
export function runsFromSource(): boolean {
  return existsSync(packageDir("src", "server"));
}

/**
 * The project's environment file. It has Sapporta's name for it, so the
 * `sapporta` command finds the project's port there however it was installed.
 */
export function envFile(root: string): string {
  return join(root, ".env.development");
}

/**
 * Why the project cannot be used as it is, or null. A project made before the
 * file was renamed has only `.env`, and it may set `SAPPORTA_DATA_DIR`: a
 * command that ignored it would open, or create, a database in the wrong
 * place. So every command with a project stops first, and nothing moves the
 * file but its owner.
 *
 * Transitional: remove once the known projects have moved.
 */
export function formerEnvFileProblem(root: string): string | null {
  if (!existsSync(join(root, ".env")) || existsSync(envFile(root))) {
    return null;
  }
  return `${join(root, ".env")} is no longer read; rename it to .env.development.`;
}

/**
 * Loads the environment file when there is one. A value already in the
 * environment wins, so a shell export, mise or a container overrides the file
 * without editing it, and a deployment that sets everything needs no file.
 */
export function loadProjectEnv(root: string): void {
  const file = envFile(root);
  if (existsSync(file)) process.loadEnvFile(file);
}
