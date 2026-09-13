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

Normal use, everything in containers:

```bash
cp .env.example .env            # then set ANTHROPIC_API_KEY
docker compose up -d --build    # build the image, migrate, start web and worker
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
return 409.

`.claude/launch.json` defines a `web` preview config for the in-app browser.

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
select call returns bullet ids plus optional rewordings, not prose. `validateSelection()` in
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
select, import). `SHORTLISTED_PROVIDER=anthropic|manual`; unset, it is `anthropic` when
`ANTHROPIC_API_KEY` is set and `manual` otherwise.

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
- Tests are Vitest next to the source (`*.test.ts`). Pure functions in `packages/core` get tests;
  UI does not yet.
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

Verified on 11 Sep 2026: the single-user conversion, the init migration, the seed, the board,
bank, generate, dashboard and detail pages, `/api/me`, capture and URL lookup without auth, the
worker retry path, Typst rendering of the template from the seeded bank on the host and inside
the worker container (Liberation Sans), the reminder rule (created once on board read, closed by
stage change and by the Done button), the dashboard numbers, and the full Compose stack (migrate
exits 0, web on `WEB_PORT`, worker picks jobs off the shared queue).

Verified on 13 Sep 2026: manual mode end to end (capture to WAITING, prompt with aliases,
pasted reply accepted, worker ran from the pasted selection, validator flagged an added number,
both PDFs rendered, stage GENERATED; bad pastes return sentence errors; Regenerate returns to
WAITING with the note in the prompt).

Not yet verified, because no `ANTHROPIC_API_KEY` was available: the anthropic provider's parse,
select and import calls. Also not yet
verified: the extension loaded in Chrome (capture, the panel states, Attach on a real form).
First thing to do in a new session with a key: set it in `.env`, `docker compose up -d`, import
a real resume at `/onboarding`, paste a posting at `/generate`, watch `docker compose logs -f
worker`, then load the extension and capture a live posting.

Build order from `docs/design.md`: 1 to 6 done as above, 7 (billing) dropped.

## Local quirks

Ports 3000 and 3001 are taken by other containers on this machine, so `.env` sets
`WEB_PORT=3020` and the in-app preview runs `next dev` on 3010. Point the extension's address
at whichever one is running. The Typst winget install is not on PATH in existing shells; `.env`
sets `TYPST_BIN` to its full path for host runs.
