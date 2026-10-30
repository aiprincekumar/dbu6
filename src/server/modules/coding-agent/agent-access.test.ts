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
import {
  PROJECT_API_TOKEN_FILE,
  readProjectApiToken,
  userPrincipal,
  type ProjectDbConnection,
} from "@sapporta/server";
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
  ensureAgentToken,
  mintAgentToken,
  SampleAccountError,
  workingAgentToken,
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

/** What each token was minted for, by id; `null` for one a person made. */
function purposes(conn: ProjectDbConnection): Record<string, string | null> {
  const rows = conn.sqlite
    .prepare("SELECT id, purpose FROM personalAccessToken")
    .all() as { id: string; purpose: string | null }[];
  return Object.fromEntries(rows.map((row) => [row.id, row.purpose]));
}

function writeFile(root: string, contents: string, mode = 0o600): void {
  writeFileSync(join(root, PROJECT_API_TOKEN_FILE), contents, { mode });
}

describe("mintAgentToken", () => {
  it("mints a coding-agent token, named after what minted it", () => {
    const { conn, owner } = books();

    const minted = mintAgentToken(conn, owner, "dbu6 agent env");

    expect(minted.apiToken).toMatch(/^spat_/);
    const [token] = liveTokens(conn, owner);
    expect(token?.id).toBe(minted.tokenId);
    expect(token?.name).toBe("dbu6 agent env");
    expect(purposes(conn)[minted.tokenId]).toBe("coding-agent");
  });

  it("refuses the sample account, and mints nothing", () => {
    const { conn, owner } = books(DEMO_ACCOUNT.email);

    expect(() => mintAgentToken(conn, owner, "dbu6 agent env")).toThrow(
      SampleAccountError,
    );
    expect(liveTokens(conn, owner)).toEqual([]);
  });
});

describe("writeAgentToken", () => {
  it("writes the token alone, and where it came from", () => {
    const { conn, owner } = books();
    const root = tempRoot();

    const written = writeAgentToken(conn, owner, root, "dbu6 agent env");

    const file = readFileSync(join(root, PROJECT_API_TOKEN_FILE), "utf8");
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

    writeAgentToken(conn, owner, root, "dbu6 agent env");

    expect(statSync(join(root, PROJECT_API_TOKEN_FILE)).mode & 0o777).toBe(
      0o600,
    );
  });

  it("makes a file that already existed private too", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    // A restored backup, or a file some other tool made.
    writeFile(root, "old\n", 0o644);

    writeAgentToken(conn, owner, root, "dbu6 agent env");

    expect(statSync(join(root, PROJECT_API_TOKEN_FILE)).mode & 0o777).toBe(
      0o600,
    );
  });

  it("revokes the tokens dbu6 wrote before, once the new one is on disk", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    const first = writeAgentToken(conn, owner, root, "dbu6 agent env");

    const second = writeAgentToken(conn, owner, root, "dbu6 agent env");

    expect(readProjectApiToken(root)).toBe(second.apiToken);
    expect(second.revoked).toBe(1);
    expect(liveTokens(conn, owner).map((token) => token.id)).toEqual([
      second.tokenId,
    ]);
    expect(first.tokenId).not.toBe(second.tokenId);
  });

  it("leaves a token the person made in the app alone", () => {
    const { conn, owner } = books();
    const made = createAuthToken(conn, owner, { name: "my laptop" });

    writeAgentToken(conn, owner, tempRoot(), "dbu6 agent env");

    expect(liveTokens(conn, owner).map((token) => token.id)).toContain(
      made.token.id,
    );
  });

  it("leaves an app-made token alone even when it is named like dbu6's", () => {
    const { conn, owner } = books();
    const made = createAuthToken(conn, owner, {
      name: "dbu6 agent env laptop",
    });

    const written = writeAgentToken(conn, owner, tempRoot(), "dbu6 agent env");

    expect(written.revoked).toBe(0);
    expect(liveTokens(conn, owner).map((token) => token.id)).toContain(
      made.token.id,
    );
  });

  it("revokes a coding-agent token whatever minted it", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    const handedOff = writeAgentToken(conn, owner, root, "Prompt handoff");

    const written = writeAgentToken(conn, owner, root, "dbu6 agent env");

    expect(written.revoked).toBe(1);
    expect(liveTokens(conn, owner).map((token) => token.id)).toEqual([
      written.tokenId,
    ]);
    expect(handedOff.tokenId).not.toBe(written.tokenId);
  });
});

describe("ensureAgentToken", () => {
  it("gives a project with no file a token", () => {
    const { conn, owner } = books();
    const root = tempRoot();

    ensureAgentToken(conn, owner, root);

    const [token] = liveTokens(conn, owner);
    expect(readProjectApiToken(root)).toMatch(/^spat_/);
    expect(token?.name).toBe("Prompt handoff");
    expect(purposes(conn)[token!.id]).toBe("coding-agent");
  });

  it("leaves a file whose token works as it is, whoever it is for, and mints nothing", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    // The person's own token from the app, which another agent may be using.
    const made = createAuthToken(conn, owner, { name: "my laptop" });
    writeFile(root, `SAPPORTA_API_TOKEN=${made.rawToken}\n`);

    ensureAgentToken(conn, owner, root);

    expect(readProjectApiToken(root)).toBe(made.rawToken);
    expect(liveTokens(conn, owner).map((token) => token.id)).toEqual([
      made.token.id,
    ]);
  });

  it("replaces a token that was revoked", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    const old = writeAgentToken(conn, owner, root, "dbu6 agent env");
    revokeAuthToken(
      conn,
      owner.user.id,
      old.tokenId,
      owner.membership.workspace.id,
    );

    ensureAgentToken(conn, owner, root);

    const stored = readProjectApiToken(root);
    expect(stored).not.toBe(old.apiToken);
    expect(liveTokens(conn, owner).map((token) => token.id)).toHaveLength(1);
  });

  it("replaces a token from other books, which this database does not know", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    writeFile(root, `SAPPORTA_API_TOKEN=${SAMPLE_TOKEN}\n`);

    ensureAgentToken(conn, owner, root);

    expect(readProjectApiToken(root)).not.toBe(SAMPLE_TOKEN);
    expect(liveTokens(conn, owner)).toHaveLength(1);
  });

  it("fills a file that has no token in it", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    writeFile(root, "SAPPORTA_API_TOKEN=\n");

    ensureAgentToken(conn, owner, root);

    expect(readProjectApiToken(root)).toMatch(/^spat_/);
  });

  it("leaves a dead token in place for the sample account, and mints nothing", () => {
    const { conn, owner } = books(DEMO_ACCOUNT.email);
    const root = tempRoot();
    writeFile(root, `SAPPORTA_API_TOKEN=${SAMPLE_TOKEN}\n`);

    ensureAgentToken(conn, owner, root);

    expect(readProjectApiToken(root)).toBe(SAMPLE_TOKEN);
    expect(liveTokens(conn, owner)).toEqual([]);
  });

  it("writes and mints nothing for the sample account", () => {
    const { conn, owner } = books(DEMO_ACCOUNT.email);
    const root = tempRoot();

    ensureAgentToken(conn, owner, root);

    expect(readProjectApiToken(root)).toBeUndefined();
    expect(liveTokens(conn, owner)).toEqual([]);
  });
});

describe("workingAgentToken", () => {
  it("is the file's token when this database accepts it", () => {
    const { conn, owner } = books();
    const root = tempRoot();
    const written = writeAgentToken(conn, owner, root, "dbu6 agent env");

    expect(workingAgentToken(conn, root)).toBe(written.apiToken);
  });

  it("is undefined for no file, a blank token, a revoked one or one from other books", () => {
    const { conn, owner } = books();

    expect(workingAgentToken(conn, tempRoot())).toBeUndefined();

    const blank = tempRoot();
    writeFile(blank, "SAPPORTA_API_TOKEN=\n");
    expect(workingAgentToken(conn, blank)).toBeUndefined();

    const revoked = tempRoot();
    const old = writeAgentToken(conn, owner, revoked, "dbu6 agent env");
    revokeAuthToken(
      conn,
      owner.user.id,
      old.tokenId,
      owner.membership.workspace.id,
    );
    expect(workingAgentToken(conn, revoked)).toBeUndefined();

    const other = tempRoot();
    writeFile(other, `SAPPORTA_API_TOKEN=${SAMPLE_TOKEN}\n`);
    expect(workingAgentToken(conn, other)).toBeUndefined();
  });
});
