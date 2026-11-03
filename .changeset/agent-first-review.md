---
"@dbu6/app": minor
---

Review's list now opens on what is left across every account: counts of
transactions that need an account, possible duplicates, failing balance
checks, accounts going in with one that isn't ready, and rule requests, with one
**Fix these** button that hands all of it to the coding agent as a run
starting at the run guide's "Starting from the drafts" section, whose
survey reads what is left; the prompt holds no copy of the counts. Beside it,
**Add N entries from K accounts to my books** adds every account that can
go in, in one transaction, and then lists what it added and what it left,
and why. An account's Overview has the same **Fix these**, naming that
account, which the section then keeps to, while it has a block, or rule
requests; the notice after an import points to it. Adding one account at a
time stays.

`POST /api/draft-transactions/post-ready` `{ base_account_ids }` is the
new endpoint behind it, answering
`{ posted: [{ account_id, name, drafts_posted }], left: [{ account_id, name, block }], first_post }`.
It posts only the accounts named, those nothing of their own blocks whose
balance checks pass counting the drafts of the others going in, all in one
transaction; an account with no drafts left is neither added nor left; an
id not in the books is refused with 404 and nothing posted. It is the person's
button: the agent never calls it. `GET /api/review/accounts` and
`/api/review/accounts/:accountId` now count each account's
`rule_requests`, and `POST /api/draft-transactions/post-to-journal`
answers `first_post`: whether the books held nothing but opening balances
before it.

"Your books are set up." now follows from the books: an Add all from
books holding only opening balances puts the first run in Review's URL
(`?run=setup`), as the by-hand first run does, and the list emptied on it
ends the run, however many Add alls that takes. Review's empty states and the end of a post lead to
Update ("Update your books"), with importing by hand a small link.
