# Two statements that don't meet

## When

The importer refuses an account's statements with
`statement_boundary_mismatch`: one statement (`later_source`) doesn't start
(`later_opening`) where the earlier one (`earlier_source`) ends
(`earlier_closing`). `difference` is the gap. With `same-statement-twice`,
the same statement was dropped twice: leave one copy out.

## Read

- Both files, at the paths the prompt names or you uploaded from, and the
  parser's output for each.

## Change

Find the earlier file's last date and the later one's first, and whether rows
at those edges explain the difference or a statement between them is
missing. A misread edge row is a parser fix, with a sanitized fixture and
test. A missing statement changes nothing: its period is the answer.

## Never

- Fix the parser by loosening validation.
- Real names, account numbers, references or amounts in a fixture or test:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **What's wrong:** why the two files don't meet: a missing statement, with
  the period to download, or a misread row.
- **The fix:** what changed in the parser, if anything.
