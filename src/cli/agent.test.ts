import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { pendingMigrations, readProjectApiToken } from "@sapporta/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { acquireDataLock } from "../server/data-lock.js";
import {
  applyNextMigration,
  migrateSafely,
} from "../server/migrate-safely.js";
import {
  databaseFile,
  dbu6MigrationsDir,
  packageDir,
} from "../server/paths.js";
import { agentCommand } from "./agent.js";

// One root for the file: the runtime takes a single project per process.
let root: string;

beforeAll(() => {
  mkdirSync(packageDir("tmp"), { recursive: true });
  root = mkdtempSync(packageDir("tmp", "agent-command-test-"));
  mkdirSync(join(root, "data"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.stubEnv("SAPPORTA_DATA_DIR", "");
  vi.stubEnv("DBU6_ROOT", root);
  vi.stubEnv("BETTER_AUTH_SECRET", "sample-secret-050505-050505-050505");
  vi.stubEnv("SAPPORTA_PUBLIC_APP_URL", "http://localhost:2345");
  vi.stubEnv("SAPPORTA_MAIL_FROM", "sample@example.com");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

// Each test starts from a project with no database and no token.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(join(root, ".env.agent"), { force: true });
  for (const name of readdirSync(join(root, "data"))) {
    rmSync(join(root, "data", name), { force: true });
  }
});

/** One owner of one workspace, in a database with every migration applied. */
async function migratedBooks(): Promise<void> {
  expect((await migrateSafely(root)).status).toBe("migrated");
  const sqlite = new Database(databaseFile(root));
  try {
    sqlite.exec(`
      INSERT INTO user (id, name, email, emailVerified)
        VALUES ('05050500-owner', 'NOPII OWNER', 'owner@example.com', 1);
      INSERT INTO organization (id, name, slug, createdAt)
        VALUES ('05050500-org', 'NOPII Workspace', 'nopii', 0);
      INSERT INTO member (id, organizationId, userId, role, createdAt)
        VALUES ('05050500-member', '05050500-org', '05050500-owner', 'owner', 0);
    `);
  } finally {
    sqlite.close();
  }
}

describe("dbu6 agent env", () => {
  it("writes .env.agent while a running app holds the folder's lock", async () => {
    await migratedBooks();
    const serving = acquireDataLock(dirname(databaseFile(root)));
    try {
      expect(await agentCommand(["env"], root)).toBe(0);
    } finally {
      serving.release();
    }

    expect(readProjectApiToken(root)).toMatch(/^spat_/);
  });

  it("refuses a database with pending migrations, and migrates and writes nothing", async () => {
    const sqlite = new Database(databaseFile(root));
    applyNextMigration(sqlite, dbu6MigrationsDir());
    const pending = pendingMigrations(sqlite, dbu6MigrationsDir()).length;
    sqlite.close();

    await expect(agentCommand(["env"], root)).rejects.toThrow(
      /has migrations this dbu6 has not applied/,
    );

    expect(readProjectApiToken(root)).toBeUndefined();
    const after = new Database(databaseFile(root), { readonly: true });
    try {
      expect(pendingMigrations(after, dbu6MigrationsDir())).toHaveLength(
        pending,
      );
    } finally {
      after.close();
    }
  });
});
