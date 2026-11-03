---
"@dbu6/app": patch
---

`npx dbu6 agent env` works while the app is running. It used to stop with
"Another dbu6 process … is using this folder", because it migrated the
database first, which takes the folder's lock. It no longer migrates: a
database with migrations still to apply is refused, and `npx dbu6 migrate`
(or `npx dbu6 dev`) applies them.

Every account gets an agent token, the one signed up as `demo@example.com`
included: handing a prompt to the coding agent no longer skips it. In a
project with more than one account, `agent env` always asks which with
`--user`; before, it took the other one when one was `demo@example.com`.
