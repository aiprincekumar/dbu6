# A statement more than one saved parser reads

## When

A file's `status` is `ambiguous`: more than one saved parser reads it
(`matching_parser_paths`). The reply keeps the file inside the project, at
its `saved_path`.

## Read

- The file, at its `saved_path`, and each matching parser with its fixtures.
- `npx dbu6 docs parsers`, on fingerprints.

## Change

Tighten the parsers' fingerprints so each rejects the other's layout at its
first structural check, with a `parser_test.py` case in each that rejects the
other's fixture. Then read the file again: one parser reads it.

## Never

- Loosen any validation, or let a fixture stop passing.
- Real names, account numbers, references or amounts in a fixture or test:
  use the `050505` / `NOPII` / `sample` conventions in `npx dbu6 docs parsers`.

## Report

- **Which parser reads it:** the parser that now reads the file, and what
  tells the two layouts apart.
- **The fix:** what changed in each parser.
