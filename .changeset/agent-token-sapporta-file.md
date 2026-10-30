---
"@dbu6/app": patch
---

The `sapporta` command reads the coding agent's token from `.env.agent` itself,
as Sapporta now does for any project, and dbu6 writes the file through
Sapporta: dbu6's own reader of the file is gone, and its `sapporta` bin only
forwards to the CLI. The CLI finds the project by its `sapporta.json`, which
every dbu6 project has; a folder without one no longer has its `.env.agent`
picked up. In the dbu6 checkout itself, `dbu6 check` says `npx sapporta`
works there too, since it is the same CLI.
