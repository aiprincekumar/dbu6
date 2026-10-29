import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDir } from "../server/migrations.test.support.js";
import { projectRoot } from "../server/paths.js";
import {
  devFolder,
  envFile,
  formerEnvFileProblem,
  resolveProjectRoot,
} from "./project.js";

let root: string;

beforeEach(() => {
  root = tempDir("project");
  vi.stubEnv("SAPPORTA_DATA_DIR", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("resolveProjectRoot", () => {
  beforeEach(() => {
    writeFileSync(join(root, "package.json"), "{}\n");
    mkdirSync(join(root, "reports"));
    vi.stubEnv("DBU6_ROOT", "");
  });

  it("is the nearest folder with a package.json, kept in the process only", () => {
    expect(resolveProjectRoot(join(root, "reports"))).toBe(root);
    expect(projectRoot()).toBe(root);
    expect(process.env.DBU6_ROOT).toBe("");
  });

  it("takes a DBU6_ROOT naming the project it is run in", () => {
    vi.stubEnv("DBU6_ROOT", root);

    expect(resolveProjectRoot(join(root, "reports"))).toBe(root);
  });

  it("refuses a DBU6_ROOT naming another project than the one it is run in", () => {
    const other = tempDir("other-project");
    vi.stubEnv("DBU6_ROOT", other);
    try {
      expect(() => resolveProjectRoot(root)).toThrow(
        `DBU6_ROOT names ${other}, but the working directory is in the project ${root}.`,
      );
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("takes DBU6_ROOT from a folder outside every project", () => {
    const outside = tempDir("outside");
    vi.stubEnv("DBU6_ROOT", root);
    try {
      expect(resolveProjectRoot(outside)).toBe(root);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("devFolder", () => {
  it("takes a folder holding only hidden files for an empty one", () => {
    writeFileSync(join(root, ".DS_Store"), "");
    mkdirSync(join(root, ".git"));

    expect(devFolder(root)).toBe("empty");
  });

  it("refuses a folder with files but no database, and creates nothing", () => {
    writeFileSync(join(root, "package.json"), "{}\n");

    expect(() => devFolder(root)).toThrow(/creates nothing here/);
    expect(readdirSync(root)).toEqual(["package.json"]);
  });

  it("takes a folder with a database for a project", () => {
    mkdirSync(join(root, "data"));
    writeFileSync(join(root, "data", "sqlite.db"), "");

    expect(devFolder(root)).toBe("project");
  });
});

describe("envFile", () => {
  it("is Sapporta's .env.development, where its CLI looks for the port", () => {
    expect(envFile(root)).toBe(join(root, ".env.development"));
  });
});

describe("formerEnvFileProblem", () => {
  it("names a .env left without .env.development", () => {
    writeFileSync(join(root, ".env"), "");

    expect(formerEnvFileProblem(root)).toMatch(
      /rename it to \.env\.development/,
    );
  });

  it("has nothing to say once .env.development exists, or with neither file", () => {
    expect(formerEnvFileProblem(root)).toBeNull();
    writeFileSync(join(root, ".env"), "");
    writeFileSync(join(root, ".env.development"), "");
    expect(formerEnvFileProblem(root)).toBeNull();
  });
});
