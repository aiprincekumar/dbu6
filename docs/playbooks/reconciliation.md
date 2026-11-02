# A statement that doesn't continue from the books

## When

The importer refuses an account's statements with
`reconciliation_match_failed`: nothing in them lands on the last statement
balance in the books (`checkpoint_balance` on `checkpoint_date`).

## Read

- Around `checkpoint_date`: the balance the statement prints there, the
  user's transactions in the books on and just before it
  (`/api/reports/account-ledger`), and the statement's rows that day.

## Change

Find where the books and the statement part: a missing or wrong transaction
in the books, a statement in between that was never imported, or a statement
problem. Propose each change to the books; this playbook changes nothing on
its own, because the books here are posted entries.

## Never

- Change a posted entry without the user's yes, inside a run or out.
- Change a statement balance (`account_balance_assertion`).

## Report

- **What's wrong:** where the books and the statement part, and why.
- **The fix:** each change to the books, or the statement period to
  download.
- **Next:** ask whether to apply it.
