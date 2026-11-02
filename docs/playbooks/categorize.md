# Drafts the categorizer couldn't place

## When

Drafts wait in Review with no account (`account_id` is null): the rules in
`user-config/transaction_mappings.mjs` missed them and the categorizer's AI
wasn't sure. The aim is to settle where they go with the user, and to add
rules so the categorizer places ones like them next time.

## Read

- Count before you list: how many drafts have no account, per account
  (`sqlite3 -readonly`, as "Reading the database" in `npx dbu6 docs books`
  allows), and list rows only for what you must judge:
  `npx sapporta rows list draft_transactions --where '{"base_account_id":{"eq":<id>},"account_id":{"is":"null"}}' --sort source_narration --limit 1000`.
- Where drafts like them already sit: other drafts with an account, and the
  books (`/api/search`).
- The accounts in the chart (`npx sapporta rows list accounts`), and the
  rule requests the user made, whose accounts are their answers for those
  drafts:
  `npx sapporta api get /api/categorization-rule-requests --query '{"base_account_id":<id>}'`.
- "Always put this under X — adding a mapping" in `npx dbu6 docs books`.

## Change

1. Group the drafts by what they are, by judgment: a payee, a kind of
   spending, a regular payment. Not by exact narration: reference numbers
   make nearly every narration unique.
2. Find each group's likely account, from where ones like it sit in the
   books, and its rule.
3. Show every group you're sure of in one list, a line each: a few
   descriptions and how many, the account, the rule. The user says yes or
   names the ones to change.
4. Ask about the rest: a few descriptions with dates and amounts, and 2–4 of
   the user's accounts as numbered options, likeliest first, plus "something
   else" and "skip". If none fits, propose a new account's name and parent.
5. Encode what the user agrees to as a rule or a prompt line, as the books
   guide says. A draft like no other gets its account set directly
   (`/api/draft-transactions/set-account`), no rule. A new account the user
   approved is created with its name, type and parent in one call
   (`npx sapporta rows create accounts`).
6. A rule request whose drafts are now encoded is done: delete it, as the
   `rule-requests` playbook says.

What the categorizer sees decides what a rule can do:

- A draft's description, direction and amount, never its date.
- How it was paid (UPI, NEFT, card) is not something drafts share.
- Round an amount range out (60–480 becomes 50–500).
- The user's `user-config/` files may name payees and amounts; that is
  theirs, and fine.

## Never

- Send a draft to its own base account.
- Write a rule on a string only the payment method shares.

## Report

- **New rules:** each rule or instruction line, and how many drafts it
  covers.
- **Set by hand:** how many drafts you set directly.
- **Still without an account:** how many drafts.
