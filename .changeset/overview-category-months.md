---
"@dbu6/app": minor
---

Spending by category on Overview shows each category's months as a
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
