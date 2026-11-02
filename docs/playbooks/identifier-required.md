# A statement that must name its account

## When

A file is `unresolved` because its institution has several accounts and the
parser emitted no account identifier, so the importer can't tell which
account the statement is for. The reply names the institution's accounts
(`candidate_account_names`).

## Read

- The file, at its `saved_path`, and its parser (`parser_path`).
- "Emitted account identifier" in `npx dbu6 docs parser-guide`.

## Change

Make the parser emit the account number the statement prints, as that
section says, with a sanitized fixture and test. Then import the file again.

If the statement prints no identifier, stop and tell the user: clearing an
account's identifiers (`update_account` with `"account_identifiers":[]`)
works only for an institution with one account.

## Never

- Guess an identifier.
- Fix the parser by loosening validation.
- Real names, account numbers, references or amounts in a fixture or test:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **Account number:** the number the statement prints, and the account it
  goes to.
- **The fix:** what changed in the parser.
