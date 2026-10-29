---
"@dbu6/app": minor
---

Settings › Opening balances says "From account statement" only while a
recorded opening is the balance its first balance check implies, and
"Manually recorded" otherwise. That now holds for any asset or liability
with balance checks, not only a bank or card from an import preset, and a
bank or card whose statements print no balance reads "Manually recorded".

`GET /opening-balances` replaces `suggested_amount` with `implied_opening`:
the opening the first balance check implies, counting what is posted and
what is in drafts before it. It no longer turns null once something is
posted, so the Settings dialog and /add/other prefill it for an account with
posted entries and no opening, and drafts dated before a posted check count
in it. Each recorded `opening` carries `source`: `"statement"` or
`"manual"`.
