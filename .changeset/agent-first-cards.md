---
"@dbu6/app": minor
---

Three more screens hand their job to the coding agent first, each keeping
its by-hand way beside it.

- **Accounts** leads its toolbar with **Reorganize my chart**: the agent
  renames, moves, merges or splits accounts with their entries, from what
  you ask for when you say go, or from changes it proposes. Each account's
  Edit dialog stays the by-hand way.
- **Reconciliation Differences**, while a posted balance check misses its
  statement, shows **Find why this stopped matching**. Its prompt lists
  each check that misses, as account, date, books, statement, difference
  and journal, in aligned columns.
- **Settings › Opening balances** shows **Fill in what you own and owe**,
  for cash, deposits, investments and loans, which have no statements. It
  starts a run at the "Accounts with no statements" section of `npx dbu6
  docs run`, which reads the chart's opening balances itself, asks for the
  figures in the terminal, and records the ones you give. **Record a balance by hand** (/add/other) is the quiet
  link beside it.

Two playbooks are new under `npx dbu6 docs playbook`: `posted-balance-check`
and `chart-change`.
