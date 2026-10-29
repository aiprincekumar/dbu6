/**
 * `dbu6 agent env`: who the token is for, and how it is printed. Everything
 * here is a decision over given values, so the command's own module only has
 * to fetch the accounts and call the server's `writeAgentToken`, which mints
 * the token and writes `.env.agent` (modules/coding-agent/agent-access.ts).
 */

import { isSampleAccount } from "../server/project-auth/index.js";

/** The `export …` line `dbu6 agent env --print` writes, for `eval`. */
export function agentEnvExports({ apiToken }: { apiToken: string }): string {
  return `export SAPPORTA_API_TOKEN=${shellQuote(apiToken)}\n`;
}

/**
 * The command that proves the token works, as the documentation prints it.
 * `npx` resolves the project's own `sapporta` bin, which dbu6 ships, so this
 * is right in a folder whose package manager linked nothing else.
 */
export const VERIFY_COMMAND = "npx sapporta api get /api/auth-context";

/** One shell word, whatever the value holds. */
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** One account that can own a token: a member of a workspace. */
export interface AgentAccount {
  userId: string;
  email: string;
  name: string | null;
  organizationId: string;
  organizationName: string;
}

export class AgentEnvError extends Error {}

/**
 * Which account the token is for. A books folder is one person's, so the
 * common case has a single account and needs no asking; more than one is
 * reported with the emails, and `--user` picks by email.
 *
 * The sample account dbu6-seed-sample-data makes is never picked for you. One
 * named with `--user` is chosen like any other, and minting refuses it
 * (`mintAgentToken`, modules/coding-agent/agent-access.ts).
 */
export function chooseAgentAccount(
  accounts: readonly AgentAccount[],
  options: { user?: string } = {},
): AgentAccount {
  const wanted = options.user?.trim();
  if (wanted !== undefined && wanted !== "") {
    const matches = accounts.filter(
      (account) => account.email === wanted || account.userId === wanted,
    );
    if (matches.length === 0) {
      throw new AgentEnvError(
        `No account here has the email ${wanted}. The accounts are:\n` +
          listAccounts(accounts),
      );
    }
    if (matches.length > 1) {
      throw new AgentEnvError(
        `${wanted} is in more than one workspace, so say which one the token is for:\n` +
          `${listAccounts(matches)}\n` +
          "Run this again with `--user <user id>`.",
      );
    }
    return matches[0]!;
  }
  const candidates = accounts.filter((account) => !isSampleAccount(account));
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new AgentEnvError(
      accounts.length === 0
        ? "This project has no account yet. Open the app, sign up, then run this again."
        : `This project has only sample accounts (${accounts.map((account) => account.email).join(", ")}). Sign up in the app and run this again.`,
    );
  }
  throw new AgentEnvError(
    `This project has more than one account, so say which one the agent is for:\n` +
      `${listAccounts(candidates)}\n` +
      "Run this again with `--user <email>`, or with the `user id` shown when one email is in more than one workspace.",
  );
}

/**
 * One line per account. An email that appears more than once names its user id,
 * because `--user` cannot tell two workspaces apart by an email alone and the
 * token is minted for one workspace.
 */
function listAccounts(accounts: readonly AgentAccount[]): string {
  const perEmail = new Map<string, number>();
  for (const account of accounts) {
    perEmail.set(account.email, (perEmail.get(account.email) ?? 0) + 1);
  }
  return accounts
    .map((account) => {
      const id =
        (perEmail.get(account.email) ?? 0) > 1
          ? ` (user id ${account.userId})`
          : "";
      return `  ${account.email}${account.name ? ` (${account.name})` : ""} — ${account.organizationName}${id}`;
    })
    .join("\n");
}
