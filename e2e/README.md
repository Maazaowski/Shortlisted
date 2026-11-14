# End-to-end tests

Playwright drives the real app in a browser. The tests never touch your own data: they make two throwaway databases on the same Postgres server, write files to `e2e/.tmp`, and run their own web servers and workers on ports 3041 and 3042.

| Project | What it runs against | What it covers |
| --- | --- | --- |
| `manual` | paste mode | the whole product from an empty install |
| `cli` | `claude-cli` with a stand-in tool (`fake-cli/`) | the automatic path, with no subscription and no network |
| `extension` | the paste-mode stack | the Chrome extension, loaded unpacked into Playwright's Chromium |

## Run

You need the Compose database running, Typst on the machine (`TYPST_BIN` in `.env` or on PATH), and Playwright's browser, once:

```bash
docker compose up -d db
```

```bash
pnpm --filter @shortlisted/e2e exec playwright install chromium
```

Then, from the repo root:

```bash
pnpm e2e
```

That builds web, worker and extension, resets both test databases, starts everything, runs the tests and stops everything. It takes about three minutes.

```bash
pnpm --filter @shortlisted/e2e e2e:manual      # one project
pnpm --filter @shortlisted/e2e e2e:report      # open the HTML report of the last run
E2E_SKIP_BUILD=1 pnpm e2e                      # reuse the last build
```

`E2E_DATABASE_URL` points the tests at another Postgres server. `E2E_MANUAL_PORT` and `E2E_CLI_PORT` move the ports. Server logs are in `e2e/.tmp/logs`.

## How it is put together

- `stack.ts` names the two stacks and their environment.
- `global-setup.ts` builds, resets the databases with `prisma migrate deploy`, writes the fixture job feed, starts the servers, and returns the function that stops them.
- `feed-fixture.ts` runs ten made-up postings through the real classifier and writes them in the published feed format. The worker reads them through a `file://` feed address.
- `fake-cli/claude.mjs` answers the import, parse and select prompts from fixed rules. A posting steers it with a marker word: `FAKE_FAIL`, `FAKE_BADJSON`, `FAKE_NOTJOB`, `FAKE_INVENT`.
- `helpers.ts` has `sql()` for reading and changing the test database, `posting()` for a unique posting, and `runFeedSync()`.

The app has one user, so the tests run on one worker and the files in a project run in name order, each building on the one before. A failure early in a file can fail later tests in it.

When writing a new test, `dump(page, "name")` from `helpers.ts` writes the page's accessibility tree to `e2e/.tmp/dump`, which is the quickest way to find the right role and name for a locator.

## The video walkthrough

`walkthrough/tour.spec.ts` is not a test. It drives both stacks slowly with captions on screen and records three clips; `walkthrough/join.mjs` joins them into one MP4, with the extension's side panel placed beside the job page. It only runs when asked:

```bash
E2E_WALKTHROUGH=1 pnpm --filter @shortlisted/e2e exec playwright test --project=walkthrough
```

```bash
node e2e/walkthrough/join.mjs <path to a full ffmpeg> docs/video/shortlisted-walkthrough.mp4
```

`WT_SPEED=0.05` makes a one minute dry run for checking the script. The ffmpeg that ships with Playwright can only record, so the join needs a full build. After changing a page, update the captions and locators in the tour the same way as the tests.

### The release walkthrough

`walkthrough/release-tour.mjs` records how a release reaches a user: tagging, the GitHub pages, a fresh install of the published image, the update notice and the update. The browser parts are live. The terminal parts replay output saved from the real commands by `walkthrough/capture.mjs`, shown in `walkthrough/terminal.html`.

Run the fresh install in its own folder with `COMPOSE_PROJECT_NAME` set to something other than `shortlisted`, and stop your own `db` container first. The compose file fixes both the project name and the database port, so a second copy on the same computer otherwise becomes the same installation as yours.
