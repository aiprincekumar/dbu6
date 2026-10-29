/**
 * The coding agent's access to the app: `.env.agent`, the file a project's
 * coding agents read their token from, and the one way a token gets into it.
 *
 * Two things write it. `dbu6 agent env` (src/cli/agent.ts) does, for whichever
 * account it is told to; and handing a prompt to the coding agent
 * (handoff.ts) does, for the signed-in owner, when the file holds no token the
 * app accepts, so a prompt's agent can reach the app without asking for one.
 * Both mint the token the way the app's token screen mints one, with the
 * `coding-agent` purpose, so each revokes the tokens the other wrote before
 * it; each names the token after itself, which is only a label.
 *
 * The file sits beside `.env.development`. The shipped `sapporta` bin reads
 * it and `dbu6 dev` does not, so the server's own process never holds the
 * token: writing the file, and asking whether the token in it still works, is
 * all the server does with it. It is gitignored.
 */
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectDbConnection } from "@sapporta/server";
import {
  AGENT_ENV_FILE,
  readAgentToken,
} from "../../../../bin/sapporta-env.mjs";
import type { AppPrincipal } from "../../authz/types.js";
import {
  createAuthToken,
  isSampleAccount,
  revokeAuthTokensWithPurpose,
  tokenIsLive,
} from "../../project-auth/index.js";

/** What minted an agent token, which is the name a person sees it by. */
export type AgentTokenMinter = "dbu6 agent env" | "Prompt handoff";

/** Who a token is minted for: a user, in one workspace. */
export type AgentTokenOwner = Extract<AppPrincipal, { kind: "user" }>;

/** A token minted for an agent, and what it is known by. */
export interface MintedAgentToken {
  /** The raw token, which the database never returns again. */
  apiToken: string;
  tokenId: string;
}

/**
 * Mints a coding-agent token for `owner`'s workspace, named after what
 * minted it.
 *
 * Never for the sample account dbu6-seed-sample-data makes: it is a real
 * account with real tokens, but the next seed replaces its books, so an agent
 * must not be handed one.
 */
export function mintAgentToken(
  conn: ProjectDbConnection,
  owner: AgentTokenOwner,
  mintedBy: AgentTokenMinter,
): MintedAgentToken {
  if (isSampleAccount(owner.user)) {
    throw new Error(
      `${owner.user.email} is the sample account dbu6-seed-sample-data makes, whose books the next run replaces. Sign up in the app and use that account.`,
    );
  }
  const created = createAuthToken(
    conn,
    owner,
    { name: mintedBy },
    { purpose: "coding-agent" },
  );
  return { apiToken: created.rawToken, tokenId: created.token.id };
}

/**
 * Mints a token for `owner`, writes it to the project's `.env.agent`, and
 * then revokes the coding-agent tokens dbu6 minted for them before, now that
 * the new one is on disk. Only those, by purpose: a token a person made in the
 * app, whatever they named it, or one another tool made, is not dbu6's to
 * revoke.
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
  mintedBy: AgentTokenMinter,
): MintedAgentToken & { revoked: number } {
  const minted = mintAgentToken(conn, owner, mintedBy);
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

  const revoked = revokeAuthTokensWithPurpose(
    conn,
    owner.user.id,
    owner.membership.workspace.id,
    "coding-agent",
    minted.tokenId,
  );
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
  writeAgentToken(conn, owner, root, "Prompt handoff");
}
