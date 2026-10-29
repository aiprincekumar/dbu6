import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appSettingNames,
  isAppSetting,
  withoutAppSettings,
} from "./app-settings.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAppSetting", () => {
  it("takes the app's prefixes, and nothing else", () => {
    for (const name of [
      "SAPPORTA_API_PORT",
      "BETTER_AUTH_SECRET",
      "SMTP_PASS",
      "NUABASE_API_KEY",
      "DBU6_ROOT",
    ]) {
      expect(isAppSetting(name)).toBe(true);
    }
    for (const name of ["PATH", "HOME", "SAMPLE_SAPPORTA_PORT"]) {
      expect(isAppSetting(name)).toBe(false);
    }
  });
});

describe("appSettingNames", () => {
  it("names the settings in the environment and those pointing at a project, once each", () => {
    vi.stubEnv("SMTP_HOST", "sample.example.com");
    vi.stubEnv("SAPPORTA_API_PORT", "50505");
    vi.stubEnv("SAMPLE_OTHER", "kept");

    const names = appSettingNames();

    expect(names).toEqual(
      expect.arrayContaining(["SMTP_HOST", "SAPPORTA_API_PORT", "DBU6_ROOT"]),
    );
    expect(names).not.toContain("SAMPLE_OTHER");
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("withoutAppSettings", () => {
  it("leaves out the app's settings and keeps the rest", () => {
    vi.stubEnv("SMTP_HOST", "sample.example.com");
    vi.stubEnv("SAMPLE_OTHER", "kept");

    const env = withoutAppSettings();

    expect(env).not.toHaveProperty("SMTP_HOST");
    expect(env.SAMPLE_OTHER).toBe("kept");
  });
});
