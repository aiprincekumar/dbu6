// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  ChartAccount,
  ChartOfAccounts,
  CodingAgentSetupGuide,
  LlmStatus,
  ChartSuggestion,
} from "../../shared/index";
import { NO_CODING_AGENT_MESSAGE } from "../../shared/index";
import { registerTypeScale } from "../type-scale";
import { ChartCard } from "./ChartCard";

/*
 * Card 1 of the first run (PLAN.md): new books see the standard chart, may
 * first say how they earn and spend for the agent to tailor it, tick through
 * two-level cards and use the ticked accounts, then go on to card 2. Books
 * with a chart go to Overview.
 */

let host: HTMLDivElement;
let root: Root;
let answers: Record<string, unknown>;
// A status other than 200, by the answer's key.
let statuses: Record<string, number>;
let posted: { path: string; body: unknown }[];

beforeAll(() => {
  // As startDbu6Frontend does, so class merging here is the app's.
  registerTypeScale();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  posted = [];
  answers = {};
  statuses = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), "http://localhost");
      const method = request?.method ?? init?.method ?? "GET";
      const path = url.pathname.replace(/^\/api/, "");
      if (method === "POST") {
        const raw = request ? await request.text() : String(init?.body ?? "");
        posted.push({ path, body: JSON.parse(raw) });
      }
      const key = `${method} ${path}`;
      if (!(key in answers)) throw new Error(`No answer for ${key}`);
      return Response.json(answers[key], { status: statuses[key] ?? 200 });
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const account = (
  name: string,
  account_type: ChartAccount["account_type"],
  parent: string | null = null,
  note: string | null = null,
): ChartAccount => ({ name, account_type, parent, note });

const STARTER: ChartAccount[] = [
  account("Assets", "Asset"),
  account("Bank Accounts", "Asset", "Assets", "Each bank account goes here."),
  account("Investments", "Asset", "Assets"),
  account("Sample Fund", "Asset", "Investments"),
  account("Sample Stocks", "Asset", "Investments"),
  account("Liabilities", "Liability"),
  account("Equity", "Equity"),
  account("Opening Balances", "Equity", "Equity"),
  account("Income", "Revenue"),
  account("Expenses", "Expense"),
  account("Food", "Expense", "Expenses"),
  account("Children", "Expense", "Expenses"),
];

const NEW_CHART: ChartOfAccounts = {
  state: "new",
  starter: { accounts: STARTER },
  unticked: ["Children"],
};

const READY: LlmStatus = { ready: true, name: "Sample Agent" };

const GUIDE: CodingAgentSetupGuide = {
  missing: "No sample agent is set up.",
  cliOnly: "Only the sample CLI will do.",
  agents: [
    {
      agent: "pi",
      name: "Sample Agent",
      worksWith: "A sample plan.",
      install: "npm install -g sample-agent",
      signIn: "Run `sample` in a terminal.",
      docsUrl: "https://example.com/sample",
    },
  ],
  setupPrompt: "Install the sample CLI.",
};

function Where() {
  const { pathname, search } = useLocation();
  return createElement("code", null, pathname + search);
}

async function render(at = "/setup") {
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(
          MemoryRouter,
          { initialEntries: [at] },
          createElement(Where),
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/setup",
              element: createElement(ChartCard),
            }),
            createElement(Route, { path: "*", element: null }),
          ),
        ),
      ),
    );
  });
  await settle();
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const text = () => host.textContent ?? "";
const where = () => host.querySelector("code")?.textContent;

function button(name: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!found) throw new Error(`No button "${name}" in: ${text()}`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
  await settle();
}

/** The box of an account's row, by the account's name. */
function box(name: string): HTMLElement {
  const label = Array.from(host.querySelectorAll("label")).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  const found =
    label?.parentElement?.querySelector<HTMLElement>('[role="checkbox"]');
  if (!found) throw new Error(`No box for "${name}" in: ${text()}`);
  return found;
}

async function type(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// What new books answer: the starter chart, and the agent.
const NEW_BOOKS = {
  "GET /setup/chart-of-accounts": NEW_CHART,
  "GET /setup/chart-of-accounts/suggest": READY,
};

describe("card 1 on new books", () => {
  it("shows two levels per type, folds deeper ones, creates what is ticked, and goes on to card 2", async () => {
    answers = { ...NEW_BOOKS, "POST /setup/chart-of-accounts": { ok: true } };
    await render();

    expect(text()).toContain("Set up your books");
    expect(host.querySelector("h1")?.textContent).toBe("Chart of accounts");
    const headings = Array.from(host.querySelectorAll("h3")).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual([
      "Assets",
      "Liabilities",
      "Equity",
      "Income",
      "Expenses",
    ]);
    // Children starts unticked; the funds fold under Investments.
    expect(button("Continue with 11 accounts →")).toBeTruthy();
    // An unticked name keeps its size beside the meta ink.
    const children = Array.from(host.querySelectorAll("label span")).find(
      (one) => one.textContent === "Children",
    );
    expect(children?.className).toContain("text-row");
    expect(children?.className).toContain("text-ink-meta");
    // A group a later step fills in says which, in place of its note.
    expect(text()).toContain("Bank AccountsStep 2");
    expect(text()).not.toContain("Each bank account goes here.");
    // A card's one top account is its heading, not a row of its own.
    expect(() => box("Assets")).toThrow();
    // Folded accounts are named on their parent's fold, without boxes.
    expect(() => box("Sample Fund")).toThrow();
    await click(button("Sample Fund, Sample Stocks▸"));
    expect(box("Sample Fund")).toBeTruthy();
    // A note is a tooltip, not a line.
    expect(text()).not.toContain("Each bank account goes here.");

    await click(box("Investments"));
    await click(button("Continue with 8 accounts →"));

    const created = posted.find(
      (one) => one.path === "/setup/chart-of-accounts",
    )?.body as { accounts: ChartAccount[] };
    expect(created.accounts.map((a) => a.name)).toEqual([
      "Assets",
      "Bank Accounts",
      "Liabilities",
      "Equity",
      "Opening Balances",
      "Income",
      "Expenses",
      "Food",
    ]);
    expect(where()).toBe("/add?run=setup");
  });

  it("drops a refusal once the chart or its ticks change", async () => {
    answers = {
      ...NEW_BOOKS,
      "POST /setup/chart-of-accounts": {
        error: "The chart can't be created: NOPII problem.",
        code: "invalid_chart",
        problems: ["NOPII problem."],
      },
    };
    statuses = { "POST /setup/chart-of-accounts": 422 };
    await render();

    await click(button("Continue with 11 accounts →"));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "NOPII problem.",
    );
    expect(where()).toBe("/setup");
    await click(box("Food"));
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await click(button("Continue with 10 accounts →"));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("says up front when no coding agent is set up, with Nuabase's guide", async () => {
    answers = {
      ...NEW_BOOKS,
      "GET /setup/chart-of-accounts/suggest": {
        ready: false,
        name: "Sample Agent",
        reason: NO_CODING_AGENT_MESSAGE,
      } satisfies LlmStatus,
      "GET /coding-agent/setup-guide": GUIDE,
    };
    await render();

    expect(text()).toContain("No sample agent is set up.");
    expect(host.querySelector("textarea")).toBeNull();
    expect(button("Continue with 11 accounts →").disabled).toBe(false);
    await click(button("How to set one up"));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Only the sample CLI will do.");
    expect(dialog?.textContent).toContain("npm install -g sample-agent");
  });

  it("says why an agent that is set up isn't working, with Settings", async () => {
    answers = {
      ...NEW_BOOKS,
      "GET /setup/chart-of-accounts/suggest": {
        ready: false,
        name: "Sample Agent",
        reason: "Sample Agent isn't signed in.",
      } satisfies LlmStatus,
    };
    await render();

    expect(text()).toContain(
      "Sample Agent isn't signed in. You can check the agent on the Coding agent page.",
    );
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("asks how the user earns and spends, shows the tailored chart, and goes back", async () => {
    const suggestion: ChartSuggestion = {
      proposal: {
        accounts: [
          account("Assets", "Asset"),
          account("Liabilities", "Liability"),
          account("Equity", "Equity"),
          account("Opening Balances", "Equity", "Equity"),
          account("Income", "Revenue"),
          account("Freelance", "Revenue", "Income", "Sample client work."),
          account("Expenses", "Expense"),
        ],
      },
      notes: ["Opening Balances was added."],
    };
    answers = {
      ...NEW_BOOKS,
      "POST /setup/chart-of-accounts/suggest": suggestion,
    };
    await render();

    // The question is asked first, beside the standard chart already ticked.
    expect(text()).toContain("Personalize with Sample Agent");
    expect(text()).not.toContain("Tailored by");
    expect(button("Continue with 11 accounts →")).toBeTruthy();
    expect(button("Personalize my Chart of Accounts").disabled).toBe(true);
    await type(host.querySelector("textarea")!, "Sample freelance work.");
    await click(button("Personalize my Chart of Accounts"));

    const asked = posted.find(
      (one) => one.path === "/setup/chart-of-accounts/suggest",
    )?.body as { description: string; current: ChartAccount[] };
    expect(asked.description).toBe("Sample freelance work.");
    expect(asked.current).toHaveLength(11);
    expect(text()).toContain("Tailored by Sample Agent");
    expect(text()).toContain("Freelance");
    expect(text()).toContain("1 adjustment");
    expect(button("Continue with 7 accounts →")).toBeTruthy();
    expect(button("Personalize again")).toBeTruthy();

    await click(button("Show the default accounts"));
    expect(text()).not.toContain("Freelance");
    expect(button("Continue with 11 accounts →")).toBeTruthy();
    await click(button("Show the tailored accounts"));
    expect(button("Continue with 7 accounts →")).toBeTruthy();
  });

  it("says when the books can't be read, and tries again", async () => {
    answers = {
      "GET /setup/chart-of-accounts": {
        error: "NOPII failure.",
        code: "forbidden",
      },
    };
    statuses = { "GET /setup/chart-of-accounts": 403 };
    await render();

    expect(host.querySelector("h1")?.textContent).toBe(
      "Couldn't load your accounts",
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "NOPII failure.",
    );
    answers = NEW_BOOKS;
    statuses = {};
    await click(button("Try again"));
    expect(host.querySelector("h1")?.textContent).toBe("Chart of accounts");
  });
});

describe("/setup on books with a chart", () => {
  it("goes to Overview, which picks the next card", async () => {
    answers = {
      "GET /setup/chart-of-accounts": {
        state: "existing",
        chart: { accounts: STARTER },
      } satisfies ChartOfAccounts,
    };
    await render();
    expect(where()).toBe("/");
    expect(posted).toEqual([]);
  });
});
