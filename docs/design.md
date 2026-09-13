# Shortlisted, product design

Status: single-user local tool, September 2026. This started as a multi-tenant SaaS design; on
11 Sep 2026 it was cut down to one user on one machine. The earlier version is published at
https://claude.ai/code/artifact/21715169-912a-439d-a845-1ab3ba5cbd12

## Thesis

The expensive part of applying is not writing. It is the loop of copying a job description,
pasting it somewhere, proofreading output you do not trust, downloading a file, and uploading it
again. Every step is a context switch.

Shortlisted collapses that loop to one click on the job page. The tailored documents are
generated from a bank of real achievements the user wrote once. The model may select, reorder,
and reword. It may not invent. Because the output is constrained, the user reviews a short diff
instead of a full document.

Around that click sits a pipeline tracker. Every captured job becomes an application with
exactly one stage, and every stage change is a timestamped event. The tracker answers the
questions that matter three weeks later: which resume did they see, when did I apply, who went
quiet.

## Who it is for

One person, the owner, on their own machine. There are no accounts, no sign-in, no billing and
no tenancy. Every row still carries a `userId` set to a constant, so a second user would be a
data change rather than a schema change, but nothing in the product assumes one will ever exist.

## Surfaces

- **Extension.** The only thing the user touches while hunting. A toolbar button and a side
  panel. Captures the page, shows the verdict and the documents, and moves the application
  through stages with a tap. Its one setting is the web app's address.
- **Web app.** Where the profile lives and where the pipeline is reviewed. The board with its
  follow-up list, the dashboard, the application detail page, and the experience bank editor.
  Visited during setup and about once a week after.
- **Backend.** A worker that runs parsing, selection, validation, and rendering, and a folder of
  PDFs. All of it runs in Docker Compose on the user's machine and listens on loopback only.

## Pipeline

Saved -> Generated -> Applied -> Screening -> Interview -> Offer, with Rejected and Withdrawn as
terminal stages reachable from anywhere.

Capture creates the application in Saved. Successful generation, meaning a rendered PDF, moves
it to Generated automatically. Everything after that is a user action. Rejected carries a reason
field. Applied is not auto-detected from the page; detection is brittle and a wrong stage is
worse than a manual tap.

## Capture flow

The user is on a job page and clicks the icon. The side panel moves through four states:
Parsing, Verdict (with gaps, shown before generation starts so a Poor fit costs nothing),
Result (the diff, Attach, Regenerate), Stage (the file name and a Mark applied button).

A page the user has already captured reopens the existing result instead of running again.

**Reading the page.** Most job sites embed a JSON-LD `JobPosting` block. The panel reads that
first. When it is missing, it sends the page's visible text and the parser extracts the posting.
That text is not the whole page: on LinkedIn and Indeed the panel joins the posting's own blocks
(top card and description) and otherwise takes the narrowest container that holds the posting,
minus known noise such as the result list, site navigation, premium insights, the company blurb
and similar jobs. The URL goes with both, for dedupe and for the record.

**Attach.** Finds the resume file input on the current page and sets the PDF on it. Works on
standard inputs (Greenhouse, Lever, most company portals). Custom uploaders need the file
dialog. When a cover letter textarea exists, it is filled too.

## Generation

Seven steps per capture. Steps 2 and 4 are code, not the model.

1. **Parse.** Model turns the posting into a fixed schema: title, company, seniority, must-have
   skills, nice-to-have skills, keywords, responsibilities.
2. **Score fit.** Code compares must-haves against the bank's skill tags. Strong, Good,
   Possible, or Poor, plus a named gap list. Poor stops the pipeline.
3. **Select.** Model receives the parsed posting and the full bank and returns a headline, a
   summary, ordered skill groups, and for each role the bullet ids to include, with optional
   rewordings. The cover letter comes out of the same call, capped near 150 words.
4. **Validate.** Code checks every id exists, every rewording keeps the numbers and tool names
   of its source, and no new number or technology appears. Failures are flagged, never silently
   accepted.
5. **Render.** One Typst template, single column, plain text.
6. **Store.** PDFs to a folder on disk; the selection JSON beside them in the database so any
   document can be re-rendered or diffed.
7. **Advance.** The application moves to Generated and the panel receives the result.

The rule that decides whether the product works: if validation is loose, the user goes back to
reading every line and the one-click promise is gone. Make step 4 strict enough to be annoying
at first.

Two model calls per capture, parse and select, on Claude Opus 5 with structured outputs.
Regenerate skips parse. A generation that fails is retried once by the queue.

**Manual mode.** The model never writes free text that has to be trusted, so it does not have to
be reached over an API. Without an API key the app builds one prompt per capture (parse and
select together, the bank shown with short labels), the user pastes it into Claude on their own
plan and pastes the JSON reply back. Validation, diff, flags and rendering then run exactly as
they would after an API call. One paste round trip, about a minute, no spend. The import at
onboarding works the same way.

## Data model

| Table           | Holds                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Profile         | Contact details, base headline and summary, skill groups, education (with GPA and honours), certifications, file name format |
| BankEntry       | Roles and projects with dates and organisation                          |
| BankBullet      | One achievement each: text, skill tags, metric, stable id, inBase flag  |
| Job             | URL, source host, raw text, parsed posting JSON, content hash           |
| Application     | Job, current stage, fit verdict and score, gaps, rejection reason, generation status |
| StageEvent      | Application, from stage, to stage, timestamp, note. Append only.        |
| Document        | Application, type (resume or cover letter), version, selection JSON, flags, diff, file key |
| Note            | Free text against an application                                        |
| Reminder        | Application, due date, the rule that created it, done timestamp. One per rule per application. |

Every table carries `userId`. There is no row-level security; the database and the app are
reachable only from the machine they run on.

## Onboarding

1. Start the stack with `docker compose up -d --build` and open the web app.
2. Upload the current resume, PDF or Word. The app drafts the experience bank from it and opens
   the editor.
   This is the only step where the model writes into the bank. Show "14 bullets, 3 with numbers"
   and nudge for more.
3. Edit the bank and pick a file name format.
4. Load the extension unpacked. It talks to `localhost`; nothing to connect or paste.
5. Done. Open a job page and click the icon.

## Tracking

The board has one column per stage. Cards show company, title, verdict, and days in stage. The
detail page shows the posting, the exact PDF and cover letter sent, the stage timeline, and
notes. It exists for the day the recruiter calls.

**Reminders.** One rule: no stage change for ten days after Applied creates a follow-up. Rows
are created when the board is read, since nothing else would ever show them, and closed by the
next stage change or a Done button. The board lists open follow-ups above the columns; the
detail page and the panel show a banner.

**Dashboard.** Three numbers: applications marked Applied per week for the last eight weeks,
count per stage, and response rate by fit verdict. A response is a later Screening, Interview or
Offer; a rejection without a screening is not one. The last number is the one that tells the
user whether to trust the verdict.

## Stack

Next.js with route handlers, Prisma on Postgres. A separate Node worker on a pg-boss queue (no
Redis). Claude Opus 5 via the TypeScript SDK with structured outputs. Typst for rendering, with
Liberation Sans in the container. Files on the local disk. Manifest V3 extension with a side
panel. Docker Compose runs Postgres, a one-shot migrate step, the web app and the worker from a
single image.

## Deployment

`docker compose up -d --build` builds the image and starts everything. Postgres data lives in a
named volume; PDFs in `./data/files` on the host. Ports bind to `127.0.0.1`. The API key and the
port come from the root `.env`. Updating is `git pull` and the same command again. The stack
restarts with Docker Desktop, so the extension works whenever the machine is on.

Development happens on the host against the Compose database: `docker compose up -d db`, then
`pnpm web` and `pnpm worker`.

## Scope

In: bank editor with resume import; one-click capture; fit verdict, resume, cover letter, diff,
flags; Attach and Regenerate; stage board, detail page, notes; one reminder rule; three-number
dashboard; Docker Compose deployment.

Out: accounts, billing, teams and coaches; email integration; multiple templates; auto-detecting
Applied; analytics beyond the three numbers; running anywhere but the owner's machine.

## Build order

1. Schema, single-user mode. Done.
2. Bank editor and resume import. Done, import unverified against the model.
3. Generation worker, tested from a plain paste form. Done, unverified against the model.
4. Extension with capture, panel states, Attach. Built, unverified in Chrome.
5. Board, detail page, stage events, notes. Done.
6. Reminders and dashboard. Done.
7. Docker Compose. Done.

## Risks

- Page reading breaks when sites change. Lean on JSON-LD first, keep the text fallback, log
  parse failures per domain.
- The user skips the bank. The import must produce something decent on its own.
- Trust in the output. An invented claim in a sent resume is the one failure that ends use of
  the tool. Validation is the product.
- The machine is off, nothing runs. Accepted; this is a personal tool.
