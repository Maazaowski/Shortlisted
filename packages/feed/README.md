# @shortlisted/feed

Builds the shared job feed. A scheduled GitHub Action (`.github/workflows/feed.yml`) runs it once a day and publishes the result on the `feed` branch. Every Shortlisted install downloads the feed from there, so no install fetches a job board itself.

## Where the listings come from

Company job boards only, through the public JSON endpoints the board systems publish for showing a company's jobs elsewhere:

| System | Endpoint | Note |
| --- | --- | --- |
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` | |
| Lever | `api.lever.co/v0/postings/{board}?mode=json` | |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{board}` | Unlisted jobs are dropped. |
| Workable | `apply.workable.com/api/v1/widget/accounts/{board}?details=true` | |
| Recruitee | `{board}.recruitee.com/api/offers/` | Stops working without a key on 10 Feb 2027. |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{board}/postings` | The list has no description, so only remote, Gulf and UK jobs are read in full, at most 400 per company. |
| Personio | `{board}.jobs.personio.de/xml?language=en` | XML. `.jobs.personio.com` is tried when `.de` has no such company. |

Every listing links to the employer's own posting. No page is scraped and no key is used.

The UK "licensed sponsor" tag comes from the Home Office register of licensed sponsors, under the Open Government Licence v3.0.

## Sources left out, and why

Checked on 11 Nov 2026.

- **Himalayas.** Its API terms forbid passing listings on through feeds and forbid replacing its link with the employer's.
- **Remotive.** Its terms forbid redistributing listings to third parties.
- **RemoteOK, We Work Remotely, Jobicy.** Each requires that the apply link point to its own site, not the employer. Shortlisted only links to the employer.
- **LinkedIn, Indeed and any site without a public endpoint.** Not scraped.

None of the first five board systems above publishes terms for its public endpoint that either grant or forbid republishing. SmartRecruiters and Personio were added on 26 Nov 2026 and their terms have not been read yet. If a system objects, remove its adapter from `src/sources/index.ts`.

## Adding a company

Add a line to `companies.yaml`:

```yaml
- { ats: greenhouse, board: gitlab, name: GitLab }
```

`board` is the company's id in its jobs page address. Then check that it answers:

```bash
pnpm --filter @shortlisted/feed check-boards
```

## Building locally

```bash
pnpm --filter @shortlisted/core build
```

```bash
pnpm --filter @shortlisted/feed build-feed --out out --only gitlab,careem,canonical
```

`--prev <dir>` points at a previous build so each listing keeps its first-seen date. `--no-sponsors` skips the UK register. A board that fails is logged and skipped. The build stops without writing anything when fewer than 60% of boards answer, so a bad day cannot wipe the feed.

## What is kept

A job is kept when it is remote, when it states visa sponsorship or relocation support, when the employer is a licensed UK sponsor and the role is in the UK, or when it is an office role in a Gulf country. Everything else is dropped. The rules are in `packages/core/src/listings/` with their tests.

## Known limits

- Gulf coverage is thin. Most large Gulf employers use Workday, Oracle or SAP, which have no public endpoint like these.
- A SmartRecruiters job is only read when its list entry is remote, in a Gulf country or in the UK. An office role elsewhere that offers a visa in its text is missed. An unknown SmartRecruiters company answers with an empty list, so `check-boards` shows it as empty, not failed.
- A Personio posting written only in German keeps its German text. The rules read English, so it is kept only when its office says remote.
- Most remote roles are limited to one country. In the first build, about 4% of remote listings admitted someone living in Pakistan.
- Skills come from a fixed vocabulary. A skill that is not in the list is not found.
- Application questions and whether a cover letter is required are not in the feed. No list endpoint exposes them.
