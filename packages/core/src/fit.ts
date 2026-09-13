import type { Bank, ParsedJob } from "./schemas.js";
import { normalizeSkills, skillCovered } from "./skills.js";

export type Verdict = "STRONG" | "GOOD" | "POSSIBLE" | "POOR";

export type FitResult = {
  verdict: Verdict;
  /** 0 to 100 */
  score: number;
  /** Must-have skills the bank does not cover, in the posting's own words. */
  gaps: string[];
  /** Must-haves the bank covers. */
  covered: string[];
  niceToHaveCovered: string[];
};

/** Every skill the bank claims: bullet tags plus profile skill groups. */
export function bankSkillSet(bank: Bank): Set<string> {
  const all: string[] = [];
  for (const g of bank.skillGroups) all.push(...g.skills);
  for (const e of bank.entries) for (const b of e.bullets) all.push(...b.skills);
  return new Set(normalizeSkills(all));
}

/**
 * Fit is code, not the model, so it is cheap, deterministic, and runs before
 * any generation is paid for. Must-haves weigh 85, nice-to-haves 15.
 */
export function scoreFit(bank: Bank, job: ParsedJob): FitResult {
  const skills = bankSkillSet(bank);
  const must = job.mustHaveSkills.filter((s) => s.trim());
  const nice = job.niceToHaveSkills.filter((s) => s.trim());

  const covered = must.filter((s) => skillCovered(s, skills));
  const gaps = must.filter((s) => !skillCovered(s, skills));
  const niceToHaveCovered = nice.filter((s) => skillCovered(s, skills));

  const mustRatio = must.length === 0 ? 1 : covered.length / must.length;
  const niceRatio = nice.length === 0 ? 1 : niceToHaveCovered.length / nice.length;
  const score = Math.round(mustRatio * 85 + niceRatio * 15);

  let verdict: Verdict;
  if (mustRatio >= 0.8) verdict = "STRONG";
  else if (mustRatio >= 0.6) verdict = "GOOD";
  else if (mustRatio >= 0.4) verdict = "POSSIBLE";
  else verdict = "POOR";

  return { verdict, score, gaps, covered, niceToHaveCovered };
}
