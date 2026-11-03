# Possible duplicates in Review

## When

An account's drafts have possible duplicates: a draft that looks like
another draft of the same account, or like a transaction already in the
books on that account. Review's Duplicates tab lists them, and so does
`npx sapporta api get /api/reports/duplicate-drafts --query '{"base_account_id":<id>}'`:
each with the draft, what it matched, and how (`match_kind`, `match_type`,
`confidence`).

A transfer that both statements carry is not listed here: it shows up as a
failing balance check, which the `double-counted-transfers` playbook
starts from.

## Read

- "Is this a duplicate?" in `npx dbu6 docs books`.
- Both rows of each pair: their dates, amounts, descriptions, and which
  statement each came from (`source_transaction_key`, `source_reference`).

## Change

For each pair, find out whether the two are one real transaction or two.
Two real transactions on the same day for the same amount happen (two
coffees); the statement's own rows and references settle it.

One transaction counted twice: delete the extra draft.

## Never

- Delete or change a transaction already in the books without the user's
  yes.

## Report

- **Verdict:** for each pair, one transaction or two, and why, in a few
  words.
- **The fix:** the drafts to delete, each by date, description and amount.
