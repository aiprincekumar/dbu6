---
"@dbu6/app": minor
---

`GET /api/accounts/:id/activity` lists an account's running balance, a row
per posted entry, other statement's draft and own draft, in the order its
balance checks add them up, with each statement balance and its difference.
`from` and `to` narrow the rows; `posted_only=true` counts posted entries
alone, as Reconciliation Differences does. The books guide and the
balance-check playbooks use it in place of the SQL they carried.
