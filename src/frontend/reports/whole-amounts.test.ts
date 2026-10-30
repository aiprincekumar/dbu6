import { describe, expect, it } from "vitest";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { wholeAmounts } from "./whole-amounts";

const dataset: GridDataset = {
  name: "sample",
  label: "Sample",
  rootLevel: "accounts",
  levels: {
    accounts: {
      columns: [
        { id: "name", label: "Account", kind: "text" },
        {
          id: "balance",
          label: "Balance",
          kind: "number",
          displayFormat: "currency",
        },
        {
          id: "rate",
          label: "Rate",
          kind: "number",
          displayFormat: "percentage",
        },
      ],
      childLevels: ["entries"],
    },
    entries: {
      columns: [
        {
          id: "amount",
          label: "Amount",
          kind: "number",
          displayFormat: "currency",
        },
      ],
      childLevels: [],
    },
  },
  nodes: [
    {
      rowKey: "a",
      levelName: "accounts",
      columns: { name: "Rent", balance: 1000.5, rate: 0.125 },
      children: {
        entries: [
          { rowKey: "e", levelName: "entries", columns: { amount: "-0.40" } },
        ],
      },
      childFooterRows: {
        entries: [{ rowKey: "t", columns: { amount: 2499.49 } }],
      },
    },
  ],
  footerRows: [{ rowKey: "total", columns: { name: "Total", balance: -0.3 } }],
};

describe("wholeAmounts", () => {
  const shown = wholeAmounts(dataset);

  it("rounds every currency figure from its exact value, never to −0", () => {
    const [node] = shown.nodes;
    expect(node.columns).toEqual({ name: "Rent", balance: 1001, rate: 0.125 });
    expect(node.children?.entries[0].columns.amount).toBe(0);
    expect(Object.is(node.children?.entries[0].columns.amount, -0)).toBe(false);
    expect(node.childFooterRows?.entries[0].columns.amount).toBe(2499);
    expect(shown.footerRows?.[0].columns.balance).toBe(0);
    expect(Object.is(shown.footerRows?.[0].columns.balance, -0)).toBe(false);
  });

  it("draws currency columns as plain numbers and leaves the rest", () => {
    const formats = shown.levels.accounts.columns.map(
      (column) => column.displayFormat,
    );
    expect(formats).toEqual([undefined, undefined, "percentage"]);
    // The server's figures are left as they came.
    expect(dataset.nodes[0].columns.balance).toBe(1000.5);
  });
});
