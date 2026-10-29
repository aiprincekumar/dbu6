/**
 * The coding agent's access to the app: `.env.agent`, the file a project's
 * coding agents read their token from, and the one way a token gets into it.
 *
 * Two things write it. `dbu6 agent env` (src/cli/agent.ts) does, for whichever
 * account it is told to; and handing a prompt to the coding agent
 * (handoff.ts) does, for the signed-in owner, when the file holds no token the
 * app accepts, so a prompt's agent can reach the app without asking for one.
 * Both mint the token the way the app's token screen mints one, under one
 * name, so each revokes the tokens the other wrote before it.
 *
 * The file sits beside `.env.development`. The shipped `sapporta` bin reads
 * it and `dbu6 dev` does not, so the server's own process never holds the
 * token: writing the file, and asking whether the token in it still works, is
 * all the server does with it. It is gitignored.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import type { ProjectDbConnection } from "@sapporta/server";
import { todayIn } from "../../../shared/index.js";
import type { AppPrincipal } from "../../authz/types.js";
import {
  createAuthToken,
  isSampleAccount,
  listAuthTokens,
  revokeAuthToken,
  tokenIsLive,
} from "../../project-auth/index.js";

/** The file the agent reads its token from. */
export const AGENT_ENV_FILE = ".env.agent";

/** Where the token comes from, as the project explains it to a person. */
export const AGENT_TOKEN_NAME = "dbu6 agent env";

/** Who a token is minted for: a user, in one workspace. */
export type AgentTokenOwner = Extract<AppPrincipal, { kind: "user" }>;

/** A token minted for an agent, and what it is known by. */
export interface MintedAgentToken {
  /** The raw token, which the database never returns again. */
  apiToken: string;
  tokenId: string;
}

/**
 * The token the project's file holds, or undefined when the file is absent or
 * its token is missing or blank. An older file also holds a
 * `SAPPORTA_API_URL`, which is ignored.
 */
export function readAgentToken(root: string): string | undefined {
  const file = join(root, AGENT_ENV_FILE);
  if (!existsSync(file)) return undefined;
  const apiToken = parseEnv(readFileSync(file, "utf8")).SAPPORTA_API_TOKEN;
  if (apiToken === undefined || apiToken === "") return undefined;
  return apiToken;
}

/**
 * Mints a token for `owner`'s workspace, under the name dbu6 gives them.
 *
 * Never for the sample account dbu6-seed-sample-data makes: it is a real
 * account with real tokens, but the next seed replaces its books, so an agent
 * must not be handed one.
 */
export function mintAgentToken(
  conn: ProjectDbConnection,
  owner: AgentTokenOwner,
): MintedAgentToken {
  if (isSampleAccount(owner.user)) {
    throw new Error(
      `${owner.user.email} is the sample account dbu6-seed-sample-data makes, whose books the next run replaces. Sign up in the app and use that account.`,
    );
  }
  const created = createAuthToken(conn, owner, {
    name: `${AGENT_TOKEN_NAME} (${todayIn(owner.membership.workspace.timeZone)})`,
  });
  return { apiToken: created.rawToken, tokenId: created.token.id };
}

/**
 * Mints a token for `owner`, writes it to the project's `.env.agent`, and
 * then revokes the agent tokens dbu6 minted for them before, now that the new
 * one is on disk. Only those, by name: a token a person made in the app, or
 * one another tool made, is not dbu6's to revoke.
 *
 * The file is a dotenv file like `.env.development`, and its first lines say
 * where it came from so a person who finds it can tell whether to keep it. It
 * holds no URL: the `sapporta` command finds the app's port by itself, and a
 * URL here would go stale when the port moves.
 */
export function writeAgentToken(
  conn: ProjectDbConnection,
  owner: AgentTokenOwner,
  root: string,
): MintedAgentToken & { revoked: number } {
  const minted = mintAgentToken(conn, owner);
  const file = join(root, AGENT_ENV_FILE);
  writeFileSync(
    file,
    [
      "# Agent access for coding agents (dbu6). Written by `dbu6 agent env`,",
      "# which the project's AGENTS.md tells an agent to run, or by the app when",
      "# it hands a prompt to a coding agent. Gitignored: this file is a",
      "# credential. The token is for the `sapporta` command, which reads it",
      "# from here, and for `curl`.",
      `# Workspace owner: ${owner.user.email}`,
      "",
      `SAPPORTA_API_TOKEN=${minted.apiToken}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  // `mode` applies only when the file is created, so an existing one — a
  // restored backup, or one dbu6 did not write — keeps whatever mode it had.
  // It holds a credential either way.
  chmodSync(file, 0o600);

  const userId = owner.user.id;
  const workspaceId = owner.membership.workspace.id;
  let revoked = 0;
  for (const token of listAuthTokens(conn, userId, workspaceId)) {
    if (token.id === minted.tokenId) continue;
    if (token.revokedAt !== null) continue;
    if (!token.name.startsWith(AGENT_TOKEN_NAME)) continue;
    if (revokeAuthToken(conn, userId, token.id, workspaceId)) revoked += 1;
  }
  return { ...minted, revoked };
}

/**
 * Gives the project a token when its `.env.agent` holds none this database
 * accepts. A token that still works is left alone, whoever it is for: it may
 * be one the person chose, or one another account's agent uses. One that was
 * revoked, has expired or belongs to other books is replaced, since the agent
 * would otherwise start with a credential the app refuses.
 *
 * Nothing for the sample account: the handoff goes ahead, and its agent asks
 * for access as it would without this.
 */
export function ensureAgentToken(
  conn: ProjectDbConnection,
  owner: AgentTokenOwner,
  root: string,
): void {
  if (isSampleAccount(owner.user)) return;
  const stored = readAgentToken(root);
  if (stored !== undefined && tokenIsLive(conn, stored)) return;
  writeAgentToken(conn, owner, root);
}
