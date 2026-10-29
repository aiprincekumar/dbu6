import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { userPrincipal, type ProjectDbConnection } from "@sapporta/server";
import { describe, expect, it } from "vitest";
import { packageDir } from "../paths.js";
import {
  createAuthToken,
  listAuthTokens,
  requestUsesToken,
  resolveBearerTokenPrincipal,
  revokeAuthToken,
  tokenIsLive,
} from "./auth-tokens.js";
import { findMembership, membershipFromRow } from "./workspace.js";

function headers(authorization?: string): Headers {
  return new Headers(
    authorization === undefined ? {} : { Authorization: authorization },
  );
}

describe("requestUsesToken", () => {
  it("is a session's request when no Authorization header is sent", () => {
    expect(requestUsesToken(headers())).toBe(false);
  });

  it("is a session's request when the header is empty", () => {
    expect(requestUsesToken(headers(""))).toBe(false);
  });

  it("is a token request for any header with a value, well-formed or not", () => {
    expect(requestUsesToken(headers("Bearer spat_05050500_050505"))).toBe(true);
    expect(requestUsesToken(headers("Basic sample"))).toBe(true);
  });
});

describe("resolveBearerTokenPrincipal", () => {
  // Nothing is read for a request that carries no token, so no database.
  const conn = {} as ProjectDbConnection;

  it("leaves a request with an empty header to the session", () => {
    expect(resolveBearerTokenPrincipal(conn, headers(""))).toBeNull();
    expect(resolveBearerTokenPrincipal(conn, headers())).toBeNull();
  });
});

/** A migrated database holding one user, the owner of one workspace. */
function books() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: packageDir("migrations") });
  sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified)
      VALUES ('05050500-owner', 'NOPII OWNER', 'owner@example.com', 1);
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
      email: "owner@example.com",
      name: "NOPII OWNER",
      emailVerified: true,
    },
    membership: membershipFromRow(membership),
  });
  const made = createAuthToken(conn, owner, { name: "sample" });
  const lastUsedAt = () =>
    listAuthTokens(conn, "05050500-owner").find(
      (token) => token.id === made.token.id,
    )?.lastUsedAt;
  return { conn, sqlite, made, lastUsedAt };
}

describe("tokenIsLive", () => {
  it("accepts a token this database would, and leaves it unused", () => {
    const { conn, made, lastUsedAt } = books();

    expect(tokenIsLive(conn, made.rawToken)).toBe(true);
    expect(lastUsedAt()).toBeNull();
  });

  it("refuses a revoked token", () => {
    const { conn, made } = books();
    revokeAuthToken(conn, "05050500-owner", made.token.id, "05050500-org");

    expect(tokenIsLive(conn, made.rawToken)).toBe(false);
  });

  it("refuses an expired token", () => {
    const { conn, sqlite, made } = books();
    sqlite
      .prepare("UPDATE personalAccessToken SET expiresAt = 1 WHERE id = ?")
      .run(made.token.id);

    expect(tokenIsLive(conn, made.rawToken)).toBe(false);
  });

  it("refuses a token this database does not know, and one that is not a token", () => {
    const { conn } = books();

    expect(tokenIsLive(conn, "spat_05050500_050505")).toBe(false);
    expect(tokenIsLive(conn, "not-a-token")).toBe(false);
  });

  it("refuses a token whose user is no longer a member of its workspace", () => {
    const { conn, sqlite, made } = books();
    sqlite.exec("DELETE FROM member WHERE id = '05050500-member'");

    expect(tokenIsLive(conn, made.rawToken)).toBe(false);
  });

  it("is what a request with the token is accepted by, which marks it used", () => {
    const { conn, made, lastUsedAt } = books();

    const principal = resolveBearerTokenPrincipal(
      conn,
      new Headers({ Authorization: `Bearer ${made.rawToken}` }),
    );

    expect(principal?.kind).toBe("user");
    expect(lastUsedAt()).not.toBeNull();
  });
});
