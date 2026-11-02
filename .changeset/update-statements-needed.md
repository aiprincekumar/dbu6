---
"@dbu6/app": minor
---

Update is laid out around finding the statements it needs. Beside the drop,
a box lists each bank and card with its **Statement needed from** month and
the day it was imported until. The month is the one its statements stop in,
posted or still in the drafts, so statements up to 13 October ask for
October, and up to 30 September ask for October too. The home summary (`/api/home`) carries each account's
`statements_until` for it. The run's button says what it does: **Add 3
files to my books**. **Import new statements** is gone: beside the button,
"or **Import statements, guided**" leads to /import, which carries that
name too.

The files uploaded are listed above the drop, as **Statement files
uploaded**. Dropping a file already there, under any name, doesn't add it
again: `POST /api/statement-inbox` skips it and names it in
`already_uploaded`.

In a run, a text file no parser reads is imported freeform, with no parser,
and the plan asks what it doesn't say: the account, and the opening and
closing balances. The run's report opens with one link, to Review.
