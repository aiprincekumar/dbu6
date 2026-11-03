import { describe, expect, it } from "vitest";
import {
  AgentEnvError,
  agentEnvExports,
  chooseAgentAccount,
  VERIFY_COMMAND,
  type AgentAccount,
} from "./agent-env.js";

const OWNER: AgentAccount = {
  userId: "05050500-owner",
  email: "owner@example.com",
  name: "NOPII OWNER",
  organizationId: "05050500-org",
  organizationName: "NOPII OWNER's Workspace",
};

const VALUES = { apiToken: "spat_05050500_050505" };

describe("agentEnvExports", () => {
  it("prints the token's export line, for a shell to eval", () => {
    expect(agentEnvExports(VALUES)).toBe(
      `export SAPPORTA_API_TOKEN=${VALUES.apiToken}\n`,
    );
  });

  it("quotes a value a shell would otherwise split or expand", () => {
    expect(agentEnvExports({ apiToken: "a b$c" })).toBe(
      "export SAPPORTA_API_TOKEN='a b$c'\n",
    );
  });
});

describe("the command agents are told to verify with", () => {
  it("reads the auth context, through the project's own sapporta bin", () => {
    expect(VERIFY_COMMAND).toBe("npx sapporta api get /api/auth-context");
  });
});

describe("chooseAgentAccount", () => {
  it("takes the one account, with no question asked", () => {
    expect(chooseAgentAccount([OWNER])).toEqual(OWNER);
  });

  it("asks which account when there are two, naming both emails", () => {
    const second = {
      ...OWNER,
      userId: "05050500-two",
      email: "two@example.com",
    };

    expect(() => chooseAgentAccount([OWNER, second])).toThrow(/--user <email>/);
    try {
      chooseAgentAccount([OWNER, second]);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain(OWNER.email);
      expect(message).toContain(second.email);
    }
  });

  it("picks by email when --user names one", () => {
    const second = {
      ...OWNER,
      userId: "05050500-two",
      email: "two@example.com",
    };

    expect(
      chooseAgentAccount([OWNER, second], { user: "two@example.com" }),
    ).toEqual(second);
  });

  it("asks which workspace when one email is in two, and takes the user id", () => {
    const other = {
      ...OWNER,
      userId: "05050500-other-org",
      organizationId: "05050500-org-2",
      organizationName: "NOPII OWNER's Other Workspace",
    };

    expect(() =>
      chooseAgentAccount([OWNER, other], { user: OWNER.email }),
    ).toThrow(/more than one workspace/);
    try {
      chooseAgentAccount([OWNER, other], { user: OWNER.email });
    } catch (error) {
      const message = (error as Error).message;
      // Both workspaces named, each with the user id that chooses it.
      expect(message).toContain("NOPII OWNER's Workspace");
      expect(message).toContain("NOPII OWNER's Other Workspace");
      expect(message).toContain(OWNER.userId);
      expect(message).toContain(other.userId);
    }

    expect(chooseAgentAccount([OWNER, other], { user: other.userId })).toEqual(
      other,
    );
  });

  it("offers the user id when the project's accounts share an email", () => {
    const other = {
      ...OWNER,
      userId: "05050500-other-org",
      organizationId: "05050500-org-2",
      organizationName: "NOPII OWNER's Other Workspace",
    };

    expect(() => chooseAgentAccount([OWNER, other])).toThrow(/user id/);
  });

  it("says who is here when --user names nobody", () => {
    expect(() =>
      chooseAgentAccount([OWNER], { user: "nobody@example.com" }),
    ).toThrow(/owner@example\.com/);
  });

  it("tells a project with no account to sign up first", () => {
    expect(() => chooseAgentAccount([])).toThrow(AgentEnvError);
    expect(() => chooseAgentAccount([])).toThrow(/sign up/i);
  });
});
