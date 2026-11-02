# A card statement with no closing balance read

## When

The importer refuses a card's statements with `closing_balance_unavailable`:
the parser reads no closing balance from them, and a card needs one.

## Read

- The file, and the parser's output for it.
- `abacus.ledger_balance` in `npx dbu6 docs parser-guide`.

## Change

If the statement prints a total amount due or a closing balance, make the
parser emit it as `closing` through `abacus.ledger_balance`, with a sanitized
fixture and test.

If it prints none, stop and tell the user what it prints about the amount
owed.

## Never

- Fix the parser by loosening validation.
- Real names, account numbers, references or amounts in a fixture or test:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **Closing balance:** the one the statement prints, or what it prints
  instead.
- **The fix:** what changed in the parser.
