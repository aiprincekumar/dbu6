---
"@dbu6/app": patch
---

Copying a prompt for the coding agent works where the browser refuses the
Clipboard API, as the in-app browser of the Claude desktop app does: the copy
falls back to a selected textarea instead of silently doing nothing. A copy
now says "Copied to clipboard" with a green check, and with no coding agent
set up, a dialog says to open the agent in the project folder and paste the
prompt there, and that Settings can have dbu6 open it instead. On /add, Set
up this format is the card's primary button and Check again has an icon.
