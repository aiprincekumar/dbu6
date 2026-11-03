---
"@dbu6/app": minor
---

The guides now lead with the run. README, Getting started, Importing
statements and Your books start from dropping statements on Update and
pressing **Do my books**: your coding agent sets up, imports and
categorizes, asks only what it can't settle, in one round in the terminal,
and you add the entries on Review. The screen-by-screen path is kept under
"By hand".

For your coding agent, `npx dbu6 docs run` has more ways in than a pile of
new statements, listed under "Entries":

- **Starting from the drafts:** no new files. The agent surveys Review
  (`GET /api/review/accounts`, now with each account's `rule_requests`),
  encodes your rule requests first, then categorizes, cleans up, asks one
  round of questions and reports. Files waiting in the inbox are named, not
  imported, unless you say so.
- **Accounts with no statements:** on a first run the question round asks
  what your cash, deposits, investments and loans held when the books
  start, creates any account the chart lacks, and posts each opening
  balance on your yes. The run's report no longer sends you to `/add/other`.
- Two new playbooks: `posted-balance-check`, for a balance check in the
  books that stopped matching (Reconciliation Differences), and
  `chart-change`, for renaming, moving, merging or splitting accounts with
  their entries.

The run's report now sends you to Review to add every ready account
together, and lists each account that isn't ready with why. The agent never
adds drafts to the books, inside a run or outside one: `DBU6-BOOKS.md` no
longer has it call `post-to-journal` on a yes, and the run guide lists both
posting endpoints under "Never". The only entries it records are opening
balances: those the statements give, as before, and those you give it for
accounts with no statements.

`DBU6-BOOKS.md` no longer sends the person to a screen for work the agent
can do: the agent adds a new bank or card from the statements named or
waiting in the inbox, posts a suggested opening balance on a yes, and takes
a refused statement to its playbook. Its screen links list the drop on
Update first.

A project made before this release can add the lines its new `AGENTS.md`
has, under "Before you start": that the run's "Entries" list where else a
run starts, that drafts are added by the person on Review unless they ask
the agent to add them, and
"Ask your questions in one round in the terminal."
