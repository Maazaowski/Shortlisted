/**
 * Skill normalisation so "PostgreSQL", "postgres" and "Postgres DB" compare
 * equal. Extend ALIASES as real postings expose new spellings.
 */
const ALIASES: Record<string, string> = {
  postgresql: "postgres",
  "postgres db": "postgres",
  psql: "postgres",
  "node.js": "node",
  nodejs: "node",
  "react.js": "react",
  reactjs: "react",
  "next.js": "next",
  nextjs: "next",
  "vue.js": "vue",
  vuejs: "vue",
  k8s: "kubernetes",
  ts: "typescript",
  js: "javascript",
  "c sharp": "c#",
  csharp: "c#",
  "dotnet": ".net",
  "asp.net core": ".net",
  "golang": "go",
  "amazon web services": "aws",
  "google cloud": "gcp",
  "google cloud platform": "gcp",
  "microsoft azure": "azure",
  "ci/cd": "ci cd",
  "rest apis": "rest",
  "restful apis": "rest",
  "restful": "rest",
  "rest api": "rest",
  "unit testing": "testing",
  "e2e testing": "testing",
  "llms": "llm",
  "large language models": "llm",
  "gen ai": "genai",
  "generative ai": "genai",
  "ml": "machine learning",
  "rn": "react native",
};

export function normalizeSkill(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/^(experience (with|in)|proficiency (with|in)|knowledge of)\s+/, "");
  s = s.replace(/[()]/g, "").trim();
  return ALIASES[s] ?? s;
}

export function normalizeSkills(list: string[]): string[] {
  const out = new Set<string>();
  for (const s of list) {
    const n = normalizeSkill(s);
    if (n) out.add(n);
  }
  return [...out];
}

/**
 * True when the bank covers a required skill. Exact match after normalisation,
 * or the requirement is a phrase that contains a bank skill as a whole word
 * ("experience with postgres and redis" covers "postgres").
 */
export function skillCovered(required: string, bankSkills: Set<string>): boolean {
  const r = normalizeSkill(required);
  if (bankSkills.has(r)) return true;
  for (const b of bankSkills) {
    if (b.length < 2) continue;
    const re = new RegExp(`(^|[^a-z0-9#+.])${escapeRegExp(b)}($|[^a-z0-9#+.])`);
    if (re.test(r)) return true;
  }
  return false;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
