import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { userPrincipal, type ProjectDbConnection } from "@sapporta/server";
import { afterEach, describe, expect, it } from "vitest";
import { packageDir } from "../../paths.js";
import {
  createAuthToken,
  DEMO_ACCOUNT,
  findMembership,
  listAuthTokens,
  membershipFromRow,
  revokeAuthToken,
} from "../../project-auth/index.js";
import {
  AGENT_ENV_FILE,
  AGENT_TOKEN_NAME,
  ensureAgentToken,
  mintAgentToken,
  readAgentToken,
  writeAgentToken,
  type AgentTokenOwner,
} from "./agent-access.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-access-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SAMPLE_TOKEN = "spat_05050500_050505";
const OWNER_EMAIL = "owner@example.com";

/** A migrated database holding one user, the owner of one workspace. */
function books(email = OWNER_EMAIL): {
  conn: ProjectDbConnection;
  owner: AgentTokenOwner;
} {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: packageDir("migrations") });
  sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified)
      VALUES ('05050500-owner', 'NOPII OWNER', '${email}', 1);
    INSERT INTO organization (id, name, slug, createdAt)
      VALUES ('05050500-org', 'NOPII Workspace', 'nopii', 0);
    INSERT INTO member (id, organizationId, userId, role, createdAt)
      VALUES ('05050500-member', '05050500-org', '05050500-owner', 'owner', 0);
  `);
  const conn = { sqlite, db } as ProjectDbConnection;
  const membership = findMembership(conn, "05050500-owner", "05050500-org")!;
  const owner = userPrincipal({
    user: {
      id: "05050500-owner",
      email,
      name: "NOPII OWNER",
      emailVerified: true,
    },
    membership: membershipFromRow(membership),
  });
  return { conn, owner };
}

function liveTokens(conn: ProjectDbConnection, owner: AgentTokenOwner) {
  return listAuthTokens(
    conn,
    owner.user.id,
    owner.membership.workspace.id,
  ).filter((token) => token.revokedAt === null);
}

function writeFile(root: string, contents: string, mode = 0o600): void {
  writeFileSync(join(root, AGENT_ENV_FILE), contents, { mode });
}

describe("readAgentToken", () => {
  it("reads the token a project holds", () => {
    const root = tempRoot();
    writeFile(root, `# comment\nSAPPORTA_API_TOKEN=${SAMPLE_TOKEN}\n`);

    expect(readAgentToken(root)).toBe(SAMPLE_TOKEN);
  });

  it("reads an older file that still holds a URL, and ignores the URL", () => {
    const root = tempRoot();
    writeFile(
      root,
      `SAPPORTA_API_URL=http://localhost:1\nSAPPORTA_API_TOKEN=${SAMPLE_TOKEN}\n`,
    );

    expect(readAgentToken(root)).toBe(SAMPLE_TOKEN);
  });

  it("answers undefined for a file that is not there", () => {
    expect(readAgentToken(tempRoot())).toBeUndefined();
  });

  it("answers undefined when the token is missing or blank", () => {
    const noToken = tempRoot();
    writeFile(noToken, "SAPPORTA_API_URL=http://localhost:1\n");
    expect(readAgentToken(noToken)).toBeUndefined();

    const blank = tempRoot();
    writeFile(blank, "SAPPORTA_API_TOKEN=\n");
    expect(readAgentToken(blank)).toBeUndefined();
  });
});

describe("mintAgentToken", () => {
  it("mints under dbu6's name", () => {
    const { conn, owner } = books();

    const minted = mintAgentToken(conn, owner);

    expect(minted.apiToken).toMatch(/^spat_/);
    const [token] = liveTokens(conn, owner);
    expect(token?.id).toBe(minted.tokenId);
    expect(token?.name.startsWith(AGENT_TOKEN_NAME)).toBe(true);
  });

  it("refuses the sample account, and mints nothing", () => {
    const { conn, owner } = books(DEMO_ACCOUNT.email);

    expect(() => mintAgentToken(conn, owner)).toThrow(/sample account/);
    expect(liveTokens(conn, owner)).toEqual([]);
  });
});

describe("writeAgentToken", () => {
  it("writes the token alone, and where it came from", () => {
    const { conn, owner } = books();
    const root = tempRoot();

    const written = writeAgentToken(conn, owner, root);

    const file = readFileSync(join(root, AGENT_ENV_FILE), "utf8");
    expect(file).toContain(`SAPPORTA_API_TOKEN=${written.apiToken}`);
    // No URL: the CLI finds the port itself, and a URL here would go stale.
    expect(file).not.toContain("SAPPORTA_API_URL");
    // The person who owns the token, so the file can be judged later.
    expect(file).toContain(OWNER_EMAIL);
    // Gitignored, and read by the shipped command only.
    expect(file).toContain("Gitignored");
    expect(file.endsWith("\n")).toBe(true);
  });

  it("writes a new file private to its owner", () => {
    const { conn, owner } = books();
    const root = tempRoot();

    writeAgentToken(conn, owner, root);

    expect(statSync(join(root, AGENT_ENV_FILE)).mode & 0o777).toBe(0o600);
  });

  it("makes a file that already existed private too", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    // A restored backup, or a file some other tool made.
    writeFile(root, "old\n", 0o644);

    writeAgentToken(conn, owner, root);

    expect(statSync(join(root, AGENT_ENV_FILE)).mode & 0o777).toBe(0o600);
  });

  it("revokes the tokens dbu6 wrote before, once the new one is on disk", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    const first = writeAgentToken(conn, owner, root);

    const second = writeAgentToken(conn, owner, root);

    expect(readAgentToken(root)).toBe(second.apiToken);
    expect(second.revoked).toBe(1);
    expect(liveTokens(conn, owner).map((token) => token.id)).toEqual([
      second.tokenId,
    ]);
    expect(first.tokenId).not.toBe(second.tokenId);
  });

  it("leaves a token the person made in the app alone", () => {
    const { conn, owner } = books();
    const made = createAuthToken(conn, owner, { name: "my laptop" });

    writeAgentToken(conn, owner, tempRoot());

    expect(liveTokens(conn, owner).map((token) => token.id)).toContain(
      made.token.id,
    );
  });
});

describe("ensureAgentToken", () => {
  it("gives a project with no file a token", () => {
    const { conn, owner } = books();
    const root = tempRoot();

    ensureAgentToken(conn, owner, root);

    const [token] = liveTokens(conn, owner);
    expect(readAgentToken(root)).toMatch(/^spat_/);
    expect(token?.name.startsWith(AGENT_TOKEN_NAME)).toBe(true);
  });

  it("leaves a file whose token works as it is, whoever it is for, and mints nothing", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    // The person's own token from the app, which another agent may be using.
    const made = createAuthToken(conn, owner, { name: "my laptop" });
    writeFile(root, `SAPPORTA_API_TOKEN=${made.rawToken}\n`);

    ensureAgentToken(conn, owner, root);

    expect(readAgentToken(root)).toBe(made.rawToken);
    expect(liveTokens(conn, owner).map((token) => token.id)).toEqual([
      made.token.id,
    ]);
  });

  it("replaces a token that was revoked", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    const old = writeAgentToken(conn, owner, root);
    revokeAuthToken(
      conn,
      owner.user.id,
      old.tokenId,
      owner.membership.workspace.id,
    );

    ensureAgentToken(conn, owner, root);

    const stored = readAgentToken(root);
    expect(stored).not.toBe(old.apiToken);
    expect(liveTokens(conn, owner).map((token) => token.id)).toHaveLength(1);
  });

  it("replaces a token from other books, which this database does not know", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    writeFile(root, `SAPPORTA_API_TOKEN=${SAMPLE_TOKEN}\n`);

    ensureAgentToken(conn, owner, root);

    expect(readAgentToken(root)).not.toBe(SAMPLE_TOKEN);
    expect(liveTokens(conn, owner)).toHaveLength(1);
  });

  it("fills a file that has no token in it", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    writeFile(root, "SAPPORTA_API_TOKEN=\n");

    ensureAgentToken(conn, owner, root);

    expect(readAgentToken(root)).toMatch(/^spat_/);
  });

  it("writes and mints nothing for the sample account", () => {
    const { conn, owner } = books(DEMO_ACCOUNT.email);
    const root = tempRoot();

    ensureAgentToken(conn, owner, root);

    expect(readAgentToken(root)).toBeUndefined();
    expect(liveTokens(conn, owner)).toEqual([]);
  });
});
