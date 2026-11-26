# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shortlisted is a single-user job hunting tool that runs on the owner's own machine in Docker
Compose. A Chrome extension captures the job page the user is on, the worker generates a tailored
resume and cover letter from the user's experience bank, and a pipeline tracker follows every
application from Saved to Offer. There are no accounts, no sign-in and no tenancy. The product
design, including the reasoning behind each decision, is in `docs/design.md`. Read it before
changing anything about the pipeline, the stages, or the data model.

pnpm workspaces + Turborepo, TypeScript everywhere, Node 22+.

```
apps/web          Next.js 16 App Router, Tailwind v4. Pages, server actions, and the /api routes
                  the extension calls. Talks to Postgres through @shortlisted/db.
apps/worker       Node process on a pg-boss queue. Runs the generation pipeline (parse, score,
                  select, validate, render, store, advance) for one application per job.
apps/extension    Manifest V3 side panel, bundled with esbuild into apps/extension/dist. Has no
                  dependency on the workspace packages; shared types are mirrored by hand.
packages/db       Prisma schema, the `withUser()` transaction helper, LOCAL_USER_ID.
packages/core     Pure domain code shared by web and worker: zod schemas, fit scoring, the
                  validator, the diff, prompts, Claude calls, the Typst template, storage,
                  the reminder rule, dashboard stats.
Dockerfile        One image for migrate, web and worker. Includes the Typst binary.
docker-compose.yml  db, migrate (one-shot), web, worker.
docs/design.md    The product design. Source of truth for scope and intent.
```

## Commands

Normal use, everything in containers. End users run `setup.ps1` or `setup.sh`, which does the
same thing with the published image (`ghcr.io/maazaowski/shortlisted:latest`, or `SHORTLISTED_IMAGE`)
and falls back to a local build when the pull fails:

```bash
cp .env.example .env            # then pick SHORTLISTED_PROVIDER
docker compose up -d --build    # build the image from this checkout, migrate, start web and worker
docker compose logs -f worker   # watch generation
docker compose down             # stop, keep data.  down -v wipes the database
```

Then open `http://localhost:3000` (or `WEB_PORT`), import a resume at `/onboarding`, and load
`apps/extension/dist` unpacked at `chrome://extensions`. After `git pull`, run
`docker compose up -d --build` again; the migrate service applies new migrations.

Developing on the host against the Compose database:

```bash
docker compose up -d db       # Postgres only, published on 127.0.0.1:5434
pnpm install
pnpm db:migrate               # prisma migrate dev, creates migrations
pnpm --filter @shortlisted/db seed   # sample bank for the local user
pnpm web                      # next dev; set PORT if 3000 is taken
pnpm worker                   # tsx watch, separate terminal
pnpm ext:build                # then load apps/extension/dist in chrome://extensions
pnpm --filter @shortlisted/extension dev    # esbuild watch with inline sourcemaps
pnpm --filter @shortlisted/extension icons  # regenerate PNGs after editing icons/icon.svg
CHROME_BIN=<chrome-for-testing> pnpm --filter @shortlisted/extension e2e   # see below

pnpm typecheck                # every workspace (builds db and core first)
pnpm test                     # vitest, packages/core only
pnpm --filter @shortlisted/core test -t "flags a number"
pnpm format                   # prettier --write, default config
pnpm db:studio                # Prisma Studio
```

If `web` and `worker` containers are running, stop them first (`docker compose stop web worker`)
or set a different `WEB_PORT` so the host dev server and the extension do not collide.

`@shortlisted/db` and `@shortlisted/core` are consumed as compiled `dist`. After editing either,
run `pnpm --filter @shortlisted/core build` (or `db`) before typechecking an app without Turbo.
`pnpm typecheck` at the root builds them first. `apps/worker` also emits `dist`; Compose runs
`node apps/worker/dist/index.js`.

Typst is needed for PDFs. The Docker image has it. On the host: `winget install Typst.Typst`, or
set `TYPST_BIN`. Without it the worker still stores the selection, diff, flags and cover letter
text, marks the application DONE with a warning, leaves the stage at SAVED, and the PDF endpoints
return 409. The template (`packages/core/src/render/typst.ts`) uses Merriweather, bundled in
`packages/core/fonts` under the OFL; `compileTypst` passes `--font-path` and
`--ignore-system-fonts`, so the host and the container produce the same PDF. US Letter, single
column, dark slate ink, centred name with a contact line of Lucide icons, uppercase section
titles over a hairline, consecutive roles at one organisation grouped under its name with a
rule down the left.

`.claude/launch.json` defines a `web` preview config for the in-app browser.

**End-to-end tests.** `pnpm e2e` runs the Playwright suite in `e2e/` (its own workspace,
`@shortlisted/e2e`). `global-setup.ts` builds web, worker and extension, creates two throwaway
databases on the Compose Postgres (`shortlisted_e2e_manual`, `shortlisted_e2e_cli`), writes a
fixture feed through the real classifier (`feed-fixture.ts`), and starts `next start` plus a worker
for each on ports 3041 and 3042, so the real data is never touched. Three projects run in order on
one worker: `manual` (paste mode, the whole product from an empty install), `cli`
(`SHORTLISTED_PROVIDER=claude-cli` with `CLAUDE_BIN` pointing at `e2e/fake-cli`, a stand-in that
answers the import, parse and select prompts from fixed rules) and `extension` (the unpacked
extension in Playwright's Chromium). Files in a project run in name order and build on each
other. `E2E_SKIP_BUILD=1` reuses the last build; logs are in `e2e/.tmp/logs`. The Dockerfile
copies `e2e/package.json` so the lockfile matches and installs with
`--filter "!@shortlisted/e2e"`; `.dockerignore` keeps the rest of `e2e/` out of the image.
`.github/workflows/e2e.yml` runs the suite on pull requests. See `e2e/README.md`, and
`docs/test-findings.md` for what the first full pass found.

**Extension end-to-end test (older script).** `apps/extension/e2e/run.mjs` launches a throwaway Chrome with
`apps/extension/dist` loaded, opens a local fixture posting (`e2e/fixtures/ledgerly.html`, with a
JSON-LD block and an application form), runs the panel page as a background tab in the same
window, and drives capture, prompt, pasted reply (`e2e/fixtures/reply.json`), generation, Attach
into the form, and a stage change over the DevTools protocol. It needs the web app in manual mode
on `API_BASE` (default `http://localhost:3010`), a worker consuming the queue, and `CHROME_BIN`
pointing at a Chrome for Testing binary (`npx @puppeteer/browsers install chrome@stable`), because
branded Chrome ignores `--load-extension`. Screenshots land in `apps/extension/e2e/out/`. Pass
`--headed` to watch it.

**Releases.** Pushing a `v*.*.*` tag runs `.github/workflows/release.yml`: it builds the image
for amd64 and arm64 with `SHORTLISTED_VERSION` set to the tag, pushes it to GHCR as the tag and
`latest`, and attaches `shortlisted-extension.zip` to the GitHub Release. `apps/web/lib/version.ts`
compares `SHORTLISTED_VERSION` with the latest release (cached six hours, off with
`SHORTLISTED_UPDATE_CHECK=off`, never for a `dev` build) and Settings shows the update commands.

**Model choice in the app.** Nobody has to edit `.env` to pick a provider. `ModelChoice`
(`apps/web/components/model-choice.tsx`), on `/setup` and `/settings`, saves the choice to
`Preferences.provider`; `setProviderChoice()` in `packages/core/src/provider.ts` makes
`provider()` return it ahead of the environment. The web app loads it on every request through
`requireUser()` and `resolveUserId()` (`apps/web/lib/provider-choice.ts`), and the worker at the
start of each job, so a change needs no restart. Signing in to Claude Code or Codex also happens
on the page: `apps/web/lib/cli-login.ts` starts the tool's own sign-in as a child process, shows
the link it prints, writes the pasted code to its stdin (Claude Code) or waits for it to finish
(Codex device code), and holds one session per process. The app never sees a password. The API
key option is only offered when `ANTHROPIC_API_KEY` is set. In the e2e suite the stand-in tool
signs in with the code `good-code` when `FAKE_CLAUDE_HOME` is set.

**Setup checklist.** `/setup` reads real state through `setupStatus()` in `apps/web/lib/setup.ts`:
the provider and, for a CLI provider, `cliStatus()` (an exit code, no model call); whether a
profile exists; whether the settings form was saved (`Preferences.savedAt`); and whether the
extension has called `/api/me` from a `chrome-extension://` origin (`Preferences.extensionSeenAt`).
The board sends a user with no profile there. The Test button calls `pingModel()`.

**Preferences.** One `Preferences` row per user: home country, passport, pools, career fields,
target titles, weekly goal, feed address. The shape, the country list, the sixteen career fields
and the pools live in `packages/core/src/preferences.ts`. Read through `getPreferences()` in
`apps/web/lib/preferences.ts`, which returns the defaults (Pakistan) when nothing is saved.

**Job feed.** Listings come from one shared feed, not from each install. `packages/feed` reads
`companies.yaml` (one company board per line), fetches each board through an adapter in
`src/sources/index.ts` (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Personio;
public keyless JSON, or XML for Personio, links to the employer's own posting), classifies every job with the pure functions in
`packages/core/src/listings/` and writes `remote`, `relocate` and `gulf` `.ndjson.gz` files plus
`meta.json`. `.github/workflows/feed.yml` runs it daily and force-pushes one commit to the `feed`
branch. `FeedListingSchema` in `listings/feed.ts` is the contract between the builder and the
installs: add fields as optional, never repurpose one. The classifier stores a remote scope
(`allowed` country codes and region ids, `excluded`, a confidence of stated, likely or unclear, and
the sentence that decided it), not a yes or no for one country; `admitsCountry(scope, code)`
answers for any home country. Sponsorship is read only from explicit sentences; silence is
`unknown`. `licensedSponsor` comes from the UK Home Office register (OGL v3.0). The UI must call
this "screened by rules" and show the evidence; nobody checks listings by hand. Job aggregators
(Himalayas, Remotive, RemoteOK, We Work Remotely, Jobicy) are left out because their terms forbid
republishing or require linking to them instead of the employer; see `packages/feed/README.md`.
Local build: `pnpm --filter @shortlisted/feed build-feed --out out --only gitlab,careem`.
`pnpm format` rewrites the whole repo; do not run it to check formatting.

**Listings in the app.** `Listing` holds this install's copy of the feed plus what the user did
with each row (`savedAt`, `hiddenAt`, `applicationId`); `FeedSync` holds the sync state. Both carry
`userId`. `syncFeed()` in `apps/worker/src/feed-sync.ts` downloads the feed (address:
`SHORTLISTED_FEED_URL`, then `Preferences.feedUrl`, then `DEFAULT_FEED_URL`; a `file://` address
reads a local build), adds new rows, rewrites changed ones by `feedHash`, marks rows the feed
dropped as closed and reopens ones that return. It never touches the user's columns and never
throws: a failure is stored as a sentence in `FeedSync.lastError` and the old listings stay. The
worker runs it on the `feed-sync` queue: on start, every six hours (`boss.schedule`), and when
`/jobs` is read with a sync over a day old (`feedStatus()` in `apps/web/lib/listings.ts`, the same
read-time pattern as reminders). `Listing.admits` is the remote scope flattened to country codes
(`admitCodes()`, `["*"]` for anywhere), so a pool is a database filter: Remote is `admits` has the
home country or `*` (plus empty `admits` when "Include unclear" is ticked), Relocate is the
`relocate` family minus offices in the user's home or passport country, a regional pool is its
family. `eligibilityTags()` turns a row into the tags the pages show; every tag that makes a claim
carries the posting's sentence. "Tailor my resume" (`tailorListingAction`) calls
`createApplicationFromCapture` with a JobPosting block built from the listing, so the pipeline is
the same as an extension capture, and links `Listing.applicationId`.

**Matching and the CV check.** Both are code, no model call. `matchListing()` in
`packages/core/src/listings/match.ts` compares a listing's skill tags and title with the bank's
skills and the target titles (the profile headline when none are set); `/jobs` shows "n of m skills
in your bank" on each row and "Best match first" scores every listing the filters leave
(`matchPage()` in `apps/web/lib/listings.ts`), because the database cannot sort by the bank. The
tags come from a fixed word list, so the UI calls it a rough guide. "Read the key requirements"
(`keyRequirementsAction`) runs `parseJob` once and stores `Listing.parsed`; Tailor passes it to
`createApplicationFromCapture` so the worker skips its parse, and a feed sync clears it when the
posting changes. It is not offered in manual mode. The worker stores the whole `FitResult`
(`gaps`, `covered`, `niceToHaveCovered`) on the application. `checkCv()` in
`packages/core/src/cv-check.ts` is a list of rules over the bank, each with a pass sentence and a
finding that costs points; `/bank/check` renders it and never edits the bank.

**Tracker additions.** `followupTemplates()` in `packages/core/src/followups.ts` fills five plain
message templates from the application (no model call); the file has no Node imports and is also
exported as `@shortlisted/core/followups` for the client component. `Application` carries
`contactName`, `contactEmail`, `contactUrl`, `interviewAt` and `deadlineAt`, all typed by the user
(`POST /api/applications/:id/details`, `updateDetails()`); a contact is never guessed, the page only
offers search links. `validateCoverLetter()` in `validate.ts` flags numbers and capitalised terms
the bank does not contain; the worker stores the flags on the COVER_LETTER document, and
`saveCoverLetter()` (`POST /api/applications/:id/cover-letter`) saves an edit in place, re-checks
it and renders the PDF again in the web process, which is the one place the web app runs Typst.
`ApplicationView` gained `covered`, `niceToHaveCovered`, `contact`, `interviewAt`, `deadlineAt` and
`coverLetter.flags` / `.edited`; the extension mirror has them. The dashboard shows this week
against `Preferences.weeklyGoal`. `GET /api/export` (`apps/web/lib/export.ts`) downloads everything
as JSON, or one row per application with `?format=csv`; Settings links both.

## Environment and config

- **One `.env` at the repo root.** Nothing reads it automatically. Each host entry point loads it
  explicitly: `apps/web/next.config.ts`, `apps/worker/src/env.ts`, and every script in
  `packages/db/scripts`. A new script or app must do the same (`process.loadEnvFile`).
- **Compose reads `.env` too**, but only through `${VAR}` interpolation in `docker-compose.yml`
  (`ANTHROPIC_API_KEY`, `SHORTLISTED_MODEL`, `WEB_PORT`). It does not use `env_file`, because
  the host `DATABASE_URL` points at `localhost:5434` and the containers need `db:5432`.
- **One `DATABASE_URL`**, the `postgres` superuser. There is no app role and no RLS.
- `STORAGE_DIR` is `./data/files` on the host and `/data/files` in the containers, bind-mounted
  to the same directory, so PDFs are shared between the two ways of running.
- **`serverExternalPackages` in `next.config.ts`** lists `@prisma/client`, both workspace
  packages, `pg-boss`, `unpdf` and `mammoth`. Add any new Node-only dependency there or Next will try to
  bundle it.
- `ANTHROPIC_API_KEY` is only needed for the anthropic provider (see Providers). Without it
  the app runs in manual mode.

## Architecture invariants

### 1. One local user, named everywhere

`LOCAL_USER_ID` from `@shortlisted/db` is the only user. Every tenant-owned table still carries
`userId` and every query goes through `withUser(userId, tx => ...)`, which is now a plain
`prisma.$transaction` wrapper. The column and the parameter stay so that a second user would be
a data change and a change in one function, not a rewrite. Pages get the id from `requireUser()`
in `apps/web/lib/session.ts`; API routes from `resolveUserId()` in `apps/web/lib/api-auth.ts`.
Neither ever fails. Because there is no auth, Compose binds every port to `127.0.0.1`.

**When you add a Prisma model, give it a `userId` column and filter on it.**

### 2. The model selects, it never invents

The experience bank (`Profile` + `BankEntry` + `BankBullet`) is the only source of claims. The
select call returns bullet ids plus optional rewordings, not prose, and the ids of the
certifications worth showing for this posting (`Profile.certifications`, each with an id). `validateSelection()` in
`packages/core/src/validate.ts` drops any id that is not in the bank and flags any number or
tool name a rewording adds. Nothing is fixed silently; flags surface to the user. If you loosen
the validator, the user goes back to proofreading whole documents and the product's promise is
gone. The only model call allowed to write into the bank is the resume import during onboarding
(`apps/web/lib/resume-text.ts` reads PDF through unpdf and .docx through mammoth; the model
only ever sees plain text).

Fit scoring (`scoreFit`) is code, not a model call, so it runs before any generation is paid for.
A POOR verdict stops the pipeline with `generationStatus: SKIPPED`.

### 3. One stage at a time, every change is an event

`Application.stage` is the current stage. `StageEvent` is append-only history. Change stage only
through `changeStage()` in `apps/web/lib/applications.ts`, which writes both and maintains the
reminders (invariant 6). The system sets SAVED (on capture) and GENERATED (in the worker, only
when a PDF was rendered). Every other transition is a user action. Do not auto-detect Applied
from the page. Stage names and labels live in `packages/core/src/stages.ts` (also exported as
`@shortlisted/core/stages`).

### 4. The extension and the web app read the same JSON

`ApplicationView` from `apps/web/lib/applications.ts` is what `/api/applications/:id` returns,
what the detail page renders, and what the side panel renders. The extension cannot import
`@shortlisted/core`, so `ApplicationView`, `Capture`, the stage list and the labels are copied
by hand into `apps/extension/src/types.ts`. Change the view in `applications.ts`, then update
the mirror. The extension's only setting is the web app address; `/api/me` is its health check.

### 5. Generation runs in the worker, one job at a time

`apps/web/lib/queue.ts` enqueues `{ applicationId, userId, note }` on the pg-boss `generate`
queue with `retryLimit: 1, retryDelay: 15`. `apps/worker/src/pipeline.ts` runs the seven steps,
each DB touch in its own `withUser` transaction. On any error it writes `FAILED` plus the
message to the application and rethrows; the worker handler rethrows too, so pg-boss retries
once. Parse is skipped when `Job.parsed` is already set, so Regenerate pays for the select call
only. Documents are versioned per application; each run creates a new RESUME and COVER_LETTER
row. A render failure (no Typst) is DONE with a warning and `fileKey: null`, and the stage does
not move to GENERATED.

### 6. Reminders are rows, synced on read

The one rule lives in `packages/core/src/reminders.ts`: an application in APPLIED with no stage
change for ten days is due a follow-up. `syncReminders()` in `apps/web/lib/reminders.ts` runs
when the board is read and inserts due rows with `skipDuplicates` against the unique
`(applicationId, rule)`. `changeStage()` closes open reminders when leaving APPLIED and deletes
them when entering APPLIED so the clock restarts. There is no cron: nothing would notify anyone.

## Providers

`provider()` in `packages/core/src/provider.ts` decides who runs the three model calls (parse,
select, import). `SHORTLISTED_PROVIDER=anthropic|claude-cli|codex-cli|manual`; unset, it is
`anthropic` when `ANTHROPIC_API_KEY` is set and `manual` otherwise. The CLI providers are never
guessed.

**claude-cli and codex-cli** run the same text prompts as manual mode through Claude Code or
Codex, signed in with the user's own subscription. `parseJob`, `selectForJob` and
`importBankFromResume` in `claude.ts` dispatch to `askCli()` in `packages/core/src/cli.ts`, which
pipes the prompt on stdin, reads the reply with the manual-mode parsers (`parseParseReply`,
`parseSelectReply`, `parseImportReply`), and retries once with the reason when the reply does not
parse. Parse and select stay two calls, so a POOR fit still stops before select. Every difference
between the two tools is in `invocation()`: Claude Code runs with one turn, no tools, `--safe-mode`
and no session file, and its child environment has `ANTHROPIC_API_KEY` removed because print mode
would otherwise bill the key instead of the subscription. Codex runs `exec` in the read-only
sandbox. Both run in the temp directory. The image installs both tools; logins live in the
`cli_auth` volume at `/cli` (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), set up once with
`docker compose exec worker claude auth login` or `codex login --device-auth`. On the host,
`CLAUDE_BIN` and `CODEX_BIN` override the commands. The pipeline and the `=== "manual"` branches
are unchanged: a CLI provider takes the automatic path.

**Manual** costs nothing and needs no key. Capture creates the application in
`generationStatus: WAITING` and does not enqueue. `GET /api/applications/:id/prompt` returns
the prompt (`buildSelectionPrompt` in `packages/core/src/manual.ts`: parse and select in one
reply, the bank rendered with short aliases `e1`/`b3` instead of cuids). The user pastes it into
Claude and posts the JSON reply to `POST /api/applications/:id/reply`; `parseSelectionReply`
validates it, maps aliases back, stores the parsed posting on the job and the selection in
`Application.pendingSelection`, sets `QUEUED` and enqueues. The worker sees `pendingSelection`
and skips both model calls; everything after (score, validate, diff, render, advance) is
identical, and a POOR fit does not skip rendering because there is nothing to save. Regenerate
in manual mode returns to `WAITING` with the note included in the next prompt. Onboarding does
the same for the import: `importResumeAction` returns the prompt and `importReplyAction` takes
the bank JSON back. The detail page (`components/reply-box.tsx`), the board and the extension
panel all render the waiting state from `ApplicationView.needsReply`.

## Claude API usage

Model is `claude-opus-5` (override with `SHORTLISTED_MODEL`). All calls use
`client.messages.parse` with `zodOutputFormat` so the response is validated data. The bank goes
in the system prompt with a `cache_control` breakpoint because it is identical across captures.
Prompts live in `packages/core/src/prompts.ts`, calls in `packages/core/src/claude.ts`.
Check `stop_reason === "refusal"` before reading output (`ModelRefusedError`).

## Conventions

- Copy in the UI: plain sentences, no em dashes, no exclamation marks, no "AI" in user-facing
  text. Say what happens ("Resume attached."), not how it feels.
- Server code that must not reach the client imports `server-only`.
- Route handlers call `resolveUserId(req)`, export `OPTIONS` returning `preflight(req)`, and
  build responses with `json(req, ...)` so the CORS headers for `chrome-extension://` origins
  are set. Add new API routes the same way.
- Dates in the bank are `YYYY-MM` strings. Skill tags are lowercase and pass through
  `normalizeSkills()` on write.
- Unit tests are Vitest next to the source (`*.test.ts`), for pure functions in `packages/core`.
  Pages, API routes, the worker and the extension are covered by the Playwright suite in `e2e/`.
  A change to visible text or a label usually needs the matching locator in `e2e/tests` updated.
- `noUncheckedIndexedAccess` is on everywhere; index results are `T | undefined`.
- Line endings are LF (`.gitattributes`). No shell scripts in the Docker path; Compose uses
  `command:` arrays.
- **UI.** Warm paper neutrals, hairline borders, one accent, no gradients or shadows. Every
  colour is a CSS variable in `apps/web/app/globals.css`, defined once with `light-dark()`.
  Colour mode and accent come from two cookies (`sl-mode`, `sl-accent`) the root layout reads
  and sets as `data-mode` / `data-accent` on `<html>`; system mode is the absence of
  `data-mode`. No inline theme script. `ThemePicker` in `components/theme.tsx` writes the
  cookies. Type: Geist for UI, Instrument Serif for titles (`.display`), Geist Mono for labels
  and numbers (`.label`, `.num`), all self-hosted in `app/fonts`. Shared classes: `.card`,
  `.btn` (`-primary` is solid ink, `-ghost`, `-sm`, `-danger`), `.field`, `.field-label`,
  `.hint`, `.tag` (dot + text, the only status style), `.chip`, `.callout-*`, `.enter` (mount
  fade, stagger with `--i`). Icons come from `lucide-react`, 13 to 16px, stroke 1.75, and only
  where they carry meaning; the nav is text. The extension mirrors the same tokens and fonts in
  `apps/extension/sidepanel.css` and follows the system scheme.

## Status

Verified on 14 Nov 2026 with a real signed-in Claude Code (`e2e/real/real-model.spec.ts`, run
twice from an empty install, about three minutes each): choosing the plan in the app, the test
call, resume import, key requirements on a live listing, tailoring from a listing and from a
pasted posting, regenerate, a poor fit and "Tailor anyway", a page that is not a job, and the
extension. Releases v0.3.0 and v0.3.1, a fresh install from the published image, the update
notice and the update were also run for real. Still not verified: Codex, the anthropic provider,
the setup script on a Mac, and the extension on live job sites.

Fit scoring changed after that run showed real postings all scoring POOR: `skillCovered()` in
`skills.ts` splits compound bank skills (`expandSkill`), matches general terms to concrete ones
(`FAMILIES`), and treats "a or b" as any-of; the parse prompt caps must-haves at twelve concrete
requirements; a posting with no must-haves is POSSIBLE, not STRONG; and a POOR fit can be
tailored anyway (`force` on the regenerate route and the queue job). None of this touches the
validator, which still decides what may appear on a resume.

Verified on 13 Nov 2026 by `pnpm e2e` (now 117 tests) and `pnpm test` (now 255): paste mode end to end
from an empty install, the automatic path against the stand-in tool, the extension (capture,
reply, Attach, stage change), jobs pools and filters against a fixture feed, the tracker
additions, export, and the Docker image build. Still not verified: a real signed-in Claude Code
or Codex, the anthropic provider, the setup scripts on a clean machine, the release and feed
workflows, and the extension on live job sites. `docs/test-findings.md` lists the open caveats
and missing features (no delete for an application, no restore from the export, among others).

Verified on 11 Sep 2026: the single-user conversion, the init migration, the seed, the board,
bank, generate, dashboard and detail pages, `/api/me`, capture and URL lookup without auth, the
worker retry path, Typst rendering of the template from the seeded bank on the host and inside
the worker container, the reminder rule (created once on board read, closed by
stage change and by the Done button), the dashboard numbers, and the full Compose stack (migrate
exits 0, web on `WEB_PORT`, worker picks jobs off the shared queue).

Verified on 13 Sep 2026: manual mode end to end (capture to WAITING, prompt with aliases,
pasted reply accepted, worker ran from the pasted selection, validator flagged an added number,
both PDFs rendered, stage GENERATED; bad pastes return sentence errors; Regenerate returns to
WAITING with the note in the prompt).

Not yet verified, because no `ANTHROPIC_API_KEY` was available: the anthropic provider's parse,
select and import calls. The extension
was verified on 13 Sep 2026 by the e2e script above: capture from a JSON-LD page, the waiting
state, pasted reply, generation, Attach filling a file input and cover letter textarea, Mark
Applied. Not yet tried on a live Greenhouse or Lever page.

Build order from `docs/design.md`: 1 to 6 done as above, 7 (billing) dropped.

## Local quirks

Ports 3000 and 3001 are taken by other containers on this machine, so `.env` sets
`WEB_PORT=3020` and the in-app preview runs `next dev` on 3010. Point the extension's address
at whichever one is running. The Typst winget install is not on PATH in existing shells; `.env`
sets `TYPST_BIN` to its full path for host runs.
