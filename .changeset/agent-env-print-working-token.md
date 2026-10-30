---
"@dbu6/app": patch
---

`dbu6 agent env --print` exports the token in `.env.agent` only when the app
accepts it. A revoked, expired or other books' token there used to be printed
as it was; now a fresh token is minted and printed instead, with the note that
nothing stores it. `dbu6 check` likewise reports such a token as missing
rather than ready, and one it has no database to check against as unchecked.
