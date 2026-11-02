# A statement whose own balances don't add up

## When

The importer refuses an account's statements with `statement_part_invalid`:
one file (`part`) is inconsistent with itself; `detail` says how.

## Read

- The file, and the parser's output for it.

## Change

Compare the parser's opening, closing and running balances with the
statement's, and decide whether the bank's export or the parser is wrong. A
parser fix comes with a sanitized fixture and test. A wrong export is the
user's to download again.

## Never

- Fix the parser by loosening validation.
- Real names, account numbers, references or amounts in a fixture or test:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **What's wrong:** whether the bank's export or the parser is wrong, and
  where.
- **The fix:** what changed in the parser.
