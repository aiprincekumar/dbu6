# Importing statements

A statement comes in as a file from your bank and leaves as journal entries in
your books. dbu6 reads it, recognizes its layout and account, checks its
balances, and holds the rows as drafts until you add them to your books.

## Do my books

Drop every statement you have on Update, from any bank or card, any period,
in any order, and press **Do my books**. Your coding agent takes it from
there, following `npx dbu6 docs run`:

* It shows you a plan first: which statements belong to which account, a
  period that looks missing, what it already knows it must ask. It changes
  nothing until you say go.
* It writes a parser for any layout dbu6 can't read yet, sets up each new
  bank or card with its opening balance, and imports every account's
  statements, oldest first.
* It categorizes across all accounts at once, so a transfer between two of
  your accounts, or a card payment, is recognized from both statements. It
  settles duplicates and balance checks the statements explain.
* What it can't settle, it asks in one round in the terminal. Your answers
  become mapping rules, so the next import knows them.
* It never adds to your books. Review lists every account, and **Add N
  entries from K accounts to my books** adds each one that is ready.

A statement for a new bank or card goes on the same drop: there is no
separate step to set it up first.

## By hand

The Import statements screen takes one account's statements at a time, and
a new bank or card is added on its own screen first, linked from Import
statements. The rest of this page is what happens on the way, either way.

## Parsers

A parser reads one statement layout and turns it into the rows and balances
dbu6 works with. dbu6 ships parsers for the layouts it already knows, all
Indian banks and cards: Standard Chartered bank statements (PDF and CSV) and
credit card statements (PDF), HDFC credit card statements (XLS and CSV) and
bank statements (XLS), and Federal Bank statements (XLS).

A parser of your own goes in your folder's `custom-built-parsers/`, and shadows
a bundled one of the same name. Never edit anything under `node_modules`.

## A statement dbu6 cannot read

dbu6 recognizes a layout by trying each parser against the file. In a run,
the agent writes the parser for one none matches. On the Import statements
screen, it hands you a prompt for your coding agent instead:

* Copy the prompt and paste it into your agent, or
* click **Open in Claude Code** (or **Codex**, or **Pi**) to start the agent on
  it in a new terminal window, in your books folder. On Linux the button gives
  you a command to run in a terminal instead.

Either way the agent reads `npx dbu6 docs parser-guide`, which is written so it
can produce an accurate parser in one shot, and every prompt asks it to show
you its steps first and do nothing until you say go. `npx dbu6 docs parsers`
has the conventions a parser follows.

## Transactions that are not a statement

Text copied from a PDF or a web page, HTML, CSV, or a list you typed can go
on the drop as a text file: in a run, the agent asks you which account it
belongs to and its opening and closing balances, with the plan. By hand, the
Import freeform transactions screen gives you a prompt for your coding agent,
which turns the transactions into a statement, asks you for the same, and
imports them into Drafts. The guide is `npx dbu6 docs freeform-guide`.

## Balance checks

Before a statement is accepted, dbu6 looks up the last posted entry and balance
for that account and works out where the new statement should start. It then
checks the statement's balances against what the books compute from the
imported rows. A mismatch stops the import.

For bank statements with a running balance, every row is checked. For credit
card statements, which usually have no per-row balance, the opening and closing
balances of the statement are used instead.

Imported rows are held as drafts. In Review you reclassify what needs it, check
for duplicates against earlier imports, confirm the balance checks pass, and
add them to your books; after a run, most of that is done and Review says
what is left. Nothing reaches the books until you add it; a draft that turns
out to be wrong can be discarded without touching them.
