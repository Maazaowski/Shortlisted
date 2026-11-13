# Shortlisted job feed

This branch holds the job feed that Shortlisted installs download. It is rebuilt once a day by the `Job feed` workflow on the main branch and always contains a single commit.

- `meta.json` has the build time, the counts, and the list of files.
- `remote.ndjson.gz`, `relocate.ndjson.gz` and `gulf.ndjson.gz` hold one listing per line as JSON. A listing can appear in more than one file; its `id` is the same in each.

Every listing links to the employer's own posting. The listings come from the public job boards of the companies in `packages/feed/companies.yaml` on the main branch. Remote scope, sponsorship and career field are worked out by rules from the posting's own words, and the sentence behind each answer is kept in the listing. Nobody checks listings by hand.

The "licensed sponsor" tag on UK roles comes from the Register of licensed sponsors: workers, published by the Home Office. Contains public sector information licensed under the Open Government Licence v3.0.
