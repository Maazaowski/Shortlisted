import type { FitResult } from "./fit.js";
import type { ParsedJob } from "./schemas.js";

/** The per-posting half of the select call. The bank is the other half. */
export function renderJobBlock(
  job: ParsedJob,
  fit: FitResult,
  note?: string | null,
): string {
  return [
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    `Seniority: ${job.seniority}`,
    `Must-have skills: ${job.mustHaveSkills.join(", ") || "none listed"}`,
    `Nice-to-have skills: ${job.niceToHaveSkills.join(", ") || "none listed"}`,
    `Keywords: ${job.keywords.join(", ") || "none"}`,
    `Responsibilities:\n${job.responsibilities.map((r) => `- ${r}`).join("\n") || "- none listed"}`,
    "",
    `Fit computed by code: ${fit.verdict} (${fit.score}/100). Gaps the bank does not cover: ${fit.gaps.join(", ") || "none"}. Do not paper over the gaps; do not claim them.`,
    note
      ? `\nInstruction from the candidate for this regeneration: ${note}`
      : "",
  ].join("\n");
}

export const PARSE_SYSTEM = `You extract structured data from job postings.

You receive the text of a web page. If it is a single job posting, set isJobPosting to true and fill every field from the posting alone. If it is a listing page, a login wall, or anything that is not one job, set isJobPosting to false and leave the arrays empty.

Rules for skills:
- mustHaveSkills are the concrete technologies, tools, languages and named methods the posting states as required. Lowercase. One per item, so "Node.js and Postgres" becomes two items.
- At most twelve must-haves. When the posting names more, keep the ones it stresses most: those in the title, in a requirements list, or repeated.
- Something the posting only mentions, describes as part of the team's stack, or lists under "you will" duties is not a must-have. A candidate is scored on this list, so every item must be something the posting would reject a candidate for lacking.
- When the posting accepts any one of several ("Go or TypeScript", "AWS, GCP or Azure", "a relational database such as Postgres or MySQL"), write them as one item joined with " or ": "go or typescript", "aws or gcp or azure", "postgres or mysql".
- niceToHaveSkills are the ones marked preferred, bonus, a plus, familiarity with, or nice to have.
- Leave out general practices that any person in the role does, such as "api design", "logging", "monitoring", "on-call", "code review", "version control", "testing", "agile". Put those in responsibilities or keywords.
- Do not put soft skills like "communication" in either list. Put those in keywords.
- Keep the posting's own spelling of a technology apart from casing.`;

export const SELECT_SYSTEM = `You tailor a resume to a job posting using only the candidate's experience bank.

The bank is JSON. Each bullet has an id. You return a selection, not a document. The renderer builds the document from your selection and a validator checks every claim against the bank. Anything it cannot trace is dropped and flagged to the candidate, so there is no benefit to stretching.

Rules:
- Cite bullets by id only. Never invent an id, a number, a tool, an employer, or a date.
- Choose the bullets most relevant to the posting's must-have skills and responsibilities. Prefer bullets with metrics. Include every role, with fewer bullets for less relevant ones. Projects only if they carry skills the roles do not.
- Length follows experience. Under five years, aim for one page: eight to twelve bullets across all roles. Five years or more, two pages are fine: up to twenty bullets, with the most relevant roles carrying the most. Never pad. A bullet that does not speak to the posting stays out, whatever the count.
- certifications lists the ids of the candidate's certifications that speak to the posting, most relevant first. Leave out the rest. An empty list is normal.
- Rewording is optional and light: reorder clauses, lead with the outcome, use the posting's terminology when the bank clearly means the same thing. Keep every number and every tool name from the original. Do not add any.
- The headline should match the job title when the candidate's experience honestly supports it. Otherwise use the closest true title.
- The summary is two or three sentences drawn from the bank. No adjectives about the candidate's character.
- Reorder skillGroups so the most relevant group is first. Only include skills present in the bank.
- The cover letter is under 150 words, addressed to the hiring team, plain English, specific to this company and role, no flattery, no bullet lists, no em dashes. It names two or three concrete things from the bank that map to the posting and ends with one sentence asking for a conversation, then the candidate's full name on a line of its own.

Return exactly the schema requested.`;

export const IMPORT_SYSTEM = `You turn the text of an existing resume into an experience bank.

Extract every role and project with every bullet you find. Do not merge, summarise, or drop bullets. Keep the candidate's wording. For each bullet, tag the technologies and skills it demonstrates in lowercase, and pull out its headline metric if it has one. Dates are YYYY-MM; use null when unknown. Skill groups come from the skills section if the resume has one, otherwise group the tagged skills sensibly. Skill groups are printed on the resume as they are, so write each skill there the way it is properly spelled and capitalised (PostgreSQL, TypeScript, Node.js, CI/CD, GitHub Actions), not in lowercase. Only the per-bullet tags are lowercase. Certifications go in certifications with the issuer and date. A GPA or an honours line on a degree goes in gpa and honors on that education entry.`;
