---
"@dbu6/app": patch
---

Adding drafts to the books never leaves a balance check in the books
failing. When two accounts each end a day on a transfer to the other, no
order of their entries can meet both statements' balances, though each
account's drafts pass their checks: Add, Add all and their endpoints
(`POST /api/draft-transactions/post-to-journal`, `/post-ready`) now refuse
that with 422 `POSTED_CHECKS_WOULD_FAIL`, naming the account, and add
nothing. Before, Add all added them and Reconciliation Differences then
showed a check no fix could clear.
