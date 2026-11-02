# Doing the books from a pile of statements

The user has dropped their bank and card statements, any bank, any period,
in any order, and asked you to do their books. In one session you work out
which statements belong to which account, set up what is missing, import,
categorize, settle duplicates and balance checks, and stop with every
account ready to add. The user's only real input is their answers to what
you couldn't settle, in one round.

**You never add anything to the books.** Adding is the user's own act: they
open each account's Review and press **Add N to my books**. Never call
`/api/draft-transactions/post-to-journal`.

Read `npx dbu6 docs books` first: how to reach the app, the words to use
("Talking to the user"), the endpoints. This guide orders the work, says
what the user's go-ahead covers, and how to ask. The method for each problem
is in a playbook: `npx dbu6 docs playbook <name>`, listed by
`npx dbu6 docs playbook`.

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
- then `classify` again over what is still blank, and the clean-up again
  over the accounts the answers touched.

There is no second round: what the answers left open goes in the report,
under "Still open".

### 9. Report

[The report](#the-report), then stop. Files still in the inbox go under
"Still open", each with why it didn't go in.

## Questions

Ask only what you can't settle from the books, the rules and the
descriptions: a group with two plausible accounts, a payee never seen, a
transfer whose other side is in no statement, a new account you want. A
group you are sure of is stated, not asked.

One message, three blocks, numbered across the whole message:

```
Doing these unless you say otherwise
  1  Sample food app (42 · 18,400)            → Food:Eating out   rule: contains "SAMPLEFOOD"
  2  Sample card payment (6 · 2,10,000)       → Sample card       transfer, both statements

Need your call
  3  UPI sample-payee-050505 (9 · 27,000)     Jun–Sep, monthly 3,000
       a) Rent   b) Household:Help   c) Loans given   d) something else   e) skip
  4  NEFT NOPII CUSTOMER NAME (1 · 50,000)    2025-07-14
       a) Gifts given   b) Loans given   c) something else   e) skip

Accounts I'll create
  5  Household:Help  under Expenses:Household   (for 3b, if you pick it)
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

Add in this order: Sample savings, then Sample card (card payments tie them).

New accounts      Household:Help (under Expenses:Household)
New rules         contains "SAMPLEFOOD" → Food:Eating out (42)
New parsers       sample-bank-savings-csv
Still open        Sample current: download June 2025, then drop it
Skipped           7 drafts left without an account on Sample savings
```

- An account with drafts left without an account can't be added until the
  user sets them in its Drafts grid: say so beside it.
- Every change the go-ahead covered (the first column below) that happened
  is in the report: accounts, rules, parsers, preset changes, drafts deleted.
- Cash, deposits, investments and loans have no statements: remind the user
  of `/add/other` for their balances.

## Permissions inside a run

This replaces "Before changing anything" in the books guide for the run.

| Covered by the plan's go-ahead | Asked in the question round | Asked on its own | Never |
| --- | --- | --- | --- |
| parsers and their tests; preset changes for accounts in the plan; adding the accounts in the plan and importing; opening balances the statements give; categorizing drafts; rules and prompt lines for "sure" groups; deleting a draft that duplicates the same statement row; settling a transfer both statements carry | new accounts; rules for the user's answers; anything "needs your call" | any change to a posted entry; deleting a draft for any other reason; an opening balance the user must give; a change to dbu6 itself (`statement_disagreement`) | changing a statement balance; deleting to pass a check; editing `node_modules/@dbu6/app`; writing SQLite |

The rest of the books guide's rules hold: only a day's last draft carries
its statement balance, so move it before deleting that draft; nothing from
the user's data goes into a tracked file.

## Stopping and starting again

There is no run state to keep. The state is the books: presets, drafts,
their accounts, the rules in `user-config/`. A new session started with the
same prompt runs the survey again and continues: an account `in_books` with
drafts goes straight to categorizing, and answers already given are rules or
set accounts, so they aren't asked again. Every write is small and
self-contained (one account's add, one batch of set-account, one rules
edit), so stopping between two leaves the books consistent. Keep no log of
the run in the project: it would be another copy of the user's financial
data.

## Any agent

The guide uses only what every coding agent can run: `npx sapporta`,
`npx dbu6`, curl and `sqlite3 -readonly`. An agent with subagents may use
them for parsers; nothing here needs them.
