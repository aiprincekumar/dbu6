/**
 * `dbu6 agent env`: give this project's coding agents a token, in the one file
 * the shipped `sapporta` command reads.
 *
 * The `sapporta` command finds the app by itself, from the project's
 * `SAPPORTA_API_PORT`, but it needs a `SAPPORTA_API_TOKEN` to act for anyone.
 * The app mints tokens in the browser, one at a time, each shown once; this
 * command does the same thing from the folder, for the agent that is working
 * in it: one token, written to `.env.agent` beside `.env.development` and
 * gitignored, which the `sapporta` bin reads and the server itself does not.
 * The token is minted straight into the database, so no app has to be
 * running, and one that is running accepts it at its next request.
 *
 * It is also the command the project's AGENTS.md names, so an agent that finds
 * `SAPPORTA_API_TOKEN` missing has a way to provision it that does not involve
 * asking a person to copy a secret into a chat.
 *
 *   dbu6 agent env            write .env.agent, print what to verify with
 *   dbu6 agent env --print    print an `export …` line instead, for `eval`
 *   dbu6 agent env --user <email>   which account, when a project has several
 *
 * Writing is not silent: the file is a credential, so the command says where it
 * put it and what to check, and never prints the token unless asked with
 * `--print`. Once the new one is safely on disk, the coding-agent tokens dbu6
 * wrote earlier for that account and workspace are revoked, a prompt
 * handoff's included, so a project does not collect one live token per run; a
 * token made in the app is left alone. `--print` prefers the working token the
 * project already has, so it mints nothing in the case it is normally used.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { PROJECT_API_TOKEN_FILE, userPrincipal } from "@sapporta/server";
import {
  findFirstMembership,
  membershipFromRow,
} from "../server/project-auth/index.js";
import {
  mintAgentToken,
  workingAgentToken,
  writeAgentToken,
} from "../server/modules/coding-agent/index.js";
import { openDbu6Runtime } from "../server/runtime.js";
import { databaseFile } from "../server/paths.js";
import {
  AgentEnvError,
  agentEnvExports,
  chooseAgentAccount,
  VERIFY_COMMAND,
  type AgentAccount,
} from "./agent-env.js";

const USAGE = `Usage: dbu6 agent env [--print] [--user <email>]

  Writes .env.agent in the project, holding SAPPORTA_API_TOKEN for a
  coding agent, and revokes the coding-agent tokens dbu6 wrote earlier
  for that account, a prompt handoff's included. Tokens made in the app
  are left alone.

  --print          Write the same token as an \`export\` line to stdout
                   instead, for \`eval "$(dbu6 agent env --print)"\`. A
                   project whose .env.agent holds a working token gets that
                   one, and nothing is minted; any other gets a fresh token,
                   which nothing stores, so a later run of this command
                   revokes it.
  --user <email>   The account the token is for, or its user id when one email
                   is in more than one workspace. Only needed when the project
                   has more than one account.`;

export async function agentCommand(
  args: string[],
  root: string,
): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand !== "env") {
    console.error(
      subcommand === undefined
        ? `dbu6 agent <command>\n\n  env    give this project's coding agents a Sapporta token\n`
        : `Unknown agent command: ${subcommand}\n\n${USAGE}`,
    );
    return 1;
  }

  let parsed: ReturnType<
    typeof parseArgs<{
      options: { user: { type: "string" }; print: { type: "boolean" } };
      allowPositionals: true;
    }>
  >;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        user: { type: "string" },
        print: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 1;
  }
  if (parsed.positionals.length > 0) {
    console.error(USAGE);
    return 1;
  }

  const { user, print } = parsed.values;

  // The token is a row in the books' database. A project with no database
  // yet is told which command makes one; `openDbu6Runtime` refuses one with
  // migrations pending, naming `dbu6 migrate`. This command never migrates,
  // so it takes no lock.
  if (!existsSync(databaseFile(root))) {
    console.error(
      `No database at ${databaseFile(root)}. Run \`dbu6 dev\` or \`dbu6 migrate\` first.`,
    );
    return 1;
  }

  const runtime = await openDbu6Runtime({ root, sendMail: false });
  try {
    const accounts = agentAccounts(runtime.conn);
    const account = chooseAgentAccount(accounts, { user });
    if (print) {
      // The token to export is the one the project already uses, when the app
      // accepts it: printing it mints nothing, so
      // `eval "$(dbu6 agent env --print)"` cannot leave a trail of live
      // tokens behind.
      const apiToken = workingAgentToken(runtime.conn, root);
      if (apiToken !== undefined) {
        process.stdout.write(agentEnvExports({ apiToken }));
        return 0;
      }
    }

    const membership = findFirstMembership(runtime.conn, account.userId);
    if (membership === null) {
      throw new AgentEnvError(
        `${account.email} is no longer a member of ${account.organizationName}.`,
      );
    }
    const owner = userPrincipal({
      user: {
        id: account.userId,
        email: account.email,
        name: account.name,
        emailVerified: true,
      },
      membership: membershipFromRow(membership),
    });

    if (print) {
      // Nothing stores this one, so say so: a later run of this command
      // revokes it, like any other coding-agent token dbu6 wrote.
      const minted = mintAgentToken(runtime.conn, owner, "dbu6 agent env");
      process.stderr.write(
        `${PROJECT_API_TOKEN_FILE} holds no token the app accepts, so this token is not stored: run \`dbu6 agent env\` to keep one there.\n`,
      );
      process.stdout.write(agentEnvExports(minted));
      return 0;
    }

    const written = writeAgentToken(
      runtime.conn,
      owner,
      root,
      "dbu6 agent env",
    );
    console.log(
      [
        `Wrote ${PROJECT_API_TOKEN_FILE} for ${account.email}.`,
        `  token ${written.tokenId.slice(0, 8)}…`,
        written.revoked > 0
          ? `  revoked ${written.revoked} earlier coding-agent token(s)`
          : "",
        "",
        "It is gitignored. The `sapporta` command reads the token from it and",
        "finds the app by itself, so with the app running, verify with, from",
        "this folder:",
        "",
        `  ${VERIFY_COMMAND}`,
        "",
        "That answers with the user and workspace the token acts as.",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
    return 0;
  } finally {
    runtime.close();
  }
}

/**
 * Every account that can own a token here: a member of a workspace, with the
 * email and workspace the command reports. The database can hold more than one,
 * which is why the choice is made rather than assumed.
 */
function agentAccounts(conn: {
  sqlite: { prepare: (sql: string) => { all: () => unknown[] } };
}): AgentAccount[] {
  const rows = conn.sqlite
    .prepare(
      `
      SELECT
        user.id AS user_id,
        user.email AS email,
        user.name AS name,
        organization.id AS organization_id,
        organization.name AS organization_name
      FROM user
      INNER JOIN member ON member.userId = user.id
      INNER JOIN organization ON organization.id = member.organizationId
      ORDER BY user.createdAt ASC, user.id ASC, member.createdAt ASC
      `,
    )
    .all();
  const accounts: AgentAccount[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const values = row as Record<string, unknown>;
    const fields = [
      values.user_id,
      values.email,
      values.organization_id,
      values.organization_name,
    ];
    if (fields.some((value) => typeof value !== "string")) continue;
    accounts.push({
      userId: values.user_id as string,
      email: values.email as string,
      name: typeof values.name === "string" ? values.name : null,
      organizationId: values.organization_id as string,
      organizationName: values.organization_name as string,
    });
  }
  return accounts;
}
