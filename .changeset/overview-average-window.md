---
"@dbu6/app": patch
---

Overview's month chart and spending sparklines now draw the month and the
twelve months its averages cover, so every month in an average is on the
chart; before, they drew the month and the eleven before it. `GET
/api/overview` lists thirteen `months`, and `monthly` and
`figures.spending_monthly` follow it. The averages themselves are unchanged.
