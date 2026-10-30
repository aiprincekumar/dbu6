import { describe, expect, it } from "vitest";
import type { AccountMonthsRow } from "../../../shared/index";
import {
  ancestorIds,
  cellText,
  readCell,
  readGroup,
  readShow,
  visibleRows,
  withCell,
  withGroup,
  withShow,
} from "./pivot";

function row(
  account_id: number,
  name: string,
  children: AccountMonthsRow[] = [],
  own: (number | null)[] | null = null,
): AccountMonthsRow {
  return {
    account_id,
    name,
    opening: 0,
    values: [1000],
    own,
    total: 1000,
    average: 1000,
    outliers: [false],
    children,
  };
}

const tree = [
  row(
    1,
    "Food",
    [row(2, "Groceries"), row(3, "Dining", [row(4, "Cafes")])],
    [500],
  ),
  row(5, "Rent"),
];

describe("the URL", () => {
  it("reads a type's group, Expense by default, and an account over it", () => {
    expect(readGroup(new URLSearchParams())).toEqual({
      kind: "type",
      group: "expense",
    });
    expect(readGroup(new URLSearchParams("group=liability"))).toEqual({
      kind: "type",
      group: "liability",
    });
    expect(readGroup(new URLSearchParams("group=nope"))).toEqual({
      kind: "type",
      group: "expense",
    });
    expect(readGroup(new URLSearchParams("group=asset&account=7"))).toEqual({
      kind: "account",
      accountId: 7,
    });
  });

  it("writes a group without the open cell, leaving out the default", () => {
    const search = new URLSearchParams(
      "period=last-3-months&account=7&cell=total:2026-01",
    );
    expect(
      withGroup(search, { kind: "type", group: "expense" }).toString(),
    ).toBe("period=last-3-months");
    expect(withGroup(search, { kind: "type", group: "asset" }).toString()).toBe(
      "period=last-3-months&group=asset",
    );
  });

  it("round-trips what is shown, balance by default", () => {
    expect(readShow(new URLSearchParams())).toBe("balance");
    const change = withShow(new URLSearchParams("cell=1:period"), "change");
    expect(change.toString()).toBe("show=change");
    expect(readShow(change)).toBe("change");
    expect(withShow(change, "balance").toString()).toBe("");
  });

  it("round-trips a cell", () => {
    for (const cell of [
      { row: { kind: "total" as const }, column: "2026-04" },
      {
        row: { kind: "account" as const, accountId: 12, own: false },
        column: "fy-2025",
      },
      {
        row: { kind: "account" as const, accountId: 12, own: true },
        column: "period",
      },
    ]) {
      expect(readCell(withCell(new URLSearchParams(), cell))).toEqual(cell);
    }
    expect(readCell(new URLSearchParams("cell=junk"))).toBeNull();
    expect(
      withCell(new URLSearchParams("cell=total:period"), null).toString(),
    ).toBe("");
  });
});

describe("visibleRows", () => {
  it("shows the top rows, and under an open one its children and its own row", () => {
    const names = (open: number[]) =>
      visibleRows(tree, new Set(open)).map((line) =>
        line.kind === "own"
          ? `${"  ".repeat(line.depth)}${line.parent.name} (own)`
          : `${"  ".repeat(line.depth)}${line.row.name}`,
      );
    expect(names([])).toEqual(["Food", "Rent"]);
    expect(names([1])).toEqual([
      "Food",
      "  Groceries",
      "  Dining",
      "  Food (own)",
      "Rent",
    ]);
    // A row under a closed parent stays hidden.
    expect(names([3])).toEqual(["Food", "Rent"]);
    expect(names([1, 3])).toContain("    Cafes");
  });

  it("finds the rows above an account", () => {
    expect(ancestorIds(tree, 4)).toEqual([1, 3]);
    expect(ancestorIds(tree, 5)).toEqual([]);
  });
});

describe("cellText", () => {
  it("drops the sign on a normal amount and marks one running the other way", () => {
    expect(cellText("flow", 2500).text).toBe("2,500");
    expect(cellText("flow", -2500).text).toBe("−2,500");
    expect(cellText("balance", 0.2)).toEqual({ text: "0", dim: true });
    expect(cellText("flow", null)).toEqual({ text: "", dim: false });
  });

  it("always signs a change", () => {
    expect(cellText("change", 2500).text).toBe("+2,500");
    expect(cellText("change", -2500).text).toBe("−2,500");
  });
});
