---
"@dbu6/app": minor
---

Spending by category on Overview shows each category's last twelve months as
a sparkline in place of its Average column, under a "Last N months" header.
The bar beside each name now sits before it and measures the category's share
of the month's spending.

`GET /api/overview` gives each category its `monthly` amounts and the month's
spending as `figures.spending_monthly`, with `null` for a month before the
books start. It lists `Other` as the last category, with a null `account_id`,
for what the listed ones leave of the spending; its `average` is no longer
rounded to cents. Other now also shows when its amount and average are both
zero but its months are not, as when a spend and its refund cancel out, and
the table shows when Other is the only category.
