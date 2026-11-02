# Two statements that disagree about a day

## When

The importer refuses an account's statements with `statement_disagreement`:
two of them (`parts`) cover the same `date` and list it differently; `row` is
the first row that differs.

## Read

- Each file's rows on that date, from the parser's output and from the file.

## Change

Find which file is right. A misread row is a parser fix, with a sanitized
fixture and test; otherwise leave the wrong file out.

If both are right, the importer should accept them, which is a change to
dbu6 itself: tell the user, and don't patch it in the project.

## Never

- Edit `node_modules/@dbu6/app`.
- Fix the parser by loosening validation.
- Real names, account numbers, references or amounts in a fixture or test:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **What's wrong:** which file is right, and why the other differs.
- **The fix:** what changed in the parser, or which file to leave out.
