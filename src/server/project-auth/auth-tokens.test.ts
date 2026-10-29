import type { ProjectDbConnection } from "@sapporta/server";
import { describe, expect, it } from "vitest";
import {
  requestUsesToken,
  resolveBearerTokenPrincipal,
} from "./auth-tokens.js";

function headers(authorization?: string): Headers {
  return new Headers(
    authorization === undefined ? {} : { Authorization: authorization },
  );
}

describe("requestUsesToken", () => {
  it("is a session's request when no Authorization header is sent", () => {
    expect(requestUsesToken(headers())).toBe(false);
  });

  it("is a session's request when the header is empty", () => {
    expect(requestUsesToken(headers(""))).toBe(false);
  });

  it("is a token request for any header with a value, well-formed or not", () => {
    expect(requestUsesToken(headers("Bearer spat_05050500_050505"))).toBe(
      true,
    );
    expect(requestUsesToken(headers("Basic sample"))).toBe(true);
  });
});

describe("resolveBearerTokenPrincipal", () => {
  // Nothing is read for a request that carries no token, so no database.
  const conn = {} as ProjectDbConnection;

  it("leaves a request with an empty header to the session", () => {
    expect(resolveBearerTokenPrincipal(conn, headers(""))).toBeNull();
    expect(resolveBearerTokenPrincipal(conn, headers())).toBeNull();
  });
});
