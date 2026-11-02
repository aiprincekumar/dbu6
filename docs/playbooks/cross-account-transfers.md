# Transfers between the user's own accounts

## When

Money moved between two of the user's accounts that both have statements: a
transfer from savings to another bank, a card bill paid from a bank account.
Each statement carries its own side, so the same movement arrives twice:
once on each account's drafts.

## Read

- Each account's Duplicates and Balance checks
  (`npx sapporta api get /api/review/accounts/<id>`). A draft sent to
  another account counts on that account's balance checks too, so a transfer
  both statements carry fails them by its amount, and Duplicates lists the
  pair as `match_kind` `draft-transfer`: the same amount the other way, a few
  days apart.

## Change

1. Send one side to the other account, as categorizing does: the paying
   account's draft to the account paid.
2. Settle each pair Duplicates lists:
   `npx sapporta api post /api/draft-transactions/settle-transfer --body '{"draft_ids":[<draft_id>,<other_draft_id>]}'`.
   The transfer becomes one draft, dated the earlier day, sent to the other
   account; the other draft is deleted, and the balances its statement
   printed before the money arrived are cleared. A 422 means the two aren't
   one transfer.
3. The account whose draft was deleted now counts the other account's
   draft, so it goes into the books after that account; Review adds them in
   that order, so name none.

When the other side is already in the books, from the other account's
statement, the draft is just an extra copy: delete it, as the `duplicates`
playbook says.

A transfer whose other side is in no statement (cash, a loan) is
categorized to that account and kept; there is nothing to settle.

## Never

- Delete a draft of a transfer by hand when its other side is still a draft:
  settle the pair.

## Report

- **Transfers:** each pair settled, by date, amount and the two accounts.
