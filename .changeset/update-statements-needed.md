---
"@dbu6/app": minor
---

Update is laid out around finding the statements it needs, in the order
you work. First, **Download these statements** lists each bank and card on
one line, with its **Download from** month and the day it was imported
until. The month is the one its statements stop in, posted or still in the
drafts, so statements up to 13 October ask for October, and up to 30
September ask for October too. The home summary (`/api/home`) carries each
account's `statements_until` for it. Under the list, the drop says **Drop
them here** and carries the page's weight: it is tinted green and larger,
and its **Choose files** is the primary button until a file is uploaded.

The files uploaded are listed under the drop, as **Files to add**, and the
run's button under them says what it does: **Add 3 files to my books**.
**Import new statements** is gone: beside the button, a quiet **Import
statements, guided** link leads to /import, which carries that name too.
The **Do my books** heading and its paragraph are gone; one line under the
button says what happens, with ⓘ for more. Dropping a file already there,
under any name, doesn't add it again: `POST /api/statement-inbox` skips it
and names it in `already_uploaded`.

In a run, a text file no parser reads is imported freeform, with no parser,
and the plan asks what it doesn't say: the account, and the opening and
closing balances. The run's report opens with one link, to Review.
