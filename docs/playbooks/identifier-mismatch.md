# A statement for an account number no account lists

## When

A file is `unresolved` because the identifier its statement prints matches
none of its institution's accounts (`candidate_account_names`).

## Read

- `npx sapporta api get /api/import-presets`: the institution's accounts and
  their `account_identifiers`.

## Change

Ask the user which account it is, then change the import presets ("Import
presets" in `npx dbu6 docs books`):

- **A new account:** `add_account` to the institution with
  `"account_identifiers":["<the printed identifier>"]`. Ask its name, ledger
  account and whether it's a credit card.
- **One of the listed accounts, printed under another number:**
  `update_account` with its whole `account_identifiers` list plus this one.

Then import the file again.

## Never

- Change any other account.

## Report

- **Account:** the account the statement now goes to.
- **Import presets:** what changed in them.
