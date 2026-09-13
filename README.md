# Shortlisted

One click on a job page. A tailored resume and cover letter, generated only from achievements you
wrote down, and the application tracked from Saved to Offer. Runs on your own machine, for you
alone. No accounts.

See `docs/design.md` for the product design and `CLAUDE.md` for how the code is organised.

## Run it

You need Docker Desktop. An Anthropic API key is optional: without one the app runs in manual
mode, where each capture gives you a prompt to paste into Claude and a box to paste the reply
into. With a key set in `.env`, the calls run automatically and cost a few cents each.

```bash
cp .env.example .env            # optional: ANTHROPIC_API_KEY; change WEB_PORT if 3000 is taken
docker compose up -d --build
```

Then:

1. Open http://localhost:3000 and upload your current resume, PDF or Word. It becomes your
   experience bank.
2. Open `/bank` and add everything the resume left out. More bullets with numbers means better
   tailoring.
3. Load the extension: `pnpm install && pnpm ext:build`, then at `chrome://extensions` turn on
   Developer mode and load `apps/extension/dist` unpacked. If you changed `WEB_PORT`, set the
   address under the panel's Settings.
4. Open a job posting and click the Shortlisted icon.

PDFs are written to `data/files`. `docker compose down` stops everything and keeps your data;
`docker compose down -v` wipes the database. After pulling changes, run
`docker compose up -d --build` again.

## Developing

```bash
docker compose up -d db         # Postgres only
pnpm install
pnpm db:migrate
pnpm --filter @shortlisted/db seed
pnpm web                        # terminal 1
pnpm worker                     # terminal 2
pnpm typecheck && pnpm test
```

Install Typst for PDFs on the host: `winget install Typst.Typst`. Stop the `web` and `worker`
containers first so they do not compete for the queue.
