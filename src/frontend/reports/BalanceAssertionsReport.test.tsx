// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { BalanceAssertionsReport } from "./BalanceAssertionsReport";

/*
 * Reconciliation Differences hands its rows to the coding agent while a
 * posted balance check misses, and offers nothing to hand over otherwise.
 */

let host: HTMLDivElement;
let root: Root;
let rows: Record<string, unknown>[];

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

function dataset(): GridDataset {
  return {
    name: "balance-assertions",
    label: "Reconciliation Differences",
    rootLevel: "assertion",
    levels: {
      assertion: {
        columns: [
          { id: "account_name", label: "Account", kind: "text" },
          // Text, so the grid needs no display time zone.
          { id: "date", label: "Date", kind: "text" },
          { id: "running_balance", label: "Books", kind: "number" },
          { id: "assertion", label: "Statement", kind: "number" },
          { id: "diff", label: "Difference", kind: "number" },
        ],
        childLevels: [],
      },
    },
    nodes: rows.map((columns, index) => ({
      rowKey: `journal:${index}`,
      levelName: "assertion",
      columns,
    })),
  };
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  rows = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(String(request?.url ?? input), "http://localhost");
      if (url.pathname.endsWith("/reports/balance-assertions")) {
        return Response.json(dataset());
      }
      return Response.json({ error: "Not here" }, { status: 404 });
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          MemoryRouter,
          null,
          createElement(BalanceAssertionsReport),
        ),
      ),
    );
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function agentButton(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("button")].find((one) =>
    one.textContent?.startsWith("Find why this stopped matching"),
  );
}

describe("Reconciliation Differences", () => {
  it("hands the checks that miss to the agent", async () => {
    rows = [
      {
        account_id: 12,
        entry_id: 300,
        account_name: "Sample Savings",
        date: "2026-04-30",
        journal_id: 41,
        running_balance: 10000,
        assertion: 12500,
        diff: -2500,
      },
    ];
    await render();

    expect(host.textContent).toContain("Sample Savings");
    expect(agentButton()).toBeDefined();
  });

  it("offers nothing to hand over while every check matches", async () => {
    await render();

    // The report came back, with no rows.
    expect(fetch).toHaveBeenCalled();
    expect(host.textContent).toContain("Reconciliation Differences");
    expect(agentButton()).toBeUndefined();
  });
});
