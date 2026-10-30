import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { applyMigrations, scopedRows } from "@sapporta/server";
import { describe, expect, it } from "vitest";
import { testLedgerAuth } from "../modules/ledger-sql/testing.js";
import { dbu6MigrationsDir } from "../paths.js";
import { accounts, accountsTable } from "./accounts.js";

const SCOPE = "'workspace', 'user'";
const AT = "'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'";

/*
 * The account pickers' tree, as Sapporta's tree lookup serves it from the
 * accounts table's `meta.tree`: top accounts in the ledger's type order,
 * whatever their names, and siblings by name.
 */
function lookupTree() {
  const sqlite = new Database(":memory:");
  applyMigrations(sqlite, dbu6MigrationsDir());
  sqlite.exec(`
    INSERT INTO accounts (id, workspace_id, scoped_to_user_id, name, parent_id, account_type, created_at, updated_at) VALUES
      (1, ${SCOPE}, 'Spending', NULL, 'Expense', ${AT}),
      (2, ${SCOPE}, 'Groceries', 1, 'Expense', ${AT}),
      (3, ${SCOPE}, 'Dining', 1, 'Expense', ${AT}),
      (4, ${SCOPE}, 'What I Own', NULL, 'Asset', ${AT}),
      (5, ${SCOPE}, 'Sample Savings', 4, 'Asset', ${AT}),
      (6, ${SCOPE}, 'Card Dues', NULL, 'Liability', ${AT});
  `);
  const rows = scopedRows(drizzle(sqlite), testLedgerAuth(), accounts);
  return async (input?: Parameters<typeof rows.lookupTree>[0]) =>
    (await rows.lookupTree(input)).map(
      (entry) => `${"  ".repeat(entry.depth)}${entry.label} ${entry.role}`,
    );
}

describe("the accounts tree lookup", () => {
  it("puts top accounts in type order and siblings by name", async () => {
    expect(await lookupTree()()).toEqual([
      "What I Own choice",
      "  Sample Savings choice",
      "Card Dues choice",
      "Spending choice",
      "  Dining choice",
      "  Groceries choice",
    ]);
  });

  it("narrows to a type, and shows the edited account without its branch", async () => {
    const tree = lookupTree();
    expect(
      await tree({
        where: eq(accountsTable.account_type, "Expense"),
        notUnder: "1",
      }),
    ).toEqual(["Spending editing"]);
  });
});
