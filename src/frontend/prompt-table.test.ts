import { describe, expect, it } from "vitest";
import { promptTable } from "./prompt-table";

describe("promptTable", () => {
  it("pads each column to its widest cell, amounts on the right", () => {
    expect(
      promptTable(
        ["Account", "Amount", "Note"],
        [
          ["Cash", "1000.00", ""],
          ["Sample Savings", "25.00", "sample"],
        ],
        [1],
      ),
    ).toBe(
      [
        "Account          Amount  Note",
        "Cash            1000.00",
        "Sample Savings    25.00  sample",
      ].join("\n"),
    );
  });
});
