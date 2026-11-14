# End-to-end test findings, 13 Nov 2026

The whole product was run in a browser by Playwright against two throwaway copies of the app: one in paste mode, one on the automatic path with a stand-in for Claude Code. 108 browser tests and 213 unit tests pass. How to run them is in `e2e/README.md`.

## What the tests cover

| Area | Covered |
| --- | --- |
| Empty install | Redirect to the checklist, empty bank, empty board, not found pages |
| Resume import | PDF, Word, old .doc refused, scan refused, broken file refused, bad pasted replies |
| Bank | Edit profile, add, edit and delete a line, add, edit and delete a role, date format |
| CV check | Score, findings, score rises after a fix, weak line is caught |
| Settings | Defaults, save, pools, appearance, checklist row |
| Jobs | Three pools, home country and passport change the lists, search, filters, order, save, hide, role page, evidence sentences, apply link, feed drops and returns a role, broken feed keeps the old list |
| Tailoring, paste mode | Prompt content, bad replies, documents, both PDFs, flags, diff, duplicates, regenerate, unknown labels, not a job posting |
| Tailoring, automatic | Import, generate, regenerate, invented number flagged, poor fit stops, signed-out tool, unusable reply, key requirements reused |
| Tracker | Stages, history, notes, contact and dates, messages per stage, cover letter edit and re-check, ten-day reminder, rejection reason, withdraw, dashboard, weekly goal |
| Data | JSON export, CSV export, formula guard |
| API | Health check, CORS for the extension only, bad payloads, unknown ids |
| Extension | Connect, capture, bad reply, documents, Attach into a form, Mark Applied, reopen, wrong address, thin page |
| All pages | No console errors, one heading, no sideways scroll at phone width, nav state |
| Docker image | Builds with the new test workspace |

## Bugs found and fixed in this pass

1. **Tailoring with an empty bank made a dead application.** It sat in Saved forever with nothing to select from. Now refused with "Your experience bank is empty. Import your resume first, then tailor."
2. **A role date typed as "January 2017" was saved as typed** and would have printed on the resume. The form now asks for YYYY-MM and the server drops anything else.
3. **A role could not be edited after it was added or imported.** The only way to fix a wrong title or date was to delete the role and its lines. Each role now has "Edit details".
4. **"Saved." never showed after saving a contact or a date**, because the form was rebuilt before it could show.
5. **Changing the stage or adding a note on an id that does not exist crashed (500).** Both now answer 404.
6. **Web pages on other sites got an empty CORS header** instead of none. Harmless, but now there is none.
7. **A poor-fit page told the user to "add the skill and regenerate" but had no button.** The button is there now, and trying again after adding the skill works.
8. **A failed capture was titled "Reading posting" forever.** It now says "Untitled posting".
9. **Flags showed internal codes** such as `added_number`. They now say "Added number", "Dropped line" and so on.
10. **The mail link encoded the @ in the address**, which some mail programs do not undo.
11. **Every page scrolled sideways on a phone-width window.** The top menu was too wide, and on the application page the resume file name could not shrink.
12. **The job rules missed two common wordings.** A bare "Node" was not read as a skill, and "open worldwide" was not read as anywhere.
13. **The Docker build would have broken** once the test workspace was added to pnpm. The Dockerfile now lists it and installs nothing from it.

## Caveats that remain

These are real and not fixed. The first three block a new user today.

1. **Nothing is published yet.** The branch is not pushed, so there is no image on GHCR, no extension zip on a release, and no `feed` branch. Until then the setup script falls back to a slow local build, the checklist's "latest release" link has no zip, and the Jobs page says the feed is not published.
2. **The real model paths are still untested.** The automatic path is tested with a stand-in tool that answers from fixed rules. A signed-in Claude Code, a signed-in Codex, and the API key path have never run here. Reply quality, timing and the exact sign-in failure text are unknown.
3. **The setup scripts were not run on a clean machine**, on Windows or macOS.
4. **"Check now" does nothing if a check ran in the last five minutes**, and says nothing. A user clicks and sees no change.
5. **Hidden roles have no list.** A hidden role can only be brought back from its own page, which you can no longer reach from the lists.
6. **The extension was only tested on a fixture page.** Not on live Greenhouse, Lever, Ashby, Workable or LinkedIn pages. Attach depends on each site's form.
7. **Remote roles that do not name countries are hidden by default** ("Include unclear" is off). In the real feed this is a large share of remote roles, so a new user may see a short list and not know why.
8. **The skill match uses a fixed word list.** It misses skills outside the list and one-letter names such as Go, R and C on purpose. The pages say it is a rough guide.
9. **A pasted posting has no title until a model reads it.** In paste mode the card says "Reading posting" until the reply is pasted.
10. **Cover letter flags lower-case the names** they quote ("globex" for "Globex").
11. **No test covers a machine without Typst**, a feed with thousands of rows, or paging on the Jobs page.

## Missing features

Ordered by how often a real user will hit them.

1. **Delete an application.** There is no way to remove a card. Failed or mistaken captures stay in Saved. Withdraw is the only way to move them aside.
2. **Edit a job's title or company** when the model read them wrong.
3. **Tailor anyway on a poor fit.** Some people will want to apply regardless.
4. **Restore from the JSON export.** The export exists, the import does not, so the backup cannot be loaded on a new computer.
5. **Reorder lines and roles in the bank.** Order is import order.
6. **A list of hidden roles, and feedback on "Check now".**
7. **A date range or "new since last visit" filter on Jobs** beyond "Last 30 days", and saved searches.
8. **Reminders beyond the ten-day rule**, for example the day before an interview or an apply-by date.
9. **Resume length control.** Nothing checks that the tailored resume fits on one or two pages.
10. **From the approved plan, not built yet:** interview prep from the posting and the bank, draft answers to application questions, a second language for the screens.
