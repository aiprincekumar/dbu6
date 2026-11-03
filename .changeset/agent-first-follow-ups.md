---
"@dbu6/app": minor
---

The coding agent adds drafts to the books when the person asks it to; by
default it still leaves them for Review. The books guide's "Add them to my
books" says how, and the project's `AGENTS.md` line changes to match.

Prompts that name a playbook take their report's headings from it and add
only the screen's own next step. A refusal's playbook is found from
`npx dbu6 docs playbook`, whose entries name the codes they cover; the run
guide's table of refusals is gone. The rule for deleting a draft that
carries its day's balance is stated once, in the books guide.

The Reconciliation Differences prompt refuses a report row it can't read
instead of leaving it out and counting fewer checks.
