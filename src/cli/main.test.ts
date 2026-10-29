import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDir } from "../server/migrations.test.support.js";
import { packageDir } from "../server/paths.js";
import { main } from "./main.js";

let root: string;

beforeEach(() => {
  root = tempDir("main");
  writeFileSync(join(root, "package.json"), "{}\n");
  writeFileSync(join(root, ".env"), "SAPPORTA_DATA_DIR=elsewhere\n");
  vi.stubEnv("DBU6_ROOT", root);
  // Run from the project: DBU6_ROOT naming another one is refused.
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.stubEnv("SAPPORTA_DATA_DIR", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("a project with only the former .env", () => {
  it.each([
    ["setup"],
    ["dev"],
    ["start"],
    ["migrate"],
    ["check"],
    ["upgrade"],
    ["seed"],
    ["agent", "env"],
  ])(
    "stops `dbu6 %s` before it opens a database or writes a file",
    async (...args) => {
      expect(await main(args)).toBe(1);

      expect(console.error).toHaveBeenCalledWith(
        `${join(root, ".env")} is no longer read; rename it to .env.development.`,
      );
      expect(readdirSync(root).sort()).toEqual([".env", "package.json"]);
    },
  );

  it("runs once .env.development is there too", async () => {
    writeFileSync(join(root, ".env.development"), "");

    expect(await main(["agent"])).toBe(1);
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining("is no longer read"),
    );
  });
});

describe("--help", () => {
  it.each([
    ["migrate"],
    ["dev"],
    ["setup"],
    ["upgrade"],
    ["seed"],
    ["agent", "env"],
  ])("prints the usage for `dbu6 %s --help`, and does nothing else", async (...args) => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await main([...args, "--help"])).toBe(0);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("dbu6 <command>"),
    );
    expect(readdirSync(root).sort()).toEqual([".env", "package.json"]);
  });
});

describe("--version", () => {
  it("prints the installed dbu6's version", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { version } = JSON.parse(
      readFileSync(packageDir("package.json"), "utf8"),
    );

    expect(await main(["--version"])).toBe(0);

    expect(console.log).toHaveBeenCalledWith(version);
  });
});
