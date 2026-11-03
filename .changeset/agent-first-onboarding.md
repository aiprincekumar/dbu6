---
"@dbu6/app": minor
---

The coding agent's run is where a new user goes, and where every bank and
card's statements go, new ones too. Before there is a chart, the run's card
says the agent proposes your accounts for your OK before it imports
anything. Setting up by hand (/setup, then /add's cards) is unchanged.

On Update, an account's **Needs a first statement** leads to the drop on the
same page, `/update#drop`, which scrolls to it and focuses **Choose files**;
it used to open /add. **+ Add bank or card** under the list is gone: the
drop says it takes statements from any bank or card, new ones too. Settings ›
Banks & cards' **Add a bank or card** leads to the drop as well.

Doing it by hand is still one small link beside the drop. In the first run
it is **Add a bank or card** (/add) even while the first drafts wait, on
Update and on Overview, until anything beside opening balances is posted
(the home summary's new `posted`); **Import statements, guided** (/import)
after. /import, which imports into the banks and cards
already in the books, links to /add for a new one.
