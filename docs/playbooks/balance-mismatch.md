# A statement whose rows don't add up to its balances

## When

The importer refuses an account's statements with `balance_mismatch` (the
rows add up to `computed_final`, the statement closes at
`statement_closing`; `suspected_gap` when a period looks missing, and
sometimes a `hint`) or `segment_balance_mismatch` (from the balance printed
on `from_date`, the rows lead to `walked` on `to_date`, where the statement
prints `printed`). `difference` is the gap.

## Read

- The account's files, at the paths the prompt names or you uploaded from,
  and the parser's output for each (`npx dbu6 parser run <name> <file>`).

## Change

Compare the parser's output with the statement: the opening, the closing,
every printed running balance, and whether the files cover the period with
no gap. A misread row is a parser fix, with a sanitized fixture and test.

If a period is missing, change nothing: the dates of the missing statement
are the answer. The user downloads it.

## Never

- Fix the parser by loosening validation.
- Real names, account numbers, references or amounts in a fixture or test:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **What's wrong:** why the balances don't add up, in one sentence.
- **The fix:** what changed in the parser, or the dates of the missing
  statement.
