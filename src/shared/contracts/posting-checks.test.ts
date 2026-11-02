import { describe, expect, it } from "vitest";
import { readyToAdd, type PostingInputs } from "./posting-checks.js";

/*
 * Which accounts Review's Add all can add: those nothing blocks, and those
 * waiting only for accounts it adds first, in an order they can be added in.
 */

type Account = PostingInputs & { account_id: number };

function account(
  account_id: number,
  overrides: Partial<PostingInputs> = {},
): Account {
  return {
    account_id,
    drafts: 10,
    uncategorised: 0,
    duplicates: 0,
    balance_checks: 2,
    failing_checks: 0,
    add_first: [],
    ...overrides,
  };
}

const waitsFor = (...ids: number[]) => ({
  add_first: ids.map((id) => ({ account_id: id, name: `Sample ${id}` })),
});
const ids = (accounts: readonly Account[]) =>
  accounts.map((one) => one.account_id);

describe("readyToAdd", () => {
  it("follows a chain of waits, each after the account it waits for", () => {
    const accounts = [
      account(3, waitsFor(2)),
      account(2, waitsFor(1)),
      account(1),
      account(4, { uncategorised: 1 }),
    ];
    expect(ids(readyToAdd(accounts))).toEqual([1, 2, 3]);
  });

  it("leaves an account with no drafts left: there is nothing to add", () => {
    expect(ids(readyToAdd([account(1), account(2, { drafts: 0 })]))).toEqual([
      1,
    ]);
  });

  it("adds two accounts whose checks rely on each other, as the status shows them: waiting for neither", () => {
    // The draft status drops a wait that would close a cycle, so neither
    // names the other.
    expect(ids(readyToAdd([account(1), account(2)]))).toEqual([1, 2]);
  });

  it("leaves accounts that wait for each other, which no order can add", () => {
    const accounts = [account(1, waitsFor(2)), account(2, waitsFor(1))];
    expect(readyToAdd(accounts)).toEqual([]);
  });

  it("leaves an account whose account to add first has a problem, or isn't in the set", () => {
    const accounts = [
      account(1, { failing_checks: 1 }),
      account(2, waitsFor(1)),
      account(3, waitsFor(9)),
      account(4, { duplicates: 2 }),
      account(5),
    ];
    expect(ids(readyToAdd(accounts))).toEqual([5]);
  });

  it("leaves an account whose checks fail, whatever it waits for", () => {
    const accounts = [
      account(1),
      account(2, { ...waitsFor(1), failing_checks: 1 }),
    ];
    expect(ids(readyToAdd(accounts))).toEqual([1]);
  });
});
