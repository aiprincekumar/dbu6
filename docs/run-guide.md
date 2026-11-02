# Doing the books from a pile of statements

Most often the user has dropped their bank and card statements, any bank,
any period, in any order, and asked you to do their books. In one session you work out
which statements belong to which account, set up what is missing, import,
categorize, settle duplicates and balance checks, and stop with every
account ready to add. The user's only real input is their answers to what
you couldn't settle, in one round.

**You never add drafts to the books.** Adding is the user's own act: they
open Review and press **Add N entries from K accounts to my books**, or an
account's own **Add N to my books**. Never call
`/api/draft-transactions/post-to-journal` or
`/api/draft-transactions/post-ready`. The only entries you post are opening
balances the user gave you ([Accounts with no
statements](#accounts-with-no-statements)).

Read `npx dbu6 docs books` first: how to reach the app, the words to use
("Talking to the user"), the endpoints. This guide orders the work, says
what the user's go-ahead covers, and how to ask. The method for each problem
is in a playbook: `npx dbu6 docs playbook <name>`, listed by
`npx dbu6 docs playbook`.

## Entries

A run starts from one of these. The prompt says which; a request in the
user's own words fits one of them.

| The run starts from                                 | Follow                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| a pile of new statements, in the inbox or a folder  | [Phases](#phases), from 0                                   |
| the drafts already in Review, no new files          | [Starting from the drafts](#starting-from-the-drafts)       |
| a balance check in the books that stopped matching  | `npx dbu6 docs playbook posted-balance-check`               |
| a change to the chart: rename, move, merge or split | `npx dbu6 docs playbook chart-change`                       |
| cash, deposits, investments or loans: no statements | [Accounts with no statements](#accounts-with-no-statements) |

Each one starts with the preflight (phase 0), shows the user a plan, and
waits for a yes before it writes anything. The two playbooks keep their own
plan and permissions: every change they make is to entries in the books.

## Where the statements are

- **From the app:** the prompt names the statement inbox.
  `npx sapporta api get /api/statement-inbox` lists every batch waiting, with
  each file's `saved_path` and size. The files were only saved: nothing has
  read or imported them. Send them to the app by path, one
  `-F "inbox_files=<saved_path>"` each, in place of `-F "files=@<path>"`:
  they are read where they are, and an import that adds one to the drafts
  removes it from the inbox. What is left there afterwards is what didn't
  go in.
- **From the user's words:** a folder they named ("my statements are in
  ~/Downloads/bank"). Read the files from there; don't copy them into the
  project.

## Phases

Each phase ends with one line in the terminal: what it did, in counts.
Phases 0–2 only read; nothing is written before the user's go-ahead.

### 0. Preflight

- `npx sapporta api get /api/auth-context` names the user the token acts as.
- `npx dbu6 check` reports the project's health.
- If the app is down or the token fails, say so in one plain sentence, as
  "If you are blocked" in the books guide says, and stop.

### 1. Survey

- One `POST /api/add-account/read` over every file at once (curl, as
  "Uploads" in the books guide shows, each file as above). It writes nothing
  to the books. It groups the files by account (`accounts`,
  each with its `status`: `new`, `empty` or `in_books`), and names the files
  no parser reads (`unrecognized`) or several do (`ambiguous`).
- `npx sapporta api get /api/home`: what each account in the books holds,
  and its last statement balance.
- `npx sapporta api get /api/import-presets`: the banks and cards set up.
- `npx sapporta rows count accounts`: whether the books have a chart.
- `npx sapporta api get /api/overview`: `{"posted": false}` means nothing
  beyond opening balances is in the books yet. That, or books with no
  chart, makes this a first run, whose question round also asks about the
  [accounts with no statements](#accounts-with-no-statements).

Build one table, a row per account, the files no parser reads on a row of
their own:

```
Account            Files  From        To          State      Needs
Sample savings       4    2025-04-01  2025-09-30  new        -
Sample card          6    2025-04-05  2025-10-04  new        opening balance (you)
Sample current       2    2025-07-01  2025-08-31  in books   2025-06 missing (download)
(unknown)            1    -           -           no parser  parser
Sample wallet        1    2025-08-02  2025-08-29  text       account, opening and closing (you)
```

Note under it: files read by several parsers, files of two accounts, a
statement already in the books (`already_in_books`), and a period with a gap
between two files.

### 2. Plan gate

Your first reply is the plan, and you wait for go:

1. The table.
2. The chart, when the books have none: the starter chart from
   `npx sapporta api get /api/setup/chart-of-accounts`, adjusted to what the
   statements' descriptions show, as an indented tree.
3. The questions you already know you have, numbered: a bank's name when a
   file doesn't say, a card's opening balance when the read says
   `needs_opening`, a parent account when `default_parents` of
   `npx sapporta api get /api/setup/statement-accounts` is `null`, and for
   each text file to import freeform ([Text files](#text-files)) what it
   doesn't say: which account, whether it is a card, and the opening and
   closing balances.
4. One line: "Go ahead?"

### 3. Chart

When the books had none: `POST /api/setup/chart-of-accounts` with the chart
the user approved.

### 4. Parsers

For each file no parser reads, or several do: the `unrecognized-statement`
or `ambiguous-parsers` playbook, then `npx dbu6 check`, then read the files
again. A text file no parser reads is the exception: it is imported
freeform, as [Text files](#text-files) says, with no parser. A parser
serves every account of that format, so do this once per format, before
any import. A bank or card the run adds gets no preset account from you:
`add-account/add` sets it up.

### 5. Accounts and imports

Per account, oldest statement first:

- `new`: `POST /api/add-account/add` with its files, `name`, and
  `parent_id`, `institution`, `kind` and `opening_amount` where the read
  asked for them (the books guide, "I opened a new account or card").
- `empty`: `POST /api/add-account/add`, with `opening_amount` when asked.
- `in_books`: `POST /api/import-draft/statements/auto` with its files.

A refusal sends you to its playbook:

| Refusal                                   | Playbook                 |
| ----------------------------------------- | ------------------------ |
| file `unresolved`, no account set up      | `unresolved-account`     |
| `statement_account_identifier_required`   | `identifier-required`    |
| file `unresolved`, number matches none    | `identifier-mismatch`    |
| `balance_mismatch`, `segment_balance_mismatch` | `balance-mismatch`  |
| `statement_boundary_mismatch`             | `boundary-gap`           |
| `statement_disagreement`                  | `statement-disagreement` |
| `statement_part_invalid`                  | `part-invalid`           |
| `reconciliation_match_failed`             | `reconciliation`         |
| `import_account_not_found`                | `missing-ledger-account` |
| `closing_balance_unavailable`             | `closing-balance`        |

A missing period goes on the "download" list, and the account is imported
up to the gap, if its earlier files import on their own. Then move on to the
next account rather than stopping.

### Text files

A `.txt` file, or any file of rows copied out of a PDF, a web page or an
app, goes through the survey like any statement: a saved parser that reads
it imports it as above. When none does (`unrecognized`), don't write a
parser for it; import it freeform, as `npx dbu6 docs freeform-guide` says:

- Read its transactions in the survey, and give it a row in the table, with
  its count and dates and `text` as its state.
- What the file doesn't say goes in the plan's questions, so the user
  answers it with the go-ahead: the account it belongs to (one in the books,
  or a new one with its name, type and parent), whether it is a card, and
  the opening and closing balances. A balance the file shows is offered as
  a suggestion to confirm, never used on its own.
- After go, create a new account with
  `npx sapporta rows create accounts`, then `POST /api/import-draft/abacus`
  in the account's turn among the imports, oldest first. That import doesn't
  take `inbox_files`, so once it puts the rows in the drafts, take the file
  out of the inbox:
  `npx sapporta api post /api/statement-inbox/remove --body '{"saved_path":"<saved_path>"}'`.
- A balance mismatch goes back to the user in the question round; never
  change rows or balances to make them agree.

### 6. Categorize, across all accounts

The import already ran the rules and the AI. What is left has no account.

1. For each account, after any rule you added: `classify` over its drafts
   with no account, with its own `custom_mappings_filenames` ("Categorise
   these" in the books guide).
2. Read what is still blank across *all* accounts together, with the
   accounts already used, as the `categorize` playbook says, and:
   - recognize transfers between the user's own accounts and card payments
     from both statements, and settle them as the `cross-account-transfers`
     playbook says;
   - group the rest by what they are, by judgment;
   - sort each group into "sure" and "needs your call".

Count and group with SQL (`sqlite3 -readonly`, as "Reading the database" in
the books guide allows); never list every draft into your context. Read rows
only for the groups you must judge. For example, what is blank per account:

```sql
SELECT a.name, COUNT(*) AS blank, ROUND(SUM(d.withdrawal + d.deposit)) AS total
FROM draft_transactions d JOIN accounts a ON a.id = d.base_account_id
WHERE d.account_id IS NULL
GROUP BY a.name ORDER BY total DESC;
```

### 7. Clean-up

With the "sure" groups set, per account
(`npx sapporta api get /api/review/accounts/<id>`): duplicates (`duplicates`
playbook), then balance checks (`balance-checks` playbook). Fix what the
evidence settles: an exact duplicate draft of the same statement row, a
transfer both statements carry. What it doesn't settle joins the question
round.

### 8. Question round

One message, as [Questions](#questions) says, with the clean-up's questions
in it. Then:

- each answer becomes a rule or a prompt line ("Always put this under X" in
  the books guide; count first what a rule would catch in other accounts);
- each new account the user approved is created with its name, type and
  parent in one call:
  `npx sapporta rows create accounts --values '{"name":"…","account_type":"…","parent_id":<id>}'`;
- each one-off is set by hand (`/api/draft-transactions/set-account`);
- each opening balance the user gave is posted, as [Accounts with no
  statements](#accounts-with-no-statements) says;
- then `classify` again over what is still blank, and the clean-up again
  over the accounts the answers touched.

There is no second round: what the answers left open goes in the report,
under "Still open".

### 9. Report

[The report](#the-report), then stop. Files still in the inbox go under
"Still open", each with why it didn't go in.

## Starting from the drafts

No new files: the statements are already imported, and their drafts wait in
Review. The user pressed **Fix these** on Review, or asked you to finish
what is left there. The work is the second half of a run, across every
account with drafts at once, or across the accounts the prompt names: then
the survey, the plan and the work cover only those, and you read another
account only to settle a transfer with it.

### 0. Preflight

As in [Phases](#phases).

### 1. Survey

- `npx sapporta api get /api/review/accounts`: each account with drafts,
  with `drafts`, `uncategorised`, `duplicates`, `failing_checks`,
  `add_first` (the accounts it waits for) and `rule_requests` (how many
  rule requests the user left on it).
- For each account with `rule_requests` above 0:
  `npx sapporta api get /api/categorization-rule-requests --query '{"base_account_id":<id>}'`.
- `npx sapporta api get /api/statement-inbox`: files dropped and not yet
  imported. Name them in the plan; don't import them unless the user says
  so. If they do, those files are a pile: run [Phases](#phases) for them
  before categorizing.

### 2. Plan gate

Your first reply is the plan, and you wait for go:

1. One row per account with drafts, what is left on it:

   ```
   Account          Drafts  Blank  Requests  Dups  Failing  Waits for
   Sample savings      412     34         2     2        0  -
   Sample card         188     17         0     0        3  Sample savings
   ```

2. For each rule request, the rule or prompt line you propose, as the
   `rule-requests` playbook says, or why it can't be one.
3. The files waiting in the inbox, by name, with "I'll leave these unless
   you say."
4. The questions you already know you have, numbered.
5. One line: "Go ahead?"

### 3. Categorize

Skip the chart, parsers and imports (phases 3 to 5). Encode the rule
requests first, as the `rule-requests` playbook says: they are the user's
answers, given in Review. Then phase 6 over every account in the plan:
`classify` over what is blank, which now meets the new rules, then what is
still blank, judged across all accounts.

### 4. Clean-up, question round, report

Phases 7, 8 and 9, as for a pile. A rule request you couldn't encode goes
in the report under "Still open"; it stays on the user's list.

## Accounts with no statements

Cash, fixed deposits, investments, loans given and loans taken have no
statement, so no import sets their balance. An opening balance on the day
the books start does. Without one, the balance sheet leaves them out.

**When.** On a first run (see the survey), the question round asks about
them, as one more block. Outside a first run, only when the user asks, or
the prompt names this section: then, after the preflight, the block below is
the whole plan, and you post on the user's answer.

**Read.** `npx sapporta api get /api/opening-balances`: the accounts in
`section` `own` (assets) and `owe` (liabilities) with `opening` `null` are
the ones to ask about. A bank or card (`statement`) is not: its first
statement set its balance. `default_date` is the date to use: the day
before the account's first activity, else the day the books start. When
it is `null` (no opening entry in the books at all), use the day before the
earliest statement in the run.

**Ask,** in the question round, after the other blocks:

```
What you held or owed on 2025-03-31, the day your books start
  6  Cash in hand                held   amount?
  7  Fixed deposits              held   amount?
  8  Car loan                    owed   amount?
  9  Anything else you hold or owe: its name, held or owed, and the amount
```

- One row per account, in the order the chart lists them, what is held
  first. A group with nothing under it is asked as "anything under it?".
- Amounts are given as positive numbers: what was held, or what was owed.
- `6 5000 8 250000` answers rows; `skip` or no answer leaves a row out.
- A new one (row 9) is an account to create, with its type and a parent
  you propose from the chart: put it under "Accounts I'll create".

**On a yes:**

1. An account the chart lacks:
   `npx sapporta rows create accounts --values '{"name":"…","account_type":"Asset","parent_id":<id>}'`
   (`Liability` for one owed), the parent an Asset or Liability account
   the user agreed to.
2. Its opening balance:
   `npx sapporta api post /api/opening-balances --body '{"account_id":<id>,"date":"YYYY-MM-DD","amount":<signed>}'`,
   positive when held, negative when owed. The date must be before the
   account's first activity; a refusal (`date_not_before_first_activity`)
   names that date.

The amount is the user's. Never guess one, or take it from a description.

**Report.** In a run, the "Opening balances" and "Skipped" lines of [the
report](#the-report). Started from this section, those two lines are the
whole report.
Changing an opening balance already recorded is asked on its own
(`PUT /api/opening-balances/<account id>`, the books guide's "Opening
balance").

## Questions

Ask only what you can't settle from the books, the rules and the
descriptions: a group with two plausible accounts, a payee never seen, a
transfer whose other side is in no statement, a new account you want. A
group you are sure of is stated, not asked.

One message, three blocks, numbered across the whole message, and on a
first run a fourth: what the user held or owed ([Accounts with no
statements](#accounts-with-no-statements)).

```
Doing these unless you say otherwise
  1  Sample food app (42 · 18,400)            → Eating out    rule: contains "SAMPLEFOOD"
  2  Sample card payment (6 · 2,10,000)       → Sample card   transfer, both statements

Need your call
  3  UPI sample-payee-050505 (9 · 27,000)     Jun–Sep, monthly 3,000
       a) Rent   b) Household help   c) Loans given   d) something else   e) skip
  4  NEFT NOPII CUSTOMER NAME (1 · 50,000)    2025-07-14
       a) Gifts given   b) Loans given   c) something else   e) skip

Accounts I'll create
  5  Household help  under Household   (for 3b, if you pick it)
```

- Counts and totals in aligned columns, amounts with Indian digit grouping;
  for anything asked, a few descriptions with dates and amounts.
- 2–4 options, likeliest first, plus "something else" and "skip".
- New accounts with their parent and what needs them, so the same reply
  approves them.
- Ordered by total, largest first, so the user can answer the top and skip
  the rest. Past about 25 groups, say how many there are and offer them in
  pages of that size.
- The user may reply in shorthand: `ok` accepts the first block; `3b 4a`;
  `5 no`; `rest skip`. Free text is fine too.

## The report

It opens with one link, to Review, where every account below waits to be
added: `SAPPORTA_PUBLIC_APP_URL` from `.env.development`, then `/review`,
written out in full so the terminal makes it clickable. Name no other
Review link; Review lists the accounts.

```
Review your books: http://localhost:<port>/review

Ready to add        Drafts  Rules   AI  You  Dups removed  Checks
Sample savings         412    280   98   34             2   31/31
Sample card            188    120   51   17             0     6/6

Press "Add 600 entries from 2 accounts to my books" on Review.

Not ready           Why
Sample current      7 drafts without an account: set them in its Drafts grid
Sample wallet       waits for Sample current (a transfer ties them)

New accounts        Household help (under Household)
New rules           contains "SAMPLEFOOD" → Eating out (42)
New parsers         sample-bank-savings-csv
Opening balances    Cash in hand 5,000 · Car loan, you owe 2,50,000
Still open          Sample current: download June 2025, then drop it
Skipped             Fixed deposits: no balance given
```

- The button's counts are the "Ready to add" rows added up: their drafts,
  and how many accounts. Review adds them in the order their transfers
  need, so name no order.
- "Not ready" lists every account with drafts that isn't ready, each with
  why, in one line: drafts without an account (the user sets them in its
  Drafts grid), a possible duplicate or a failing check you couldn't
  settle (see "Still open"), or an account it waits for that isn't ready.
  The user adds it on its own, from its Review, once it is.
- Every change the go-ahead covered (the first column below) that happened
  is in the report: accounts, rules, parsers, preset changes, drafts deleted.
- Opening balances you posted for [accounts with no
  statements](#accounts-with-no-statements) have their own line; those the
  user skipped go under "Skipped".

## Permissions inside a run

This replaces "Before changing anything" in the books guide for the run.

| Covered by the plan's go-ahead | Asked in the question round | Asked on its own | Never |
| --- | --- | --- | --- |
| parsers and their tests; preset changes for accounts in the plan; adding the accounts in the plan and importing; opening balances the statements give; categorizing drafts; rules and prompt lines for "sure" groups; rules and prompt lines for the rule requests the plan lists; deleting a draft that duplicates the same statement row; settling a transfer both statements carry | new accounts; rules for the user's answers; anything "needs your call"; opening balances of accounts with no statements | any change to a posted entry; deleting a draft for any other reason; changing an opening balance already recorded; a change to dbu6 itself (`statement_disagreement`) | adding drafts to the books (`post-to-journal`, `POST /api/draft-transactions/post-ready`); changing a statement balance; deleting to pass a check; editing `node_modules/@dbu6/app`; writing SQLite |

The rest of the books guide's rules hold: only a day's last draft carries
its statement balance, so move it before deleting that draft; nothing from
the user's data goes into a tracked file.

## Stopping and starting again

There is no run state to keep. The state is the books: presets, drafts,
their accounts, the rules in `user-config/`. A new session started with the
same prompt runs the survey again and continues: an account `in_books` with
drafts goes straight to categorizing, as [Starting from the
drafts](#starting-from-the-drafts) does, and answers already given are rules or
set accounts, so they aren't asked again. Every write is small and
self-contained (one account's add, one batch of set-account, one rules
edit), so stopping between two leaves the books consistent. Keep no log of
the run in the project: it would be another copy of the user's financial
data.

## Any agent

The guide uses only what every coding agent can run: `npx sapporta`,
`npx dbu6`, curl and `sqlite3 -readonly`. An agent with subagents may use
them for parsers; nothing here needs them.
