# @dbu6/app

## 0.5.0

### Minor Changes

- 0971393: Settings › Opening balances says "From account statement" only while a
  recorded opening is the balance its first balance check implies, and
  "Manually recorded" otherwise. That now holds for any asset or liability
  with balance checks, not only a bank or card from an import preset, and a
  bank or card whose statements print no balance reads "Manually recorded".

  `GET /opening-balances` replaces `suggested_amount` with `implied_opening`:
  the opening the first balance check implies, counting what is posted and
  what is in drafts before it. It no longer turns null once something is
  posted, so the Settings dialog and /add/other prefill it for an account with
  posted entries and no opening, and drafts dated before a posted check count
  in it. Each recorded `opening` carries `source`: `"statement"` or
  `"manual"`.

- f597dfd: Spending by category on Overview shows each category's months as a
  sparkline in place of its Average column, under a "Last N months" header.
  The bar beside each name now sits before it and measures the category's share
  of the month's spending.

  `GET /api/overview` gives each category its `monthly` amounts, with `null`
  for a month before the books start. Each of `months` holds that month's
  income and spending under `amounts`, `null` for such a month, in place of
  `income` and `spending` filled with zeros. It lists `Other` as the last
  category, with a null `account_id`, for what the listed ones leave of the
  spending; its amounts are no longer rounded to cents, like the listed ones'.
  Other now also shows when its amount and average are both zero but a month of
  it is not, as when a spend and its refund cancel out, and the table shows when
  Other is the only category.

### Patch Changes

- 16821c0: `dbu6 check` reports a `.env.agent` that holds no token as missing rather than
  ready.
- 5e5a767: `dbu6 agent env --print` exports the token in `.env.agent` only when the app
  accepts it. A revoked, expired or other books' token there used to be printed
  as it was; now a fresh token is minted and printed instead, with the note that
  nothing stores it. `dbu6 check` likewise reports such a token as missing
  rather than ready, and one it has no database to check against as unchecked.
- f697bd0: Handing a prompt to the coding agent now gives the project an agent token when
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

- 44ed400: dbu6 now recognises the agent tokens it writes to `.env.agent` by a purpose
  stored with the token rather than by its name, so a token you make in the app
  is never revoked, whatever you call it. Tokens are named after what made them:
  `dbu6 agent env`, or `Prompt handoff` when handing a prompt to the coding
  agent made one. A migration marks the tokens dbu6 wrote before, so the app
  needs a restart to apply it.
- 41bdef6: The `sapporta` command reads the coding agent's token from `.env.agent` itself,
  as Sapporta now does for any project, and dbu6 writes the file through
  Sapporta: dbu6's own reader of the file is gone, and its `sapporta` bin only
  forwards to the CLI. The CLI finds the project by its `sapporta.json`, which
  every dbu6 project has; a folder without one no longer has its `.env.agent`
  picked up. In the dbu6 checkout itself, `dbu6 check` says `npx sapporta`
  works there too, since it is the same CLI.
- f76f4bc: Copying a prompt for the coding agent works where the browser refuses the
  Clipboard API, as the in-app browser of the Claude desktop app does: the copy
  falls back to a selected textarea instead of silently doing nothing. A copy
  now says "Copied to clipboard" with a green check, and with no coding agent
  set up, a dialog says to open the agent in the project folder and paste the
  prompt there, and that Settings can have dbu6 open it instead. On /add, Set
  up this format is the card's primary button and Check again has an icon.
- d39bfcf: Overview's month chart and spending sparklines now draw the month and the
  twelve months its averages cover, so every month in an average is on the
  chart; before, they drew the month and the eleven before it. `GET
/api/overview` lists thirteen `months`, and each category's `monthly` follows
  it. The averages themselves are unchanged.
- 5ac9db2: `dbu6 seed` is gone. The sample books were a tool for developing dbu6 and are
  no longer shipped in the package.

## 0.4.0

### Minor Changes

- 7e00e61: `GET /reports/income-expenses` no longer returns `first_month`. The page
  stopped reading it when its month menus moved to `/reports/books-span`. The
  Overview still returns its own `first_month`: the first month with any
  income or spending, which its averages start from.
- d593555: dbu6 now opens on Overview: one month's income, spending and savings beside
  the usual month and the difference, the largest spending categories adding up
  to the month's spending, net worth with where it sits, the last twelve months
  against the average spending, and each bank and card's balance with the date
  its books are complete until. It starts on the latest month every account
  covers and names the accounts holding it there; `[` and `]` step the month,
  and a category opens its month-by-month chart or its entries. Until anything is
  posted it shows the first run's card instead, so a new user still starts with
  setup. `GET /api/overview` returns the same figures, or `{"posted": false}`
  until anything beyond the opening balances is posted.

  What was Home is now Update, at `/update`: each account, how far it is
  imported and what waits on it. The sidebar groups Overview, Income & expenses,
  Balance sheet and All reports above Update and Accounts. Import statements and
  Review leave the sidebar; they are reached from Update, which stays lit on
  them and carries the count of accounts with something waiting. After the last
  drafts are posted, Review offers "See your money", and the setup and add
  screens leave through "Back to Update".

- b273d72: Every report reads `from_date`, `to_date` and `as_of_date` the same way: a
  real `YYYY-MM-DD` calendar day, and a period whose `from_date` is not after
  its `to_date`. Trial Balance, Balance Sheet, Income Statement, Asset Inflows,
  Expense Breakdown, Account Ledger (and its hledger text), Day Book, Monthly
  Summary and Net Worth now answer 400 to any other date, which they used to
  compare as text. Income and Expenses already did.

  `@dbu6/app/server` exports the rule for a project's report contract:
  `reportDateRange`, `requiredReportDateRange`, `asOfDateQuery` and `isoDate`.
  The worked report in the guide uses `reportDateRange`.

- 22a4326: The report kit in `@dbu6/app/server` exports `loadAccountBalances`: each
  asset, liability or equity account's own balance up to a date, signed so what
  it holds or owes is positive, as the balance sheet reads it.
- ee97f89: The report kit in `@dbu6/app/frontend` exports `Checkbox`, the control the
  balance sheet's Show Equity option uses.
- ac64a61: The report kit in `@dbu6/app/frontend` exports `spanLabel`, which names
  picked days the way the period field does ("5–20 Mar 2026").
- 78e8a20: Every report has one period field: All time, the presets, From/To months over
  the days the books cover, exact dates on a calendar, and `[` and `]` to step
  the period by its own length. `GET /reports/books-span` serves the days the
  books cover, from the first posted journal to the last.

  - Income and Expenses gains All time, with a bar per financial year once the
    period runs past 24 months. Its month menus now start at the books' first
    journal (an opening balance included), not the first month with income or
    spending.
  - The Balance Sheet and the Trial Balance pick their day from today, the end
    of last month, the end of last financial year or a calendar. The Trial
    Balance now also shows how far that day is from today.
  - The report kit in `@dbu6/app/frontend` exports `booksSpanQuery`,
    `periodSpan`, `readReportPeriod`, `writeReportPeriod`, `upToToday` and
    `financialYearLabel`.

### Patch Changes

- 3d05093: The Balance Sheet and the Trial Balance read an `as_of_date` they can't read
  as today; the day picker used to break on one. The report kit in
  `@dbu6/app/frontend` exports `useAsOfDate()`, which keeps that day in the
  URL for a report of your own.
- b13efb0: A report opened with dates it can't read (`?period=custom`, a lone
  `from_date`, or dates that are invalid or out of order) now opens on its
  default period. It used to show all time's figures while the period button
  said "Pick dates".
- 198f1d9: Today is the date in the workspace's time zone everywhere. The Overview,
  asked for no month, used to show the month on the server machine's clock,
  which near midnight could differ from the month the screen counts; the date
  over Update used the browser's zone; and a token from `dbu6 agent env` was
  named with the date in UTC. All now read the workspace's zone.

## 0.3.2

### Patch Changes

- Pin @better-auth/core to 1.6.22 so npm resolves the adapter's peers

## 0.3.1

### Patch Changes

- Give the Excel export to Income and Expenses through the report kit

## 0.3.0

### Minor Changes

- 8142471: dbu6 no longer uses the Nuabase gateway: categorization and setup's chart of
  accounts run only on the coding agent chosen in Settings, so what dbu6 sends an
  LLM reaches that agent's own provider and nothing else. `LLM_ENGINE` and
  `NUABASE_API_KEY` are no longer read; remove them from the server's
  environment. A server with no coding agent, such as the Docker image, no
  longer categorizes; its imports go through uncategorized, as they do whenever
  no agent is installed.

## 0.2.1

### Patch Changes

- Expect the changelog among the files package.json ships by path

## 0.2.0

### Minor Changes

- 4456140: A project's settings file is `.env.development`, the name Sapporta uses, so
  every `sapporta` command finds the app's port without being told. `.env` is no
  longer read: every command stops until it is renamed by hand. `.env.agent`
  holds only the agent's token, which dbu6's `sapporta` adds to the CLI's
  environment, and the agent prompts name the app's own address.
