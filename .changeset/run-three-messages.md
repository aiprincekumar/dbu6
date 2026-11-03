---
"@dbu6/app": patch
---

A run of **Do my books** now talks to someone who has never seen dbu6. The
agent sends three messages, each from the user's own statements: what you
gave me (the accounts, what it will do, only what blocks an import), what
your money looks like (money in and out, the categories fitted to it, then
the questions), and what to do now (next steps first, then what changed).
It explains a thing once, when it first comes up, and leaves out parsers,
presets and phases. On books with no chart the run starts from the standard
chart, less the accounts the setup checklist leaves unticked, and fits it
to the transactions instead of showing a chart before reading them.
