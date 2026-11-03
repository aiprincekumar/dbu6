---
"@dbu6/app": minor
---

Deleting a draft that carries its day's statement balance, as a duplicate
or a transfer's second copy, moves the balance onto that day's new last
draft, so the day keeps its check. It happens in the database, so the
Drafts grid, `npx sapporta rows delete` and the table API all do it. A day
left with no draft loses its balance, as before. This adds a migration:
books on an older version refuse to open until `npx dbu6 upgrade`,
`start` or `migrate` applies it.
