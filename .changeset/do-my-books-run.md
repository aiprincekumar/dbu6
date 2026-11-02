---
"@dbu6/app": minor
---

One agent session can now do the books from a pile of statements. Drop every
statement on Update and press **Do my books**: the
files are saved under `tmp/statement-inbox/` (`/api/statement-inbox`) and
listed, each with **Remove**, and the coding agent follows
`npx dbu6 docs run`, which surveys them, writes parsers, adds the banks and
cards, imports, categorizes across accounts with
one round of questions, settles duplicates and balance checks, and stops
with every account ready to add on Review. In a run the agent never adds to
the books: the person does, account by account. Each problem's method is now a playbook (`npx dbu6 docs playbook`),
which the app's agent buttons and the run share. A project made before this
release can add the line its new `AGENTS.md` has: "When the person asks you
to do their books, or points you at their statements, follow
`npx dbu6 docs run`."

A transfer or card payment that both statements carry is now caught while
both sides are still drafts. A draft sent to another account counts on that
account's balance checks, so the transfer counted twice fails them, and
Duplicates lists the pair. `POST /api/draft-transactions/settle-transfer`
settles it into one draft, dated the earlier day: the later draft is
deleted, its day's balance moved onto that day's last draft, and its
account's statement balances between the two dates are cleared. An account
whose checks count another account's drafts waits until that account is
added (`ADD_OTHER_ACCOUNT_FIRST`), and Review says "Add <account> first".
Because the balance checks now count those drafts, the opening balance
Settings › Opening balances suggests can change for an account with
transfers.

`/add-account/read`, `/add-account/add` and `/import-draft/statements/auto`
also take statements waiting in the inbox by path (`inbox_files`, repeated),
read where they are rather than copied; an add or import that puts them in
the drafts removes them from the inbox. A path outside the inbox is refused
with `not_in_inbox`.

The first run's card, on Overview and Update while the books have no chart
or nothing imported, is now **Do my books**. Setting up by hand is a link on
it: **Set up by hand** (`/setup`), or **Add a bank or card** (`/add`) once
the chart is there.
