---
"@dbu6/app": patch
---

Handing a prompt to the coding agent now gives the project an agent token when
`.env.agent` holds none the app accepts, minted for the signed-in owner, so the
agent can reach the app without asking you to run `npx dbu6 agent env`. A
`.env.agent` whose token still works is left as it is, whoever it is for; one
whose token was revoked, has expired or belongs to other books gets a new one,
and, as with `npx dbu6 agent env`, minting it revokes the tokens dbu6 minted
for you before. Nothing is minted for the sample account the sample-data seed
makes, for a request an agent makes with its own token, or when the handoff is
refused because no coding agent or model works.

`npx dbu6 agent env --print --user <the sample account>` in a project whose
`.env.agent` holds a token now prints that token, as `--print` does for any
account, instead of refusing.
