---
"@dbu6/app": patch
---

dbu6 now recognises the agent tokens it writes to `.env.agent` by a purpose
stored with the token rather than by its name, so a token you make in the app
is never revoked, whatever you call it. Tokens are named after what made them:
`dbu6 agent env`, or `Prompt handoff` when handing a prompt to the coding
agent made one. A migration marks the tokens dbu6 wrote before, so the app
needs a restart to apply it.
