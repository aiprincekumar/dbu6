# A statement no saved parser reads

## When

A file's `status` is `unrecognized`: `POST /api/add-account/read` or
`/api/import-draft/statements/auto` found no saved parser that reads it. The
reply names the parsers that were tried and turned it down
(`candidate_parser_paths`; none means no parser takes that file type), and
keeps the file inside the project, at its `saved_path`.

In a run, a text file no parser reads is imported freeform instead, with
no parser: "Text files" in `npx dbu6 docs run`.

## Read

- The file, at its `saved_path`.
- `npx dbu6 docs parser-guide`, then `npx dbu6 docs parsers`.
- The parsers that turned it down.

## Change

1. Write the parser as `npx dbu6 docs parser-guide` and
   `npx dbu6 docs parsers` say, with its sanitized fixture and test.
   `npx dbu6 check` runs them.
2. List it on the bank's institution in the import presets ("Import presets"
   in `npx dbu6 docs books`): `add_parser` to the institution that covers
   this bank, or `add_institution`.
3. The account, by where the statement goes:
   - A bank or card being added (`/add`, or a run's new accounts): add no
     account. `POST /api/add-account/add` sets it up from the statements.
   - An account the books already have (`/import`): `add_account` with the
     identifier the parser emits, if the account isn't listed.
4. Read the file again: your parser alone reads it.

Ask the user the bank when the file doesn't say, and, for an `add_account`,
the account, its ledger account and whether it is a credit card.

## Never

- Real names, account numbers, references or amounts in any file you write:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **The parser:** what the statement is, and what the parser reads from it:
  date range, row count, opening and closing balance.
- **Import presets:** what changed in them.
