# A statement whose account isn't set up

## When

A file is `unresolved` (`auto_import_files_unresolved` from
`/api/import-draft/statements/auto`) because the account it goes to isn't in
the import presets: no institution lists its parser, or the one that does has
no accounts. The file names its `parser_path`, its `institution_name` (null
when none lists the parser) and the `account` identifier the statement
printed, if any.

For a bank or card new to the books, `POST /api/add-account/add` sets the
account up and imports in one go, and is the better road. This playbook is
for a statement that has to go through `/import`.

## Read

- `npx sapporta api get /api/import-presets`: the institutions, and how the
  other accounts are set up.

## Change

In the import presets ("Import presets" in `npx dbu6 docs books`), in one
batch:

1. With no institution listing the parser: `add_parser` to the institution
   that covers this bank, or `add_institution` with
   `"parsers":["<parser>"]`.
2. `add_account` to that institution, with `account_identifiers`
   `["<the printed identifier>"]`; when the statement prints none, leave it
   empty unless the statement prints one the parser should emit.

Ask the user the account's name, ledger account, whether it's a credit card
and its `custom_mappings_filenames` when the other accounts don't show them.
Then import the file again.

## Report

- **Account:** the account the statement now goes to.
- **Import presets:** what changed in them.
