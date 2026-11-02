// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StatementInboxBatch } from "../../shared/index";
import { RUN_PLAN_FIRST_RULE } from "../agent-prompt-rules";
import { DoMyBooks } from "./DoMyBooks";
import { doMyBooksPrompt } from "./inbox";

/*
 * Drop + "Do my books": a drop only saves the files to the inbox; the files
 * uploaded are listed under the drop, name and size, and one button hands
 * the run over all of them to the coding agent. The server skips a file
 * already in the inbox, and the drop says so.
 */

let host: HTMLDivElement;
let root: Root;
let batches: StatementInboxBatch[];
let saved: string[][];
let removed: string[];
let alreadyUploaded: string[];

const BATCH: StatementInboxBatch = {
  batch: "2026-11-02T10-00-00-0505",
  files: [
    {
      file_name: "sample-savings-050505.pdf",
      saved_path:
        "tmp/statement-inbox/2026-11-02T10-00-00-0505/0-sample-savings-050505.pdf",
      bytes: 2048,
    },
  ],
};

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  batches = [];
  saved = [];
  removed = [];
  alreadyUploaded = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = request?.url ?? String(input);
      const method = request?.method ?? init?.method ?? "GET";
      if (url.includes("/statement-inbox/remove")) {
        const { saved_path } = JSON.parse(String(init?.body)) as {
          saved_path: string;
        };
        removed.push(saved_path);
        batches = [];
        return Response.json({ removed: saved_path });
      }
      if (url.includes("/statement-inbox") && method === "POST") {
        const form = init?.body as FormData;
        saved.push(form.getAll("files").map((file) => (file as File).name));
        if (alreadyUploaded.length > 0) {
          return Response.json({
            ...BATCH,
            files: [],
            already_uploaded: alreadyUploaded,
          });
        }
        batches = [...batches, BATCH];
        return Response.json({ ...BATCH, already_uploaded: [] });
      }
      if (url.includes("/statement-inbox")) {
        return Response.json({ batches });
      }
      // No agent the server can start: the button copies the prompt.
      return Response.json({ mode: "none" });
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(props: Parameters<typeof DoMyBooks>[0] = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(MemoryRouter, null, createElement(DoMyBooks, props)),
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

async function choose(files: File[]) {
  const input = host.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("No file input");
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

function doMyBooksButton(): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Add 1 file to my books"),
  );
}

describe("Do my books", () => {
  it("offers only the drop while the inbox is empty", async () => {
    await render();
    expect(host.querySelector("[data-dropzone]")).not.toBeNull();
    expect(doMyBooksButton()).toBeUndefined();
  });

  it("says “Drop them here” under the list of statements to download", async () => {
    await render({ afterList: true });
    expect(host.textContent).toContain("Drop them here");
    expect(host.textContent).not.toContain("Drop your statement files here");
  });

  it("saves a drop to the inbox, lists what waits, and offers the run", async () => {
    await render();
    await choose([new File(["%PDF"], "sample-savings-050505.pdf")]);

    expect(saved).toEqual([["sample-savings-050505.pdf"]]);
    expect(host.textContent).toContain("sample-savings-050505.pdf");
    expect(host.textContent).toContain("2 KB");
    expect(doMyBooksButton()).toBeDefined();
  });

  it("lists the files a drop left from before, under the drop", async () => {
    batches = [BATCH];
    await render();
    const text = host.textContent ?? "";
    expect(text).toContain("sample-savings-050505.pdf");
    expect(text.indexOf("Files to add")).toBeGreaterThan(
      text.indexOf("Drop your statement files here"),
    );
    expect(doMyBooksButton()).toBeDefined();
  });

  it("says which files were already uploaded, adding none", async () => {
    batches = [BATCH];
    alreadyUploaded = ["sample-savings-050505.pdf"];
    await render();
    await choose([new File(["%PDF"], "sample-savings-050505.pdf")]);

    expect(host.textContent).toContain(
      "Already uploaded: sample-savings-050505.pdf",
    );
    expect(
      [...host.querySelectorAll("li")].filter((row) =>
        row.textContent?.includes("sample-savings-050505.pdf"),
      ),
    ).toHaveLength(1);
  });
});

describe("the first run's card", () => {
  it("links to setting up by hand, and says what is set up", async () => {
    await render({
      body: "Set up, no transactions yet: Sample Savings.",
      byHand: { label: "Set up by hand", to: "/setup" },
    });
    const link = [...host.querySelectorAll("a")].find(
      (one) => one.textContent === "Set up by hand",
    );
    expect(link?.getAttribute("href")).toBe("/setup");
    expect(host.textContent).toContain(
      "Set up, no transactions yet: Sample Savings.",
    );
    expect(host.querySelector("[data-dropzone]")).not.toBeNull();
  });
});

describe("removing a file", () => {
  it("takes it out of the inbox without importing it", async () => {
    batches = [BATCH];
    await render();
    const button = [...host.querySelectorAll("button")].find(
      (one) => one.textContent === "Remove",
    );
    if (!button) throw new Error("No Remove button");
    await act(async () => {
      button.click();
    });
    await settle();

    expect(removed).toEqual([BATCH.files[0].saved_path]);
    expect(host.textContent).not.toContain("sample-savings-050505.pdf");
    expect(doMyBooksButton()).toBeUndefined();
  });
});

describe("doMyBooksPrompt", () => {
  it("names the inbox and the run guide, and waits for go", () => {
    const prompt = doMyBooksPrompt([
      BATCH,
      { ...BATCH, batch: "2026-11-02T11-00-00-0505" },
    ]);

    expect(prompt).toMatch(
      /^Outcome: Turn the statements waiting in the statement inbox into books ready for me to add/,
    );
    expect(prompt).toContain("Statements: 2 files in the inbox.");
    expect(prompt).toContain("Follow `npx dbu6 docs run`.");
    expect(prompt).toContain(RUN_PLAN_FIRST_RULE);
    expect(prompt).not.toContain("post-to-journal");
  });
});
