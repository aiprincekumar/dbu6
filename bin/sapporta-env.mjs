// The token the `sapporta` CLI needs to act for this project's coding agent,
// taken from the project folder rather than demanded of the person.
//
// dbu6 ships the CLI (its own `sapporta` bin forwards to `@sapporta/server`'s),
// so an agent in a project folder runs `npx sapporta …` with nothing to
// install. The CLI finds the app by itself: it reads `SAPPORTA_API_PORT` from
// the environment, else from the project's `.env.development`, the same way
// `dbu6` does, so every copy of it reaches the right port. A token it reads
// only from the environment, and dbu6 keeps the agent's in `.env.agent`, so the
// wrapper adds that one value and nothing else. Without the wrapper the CLI
// still reaches the app, and is told to set SAPPORTA_API_TOKEN.
//
// This file is plain JavaScript with no imports but Node's own, because
// `bin/sapporta.mjs` loads it before anything else: a project with an
// uncompiled dbu6 beside it must still get its token. Its types are in
// `sapporta-env.d.mts`. Its tests are `sapporta-env.test.mjs`, run by
// `pnpm run test:scripts`.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

/**
 * The agent's file, written by `dbu6 agent env` and by the app when it hands
 * a prompt to the coding agent (src/server/modules/coding-agent/agent-access.ts),
 * and gitignored. It is kept out of `.env.development`, which the server loads
 * into its own process. This file is its one definition, and the server and
 * `dbu6 check` import it from here.
 */
export const AGENT_ENV_FILE = ".env.agent";

/**
 * The token the project's `.env.agent` holds, or undefined when the file is
 * absent or its token is missing or blank. Nothing else is read from the file:
 * an older one also holds a `SAPPORTA_API_URL`, which would outrank the port
 * the app runs on now.
 */
export function readAgentToken(
  root,
  fileExists = existsSync,
  readFile = (path) => readFileSync(path, "utf8"),
) {
  const path = join(root, AGENT_ENV_FILE);
  if (!fileExists(path)) return undefined;
  return readString(parseEnv(readFile(path)).SAPPORTA_API_TOKEN);
}

const MAX_MARKER_WALK = 100;

/**
 * The project root: the nearest directory at or above `start` holding
 * `sapporta.json`, else the one holding `package.json`, else `start`.
 *
 * `sapporta.json` is Sapporta's marker and dbu6 writes it into every project;
 * the `package.json` step is what makes a project created before that marker,
 * or a dbu6 checkout used as one, still resolve.
 */
export function findProjectRoot(start, fileExists = existsSync) {
  return (
    findUp(start, "sapporta.json", fileExists) ??
    findUp(start, "package.json", fileExists) ??
    start
  );
}

function findUp(start, marker, fileExists) {
  let dir = start;
  for (let i = 0; i < MAX_MARKER_WALK; i++) {
    if (fileExists(join(dir, marker))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * The environment the `sapporta` CLI runs with: the shell's own, plus
 * `SAPPORTA_API_TOKEN` from `.env.agent` when the shell sets none. A token
 * already in the environment is the deliberate, per-invocation choice and
 * wins.
 */
export function sapportaEnvironment({
  root,
  shellEnv,
  fileExists = existsSync,
  readFile = (path) => readFileSync(path, "utf8"),
}) {
  const env = { ...shellEnv };
  if (readString(shellEnv.SAPPORTA_API_TOKEN) !== undefined) return env;
  const token = readAgentToken(root, fileExists, readFile);
  if (token !== undefined) env.SAPPORTA_API_TOKEN = token;
  return env;
}

function readString(value) {
  return value !== undefined && value.length > 0 ? value : undefined;
}
