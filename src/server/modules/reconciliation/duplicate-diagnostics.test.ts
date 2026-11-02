import { describe, expect, it } from "vitest";
import {
  findDuplicateDiagnostics,
  TRANSFER_MATCH_DAYS,
  type DuplicateDraftSourceRow,
  type DuplicateJournalEntrySourceRow,
} from "./duplicate-diagnostics.js";

const draft = (
  overrides: Partial<DuplicateDraftSourceRow> = {},
): DuplicateDraftSourceRow => ({
  draft_id: 1,
  date: "2026-05-07",
  narration: "Merchant",
  withdrawal: 125.5,
  deposit: 0,
  account_id: 2,
  base_account_id: 10,
  source_reference: null,
  source_transaction_key: null,
  base_account: "StanC Credit Card",
  draft_account: "Software",
  ...overrides,
});

describe("findDuplicateDiagnostics", () => {
  it("reports draft-draft duplicates even when their accounts differ", () => {
    const rows = findDuplicateDiagnostics(
      [
        draft(),
        draft({
          draft_id: 2,
          account_id: 3,
          draft_account: "Office",
        }),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      match_kind: "draft-draft",
      match_type: "legacy-draft",
      draft_id: 1,
      other_draft_id: 2,
      draft_account: "Software",
      matched_account: "Office",
    });
  });

  it("reports a grouped journal match through its itemized leg", () => {
    const entries: DuplicateJournalEntrySourceRow[] = [
      {
        journal_id: 20,
        date: "2026-05-07",
        journal_description: "Expenses",
        entry_id: 201,
        account_id: 2,
        debit: 125.5,
        credit: 0,
        source_narration: "Merchant",
        comment: null,
        source_reference: null,
        source_transaction_key: null,
        account: "Software",
      },
      {
        journal_id: 20,
        date: "2026-05-07",
        journal_description: "Expenses",
        entry_id: 202,
        account_id: 3,
        debit: 50,
        credit: 0,
        source_narration: "Other",
        comment: null,
        source_reference: null,
        source_transaction_key: null,
        account: "Office",
      },
      {
        journal_id: 20,
        date: "2026-05-07",
        journal_description: "Expenses",
        entry_id: 203,
        account_id: 10,
        debit: 0,
        credit: 175.5,
        source_narration: null,
        comment: null,
        source_reference: null,
        source_transaction_key: null,
        account: "StanC Credit Card",
      },
    ];
    expect(findDuplicateDiagnostics([draft()], entries)[0]).toMatchObject({
      match_kind: "draft-journal",
      match_type: "itemized-journal-leg",
      matched_journal_id: 20,
      matched_journal_entry_id: 201,
    });
  });
});

describe("a transfer on two statements", () => {
  // Sample Savings (20) paid Sample Card (10) 1,000; the card's statement
  // has the payment as money in.
  const bankSide = (
    overrides: Partial<DuplicateDraftSourceRow> = {},
  ): DuplicateDraftSourceRow =>
    draft({
      draft_id: 100,
      date: "2026-05-05",
      narration: "NOPII card payment",
      withdrawal: 1000,
      deposit: 0,
      account_id: 10,
      base_account_id: 20,
      base_account: "Sample Savings",
      draft_account: "Sample Card",
      ...overrides,
    });
  const cardSide = (
    overrides: Partial<DuplicateDraftSourceRow> = {},
  ): DuplicateDraftSourceRow =>
    draft({
      draft_id: 200,
      date: "2026-05-07",
      narration: "NOPII payment received",
      withdrawal: 0,
      deposit: 1000,
      account_id: null,
      base_account_id: 10,
      base_account: "Sample Card",
      draft_account: null,
      ...overrides,
    });

  it("matches the card's draft with the bank's draft categorized to the card", () => {
    expect(findDuplicateDiagnostics([bankSide(), cardSide()], [])).toEqual([
      expect.objectContaining({
        match_kind: "draft-transfer",
        match_type: "other-statement-transfer",
        base_account_id: 10,
        draft_id: 200,
        other_draft_id: 100,
        direction: "deposit",
        amount: 1000,
        matched_account_id: 20,
        matched_account: "Sample Savings",
      }),
    ]);
  });

  it("flags both sides when each is categorized to the other account", () => {
    const rows = findDuplicateDiagnostics(
      [
        bankSide(),
        cardSide({ account_id: 20, draft_account: "Sample Savings" }),
      ],
      [],
    );
    expect(rows.map((row) => [row.base_account_id, row.draft_id])).toEqual(
      expect.arrayContaining([
        [10, 200],
        [20, 100],
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it(`needs the same amount, the other way, at most ${TRANSFER_MATCH_DAYS} days apart`, () => {
    expect(
      findDuplicateDiagnostics([bankSide(), cardSide({ deposit: 999 })], []),
    ).toEqual([]);
    expect(
      findDuplicateDiagnostics(
        [bankSide(), cardSide({ deposit: 0, withdrawal: 1000 })],
        [],
      ),
    ).toEqual([]);
    expect(
      findDuplicateDiagnostics(
        [bankSide(), cardSide({ date: "2026-05-09" })],
        [],
      ),
    ).toEqual([]);
  });

  it("pairs each draft once, the nearest in date first", () => {
    const rows = findDuplicateDiagnostics(
      [
        bankSide(),
        bankSide({ draft_id: 101, date: "2026-05-06" }),
        cardSide(),
        cardSide({ draft_id: 201, date: "2026-05-05" }),
      ],
      [],
    );
    expect(
      rows.map((row) => [row.draft_id, row.other_draft_id]).sort(),
    ).toEqual([
      [200, 101],
      [201, 100],
    ]);
  });
});
