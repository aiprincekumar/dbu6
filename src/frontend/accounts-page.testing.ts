import { useSchemaStore } from "@sapporta/frontend/schema";
import type { TableSchema } from "@sapporta/shared/contracts";
import { ACCOUNT_PATH_SEPARATOR } from "../shared/index";

/** An account as the tests hand it to the stand-in server. */
type PathAccount = {
  id: number;
  name: string;
  parent_id: number | null;
  account_type: string;
};

/** Each account's parent path by id, as the server's `treePath()` gives it. */
function parentPaths(
  rows: readonly PathAccount[],
): Record<number, string | null> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return Object.fromEntries(
    rows.map((row) => {
      const names: string[] = [];
      const walked = new Set([row.id]);
      for (
        let at = row.parent_id === null ? undefined : byId.get(row.parent_id);
        at !== undefined && !walked.has(at.id);
        at = at.parent_id === null ? undefined : byId.get(at.parent_id)
      ) {
        walked.add(at.id);
        names.unshift(at.name);
      }
      return [
        row.id,
        names.length === 0 ? null : names.join(ACCOUNT_PATH_SEPARATOR),
      ];
    }),
  );
}

/**
 * A `GET /tables/accounts` page holding `rows`, for tests that stand in for
 * the server, with each account's computed `parentPath` beside them.
 */
export function accountsTablePage(rows: readonly PathAccount[]) {
  return {
    data: rows,
    meta: { total: rows.length, page: 1, limit: 1000, pages: 1 },
    computed: { parentPath: parentPaths(rows) },
  };
}

/**
 * The accounts table's schema as the app's schema catalog holds it, for
 * tests that draw an account picker: a tree whose rows' `parentPath` sits
 * before a chosen name. `serveAccountsSchema()` puts it in the catalog.
 */
export const ACCOUNTS_SCHEMA: TableSchema = {
  name: "accounts",
  label: "Accounts",
  immutable: false,
  columns: [],
  children: [],
  rowLabelColumns: ["name"],
  searchable: true,
  tree: {
    parentColumn: "parent_id",
    column: "name",
    defaultExpanded: true,
    matchContext: "ancestors",
    path: "parentPath",
    pathSeparator: ACCOUNT_PATH_SEPARATOR,
  },
  computed: [{ name: "parentPath", label: "Parent path", kind: "text" }],
  rowCaption: "parentPath",
};

/** Puts `ACCOUNTS_SCHEMA` in the schema catalog, and returns its undo. */
export function serveAccountsSchema(): () => void {
  useSchemaStore.getState().setTables([ACCOUNTS_SCHEMA]);
  return () => useSchemaStore.getState().reset();
}

const TYPE_ORDER = ["Asset", "Liability", "Equity", "Revenue", "Expense"];

// The lookup narrowing in `url`, as the server reads it: the filters an
// account must pass, and the account whose branch is left out.
function narrowingOf(url: URL) {
  const lists = new Map<string, string[] | null>();
  for (const [key, value] of url.searchParams) {
    const match = /^filter\[([^\]]+)\]\[(in|is)\]$/.exec(key);
    if (match === null) continue;
    lists.set(match[1]!, match[2] === "in" ? value.split(",") : null);
  }
  const notUnder = url.searchParams.get("notUnder");
  const passes = (row: PathAccount): boolean =>
    [...lists].every(([column, values]) =>
      values === null
        ? row[column as keyof PathAccount] === null
        : values.includes(String(row[column as keyof PathAccount])),
    );
  return { passes, notUnder };
}

// Whether `row` is `notUnder` or sits under it.
function isUnder(
  rows: readonly PathAccount[],
  row: PathAccount,
  notUnder: string | null,
): boolean {
  const walked = new Set<number>();
  for (
    let at: PathAccount | undefined = row;
    at !== undefined && !walked.has(at.id);
    at = rows.find((one) => one.id === at?.parent_id)
  ) {
    if (String(at.id) === notUnder) return true;
    walked.add(at.id);
  }
  return false;
}

const parentPathsOf = (
  rows: readonly PathAccount[],
  found: readonly PathAccount[],
) => {
  const paths = parentPaths(rows);
  return {
    parentPath: Object.fromEntries(found.map((row) => [row.id, paths[row.id]])),
  };
};

/**
 * `GET /tables/accounts/_lookup` over `rows` as the server answers it: by
 * `ids` unnarrowed, else the search for `q` among the accounts that pass the
 * narrowing (`filter[col][in]`, `filter[col][is]`, and `notUnder`, the
 * account and every account under it), each with its `parentPath`.
 */
export function accountsLookup(rows: readonly PathAccount[], url: URL) {
  const ids = url.searchParams.get("ids")?.split(",");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const { passes, notUnder } = narrowingOf(url);
  const found =
    ids !== undefined
      ? rows.filter((row) => ids.includes(String(row.id)))
      : rows.filter(
          (row) =>
            passes(row) &&
            !isUnder(rows, row, notUnder) &&
            row.name.toLowerCase().includes(q),
        );
  return {
    entries: found.map((row) => ({
      value: row.id,
      label: row.name,
      meta: row,
    })),
    computed: parentPathsOf(rows, found),
  };
}

/**
 * `GET /tables/accounts/_lookup_tree` over `rows` as the server answers it:
 * the accounts that pass the narrowing, under the ancestors that place them,
 * and the `notUnder` account where it sits without its branch; top accounts
 * in type order, siblings by name.
 */
export function accountsLookupTree(rows: readonly PathAccount[], url: URL) {
  const { passes, notUnder } = narrowingOf(url);
  const byName = (a: PathAccount, b: PathAccount) =>
    a.name.localeCompare(b.name);
  const childrenOf = (id: number | null) =>
    rows.filter((row) => row.parent_id === id).sort(byName);
  const entries: {
    value: number;
    label: string;
    meta: PathAccount;
    depth: number;
    role: "choice" | "context" | "editing";
  }[] = [];
  const walk = (row: PathAccount, depth: number): boolean => {
    const editing = String(row.id) === notUnder;
    const role = editing ? "editing" : passes(row) ? "choice" : "context";
    const at = entries.length;
    entries.push({ value: row.id, label: row.name, meta: row, depth, role });
    let kept = role !== "context";
    if (!editing) {
      for (const child of childrenOf(row.id)) {
        if (walk(child, depth + 1)) kept = true;
      }
    }
    if (!kept) entries.splice(at, 1);
    return kept;
  };
  const roots = childrenOf(null).sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.account_type) - TYPE_ORDER.indexOf(b.account_type),
  );
  for (const root of roots) walk(root, 0);
  return {
    entries,
    computed: parentPathsOf(
      rows,
      entries.map((entry) => entry.meta),
    ),
  };
}

/**
 * Answers the accounts lookups, `_lookup` and `_lookup_tree`, over `rows`;
 * null for any other request.
 */
export function accountsLookupResponse(
  rows: readonly PathAccount[],
  url: URL,
): Response | null {
  if (url.pathname.endsWith("/tables/accounts/_lookup_tree")) {
    return Response.json(accountsLookupTree(rows, url));
  }
  if (url.pathname.endsWith("/tables/accounts/_lookup")) {
    return Response.json(accountsLookup(rows, url));
  }
  return null;
}
