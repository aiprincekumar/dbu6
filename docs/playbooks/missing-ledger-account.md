# An import preset that names a deleted account

## When

The importer refuses an account's statements with
`import_account_not_found`: its import preset names a ledger account
(`failed_group.account_id`) that was deleted.

## Change

Ask the user whether to recreate the ledger account (its name, type and
parent) or import into another. Then point the preset at it in one batch
("Import presets" in `npx dbu6 docs books`): `remove_account` with the old
`account_id`, and `add_account` with the new id and the same other fields.
Then import again.

## Report

- **Account:** the ledger account it now imports into.
- **Import presets:** what changed in them.
