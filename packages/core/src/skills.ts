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
 * A bank skill as the user typed it can hold several: "Retrieval-Augmented
 * Generation (RAG)", "embeddings and vector databases", "React Native/Expo",
 * "CI/CD (Azure DevOps)". This returns every skill in it, normalised, so a
 * posting that asks for "rag" or "vector databases" finds it.
 */
export function expandSkill(raw: string): string[] {
  const out = new Set<string>();
  const inside = [...raw.matchAll(/\(([^)]+)\)/g)].map((m) => m[1] ?? "");
  const outside = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  for (const piece of [outside, ...inside]) {
    const whole = normalizeSkill(piece);
    if (!whole) continue;
    out.add(whole);
    // A known spelling such as "ci/cd" is one skill and is not cut at the slash.
    if (ALIASES[piece.trim().toLowerCase()]) continue;
    for (const part of piece.split(/\s+and\s+|\s*&\s*|\s*,\s*|\s*\/\s*/i)) {
      const n = normalizeSkill(part);
      if (n.length >= 2) out.add(n);
    }
  }
  return [...out];
}

export function expandSkills(list: string[]): string[] {
  const out = new Set<string>();
  for (const s of list) for (const n of expandSkill(s)) out.add(n);
  return [...out];
}

/**
 * General terms a posting uses, and the concrete skills that show them.
 * "relational databases" is covered by a bank that has postgres. The left
 * side is what postings say; the right side is what banks say.
 */
const FAMILIES: [string[], string[]][] = [
  [["relational databases", "relational database", "databases", "database", "sql", "rdbms", "sql databases"], ["postgres", "mysql", "sql server", "sqlite", "oracle", "mariadb", "mssql"]],
  [["nosql", "nosql databases", "document databases"], ["mongodb", "dynamodb", "cassandra", "couchbase", "firestore", "redis"]],
  [["cloud platforms", "cloud platform", "cloud", "cloud infrastructure", "cloud services", "public cloud"], ["aws", "gcp", "azure"]],
  [["apis", "api", "web apis", "api design", "api development", "backend apis"], ["rest", "grpc", "graphql"]],
  [["containers", "containerization", "containerized deployments", "containerised deployments"], ["docker", "kubernetes"]],
  [["llm", "llm integration", "llm apis", "llm application development", "genai", "ai integration"], ["openai api", "claude api", "gpt", "langchain", "llm application development", "openai", "anthropic api"]],
  [["testing", "test automation", "automated testing", "automated tests", "software testing"], ["playwright", "jest", "pytest", "cypress", "selenium", "integration testing", "regression testing", "junit", "vitest"]],
  [["version control", "source control"], ["git", "github", "gitlab", "azure devops", "bitbucket"]],
  [["message queues", "messaging", "message brokers", "queues", "event-driven architecture"], ["rabbitmq", "kafka", "sqs", "masstransit", "nats", "service bus"]],
  [["vector databases", "vector database", "vector search", "vector stores"], ["chromadb", "pinecone", "weaviate", "qdrant", "pgvector", "milvus", "faiss"]],
  [["prompt engineering", "prompting"], ["prompt design", "prompt workflows", "prompt evaluation", "prompt design and evaluation"]],
  [["ci cd", "continuous integration", "continuous delivery", "build pipelines"], ["github actions", "azure devops", "gitlab ci", "jenkins", "circleci", "ci"]],
  [["agentic workflows", "agent-based systems", "ai agents", "agents", "multi-agent tools", "agent tooling", "agentic ai"], ["ai agents", "langgraph", "tool use", "model context protocol", "mcp", "autogen", "crewai"]],
  [["rag"], ["retrieval-augmented generation", "retrieval augmented generation"]],
  [["retrieval-augmented generation", "retrieval augmented generation"], ["rag"]],
  [["javascript"], ["typescript", "node", "react", "next"]],
  [["embeddings", "embedding models"], ["embeddings", "embedding", "vector databases", "chromadb", "pgvector"]],
  [["llm evaluation", "ai evaluation", "evals", "llm evals", "model evaluation"], ["llm evals", "prompt evaluation", "evaluation", "evals"]],
  [[".net", ".net core", "dotnet core"], [".net core 8", "c#", ".net", "asp.net"]],
  [["mobile development", "mobile"], ["react native", "expo", "android", "ios", "flutter"]],
];

const FAMILY_OF = new Map<string, string[]>();
for (const [terms, members] of FAMILIES) for (const t of terms) FAMILY_OF.set(t, [...(FAMILY_OF.get(t) ?? []), ...members]);

/** "apis" and "api", "embeddings" and "embedding" compare equal. */
function singular(s: string): string {
  return s.replace(/([a-z]{3,})s\b/g, "$1");
}

function wordIn(haystack: string, needle: string): boolean {
  if (needle.length < 2) return false;
  return new RegExp(`(^|[^a-z0-9#+.])${escapeRegExp(needle)}($|[^a-z0-9#+.])`).test(haystack);
}

function coveredOne(r: string, bankSkills: Set<string>): boolean {
  if (!r) return false;
  if (bankSkills.has(r)) return true;
  const rs = singular(r);
  for (const b of bankSkills) {
    if (b.length < 2) continue;
    const bs = singular(b);
    if (bs === rs) return true;
    // The requirement is a phrase that names a bank skill: "experience with postgres and redis".
    if (wordIn(r, b)) return true;
    // The bank skill is a phrase that names the requirement: "llm application development" shows "llm".
    if (r.length >= 3 && wordIn(b, r)) return true;
  }
  const family = FAMILY_OF.get(r) ?? FAMILY_OF.get(rs);
  return family ? family.some((m) => bankSkills.has(m)) : false;
}

/**
 * True when the bank covers a required skill:
 *   - the same skill after normalisation, singular or plural,
 *   - one names the other as a whole word,
 *   - the requirement is a general term and the bank has a concrete skill of
 *     that kind ("relational databases" and postgres),
 *   - the requirement lists alternatives ("aws or gcp", "go/typescript") and
 *     the bank has one of them.
 * This only feeds the fit score and the "in your bank" marks. It never adds
 * anything to a resume; the validator decides that.
 */
export function skillCovered(required: string, bankSkills: Set<string>): boolean {
  const r = normalizeSkill(required);
  if (coveredOne(r, bankSkills)) return true;
  const alternatives = r.split(/\s+or\s+|\s*\/\s*|\s*\|\s*/).map((part) => normalizeSkill(part)).filter((part) => part && part !== r);
  return alternatives.some((part) => coveredOne(part, bankSkills));
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
