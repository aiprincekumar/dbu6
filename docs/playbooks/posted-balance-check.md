# A balance check in the books that stopped matching

## When

A statement balance already in the books (`account_balance_assertion` on a
posted entry) no longer matches: the running total of the account's posted
entries misses it. It matched when the statement was added, so something in
the books changed since, or was never right.

- The Reconciliation Differences report (`/reports/balance-assertions`)
  lists every one: `npx sapporta api get /api/reports/balance-assertions`
  gives the account, date, journal, the books' running balance, the
  statement's balance and `diff` (books minus statement).
- `npx sapporta api get /api/home` counts them per account
  (`statement_differences`).
- Last Reconciled Balances (`/api/reports/last-reconciled`) gives each
  account's last statement balance in the books, and its date.

Failing checks on drafts are the `balance-checks` playbook; a statement the
importer refuses because it doesn't continue from the books is
`reconciliation`.

## Read

- The failing rows for the account, oldest first. Start from the first
  failing day; later ones usually follow from it.
- The account's posted entries around that day, with the running total and
  when each row was written. Replace `<id>`, `<from>` and `<to>`:

  ```sql
  SELECT * FROM (
    SELECT j.date, j.id AS journal_id, je.id AS entry_id,
           je.debit - je.credit AS delta,
           je.account_balance_assertion AS assertion,
           ROUND(SUM(je.debit - je.credit) OVER (
             ORDER BY j.date, j.id, je.id ROWS UNBOUNDED PRECEDING), 2) AS running,
           je.created_at, je.updated_at, je.source_transaction_key,
           COALESCE(je.comment, je.source_narration, j.description) AS text
    FROM journal_entries je JOIN journals j ON j.id = je.journal_id
    WHERE je.account_id = <id>
  ) WHERE date BETWEEN '<from>' AND '<to>';
  ```

  (`sqlite3 -readonly`, as "Reading the database" in `npx dbu6 docs books`
  says, filtered by the owner when the file holds more than one user.)
- The account's opening entry: `npx sapporta api get /api/opening-balances`,
  its `opening` and `implied_opening`.

## Change

Find which of these it is, from the evidence:

- **An entry edited after its statement:** its `updated_at` is later than
  the statement's import, its amount or its account changed, and `diff`
  equals the change. A transfer or card payment moved to or from this
  account moves its balance. Propose putting it back, or ask what the edit
  meant.
- **An entry added later,** by hand or from another account's statement,
  dated inside a statement's period: `created_at` after the entries around
  it, `diff` equal to its amount. When the statement already carries it,
  it is a duplicate (next).
- **A duplicate in the books:** the same transaction twice, from two
  imports or from both statements of a transfer. Two entries with one
  `source_transaction_key`, or the same amount the other way a few days
  apart on the other account. Propose removing the copy whose line carries
  no statement balance, as "Undo that" in the books guide says.
- **A statement missing between two checks:** `diff` appears on one check
  and stays the same after it, with no entry to explain it. Name the
  period; the user downloads it, and its transactions are entered by hand
  with their yes, or the user says what they were.
- **A wrong opening balance:** the same `diff` from the very first check.
  Propose the amount `implied_opening` gives: `PUT /api/opening-balances/<account id>`
  while `opening.locked` is `null`, else the account's line and the Equity
  line in its journal, which moves every later check.

Propose each change as date, description, amount, and what it becomes, and
the checks it makes pass. Every change here is to entries in the books: each
one needs the user's yes, inside a run or out. Make it, then read the report
again.

## Never

- Change a statement balance (`account_balance_assertion`) to make a check
  pass.
- Delete an entry just to make a check pass.
- Delete a line that carries a day's statement balance without first moving
  the balance onto that day's previous entry.
- Write SQLite.

## Report

- **What's wrong:** why the books miss the statement from that day, in one
  sentence.
- **The fix:** each change as date, description, amount, and what it
  becomes, or the statement period to download.
- **After the fix:** the account's failing checks, before and after, and
  anything still unexplained.
- **Next:** ask whether to apply what is still proposed.
