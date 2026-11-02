# Possible duplicates in Review

## When

An account's drafts have possible duplicates: a draft that looks like
another draft of the same account, like a transaction already in the books
on that account, or like another account's draft categorized to this one
(the same transfer on both statements). Review's Duplicates tab lists them,
and so does
`npx sapporta api get /api/reports/duplicate-drafts --query '{"base_account_id":<id>}'`:
each with the draft, what it matched, and how (`match_kind`, `match_type`,
`confidence`). A `draft-transfer` match (`other-statement-transfer`) is
another account's draft (`other_draft_id`, from `matched_account`'s
statement) categorized to this account: the same amount the other way, a
few days apart.

## Read

- "Is this a duplicate?" in `npx dbu6 docs books`.
- Both rows of each pair: their dates, amounts, descriptions, and which
  statement each came from (`source_transaction_key`, `source_reference`).

## Change

For each pair, find out whether the two are one real transaction or two.
Two real transactions on the same day for the same amount happen (two
coffees); the statement's own rows and references settle it.

One transaction counted twice: delete the extra draft. A `draft-transfer`
pair is settled instead, as the `cross-account-transfers` playbook says.

## Never

- Delete a day's last draft without first moving its balance onto the day's
  new last draft.
- Delete or change a transaction already in the books without the user's
  yes.

## Report

- **Verdict:** for each pair, one transaction or two, and why, in a few
  words.
- **The fix:** the drafts to delete, each by date, description and amount.
