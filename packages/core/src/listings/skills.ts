import { escapeRegExp, normalizeSkill } from "../skills.js";

/**
 * Finds known skills in a posting's text, with no model call, so the whole
 * feed can be matched against a bank. It is a fixed vocabulary: a skill that
 * is not listed here is not found. Extend the list as real postings show gaps.
 * One-letter and everyday-word names ("go", "r", "c") are left out on purpose.
 */
const VOCABULARY = [
  // languages
  "javascript", "typescript", "python", "java", "c#", "c++", "ruby", "php", "rust", "golang", "kotlin", "swift", "scala", "elixir", "perl", "objective-c", "dart", "solidity", "bash", "powershell", "sql",
  // frameworks and runtimes
  "react", "react native", "vue", "angular", "svelte", "next.js", "nuxt", "node.js", "express", "nestjs", "django", "flask", "fastapi", "ruby on rails", "rails", "laravel", "spring", "spring boot", ".net", "flutter", "graphql", "grpc", "rest", "microservices", "html", "css", "sass", "tailwind", "webpack", "redux",
  // data stores and pipelines
  "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb", "cassandra", "kafka", "rabbitmq", "snowflake", "bigquery", "redshift", "databricks", "spark", "hadoop", "airflow", "dbt", "etl", "nosql",
  // cloud and operations
  "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "helm", "jenkins", "github actions", "gitlab ci", "ci/cd", "linux", "git", "prometheus", "grafana", "datadog", "splunk", "nginx", "serverless", "devops", "observability",
  // data science and machine learning
  "pandas", "numpy", "pytorch", "tensorflow", "scikit-learn", "machine learning", "deep learning", "nlp", "llm", "computer vision", "statistics", "data analysis", "data engineering", "data modeling", "a/b testing", "tableau", "power bi", "looker", "excel",
  // testing
  "jest", "cypress", "playwright", "selenium", "pytest", "junit", "test automation",
  // mobile
  "ios", "android",
  // security
  "penetration testing", "siem", "iso 27001", "soc 2", "gdpr", "oauth", "okta", "threat modeling", "incident response",
  // design
  "figma", "sketch", "adobe xd", "photoshop", "illustrator", "after effects", "user research", "prototyping", "wireframing", "design systems",
  // product and delivery
  "product management", "project management", "agile", "scrum", "kanban", "jira", "confluence", "roadmapping",
  // go to market
  "salesforce", "hubspot", "zendesk", "intercom", "seo", "sem", "google analytics", "google ads", "content marketing", "email marketing", "copywriting", "lead generation", "account management", "customer success", "crm", "social media",
  // finance, people, operations
  "accounting", "financial modeling", "bookkeeping", "payroll", "quickbooks", "netsuite", "sap", "xero", "recruiting", "sourcing", "onboarding", "procurement", "supply chain", "technical writing",
];

const MATCHERS: [RegExp, string][] = [...new Set(VOCABULARY)]
  .sort((a, b) => b.length - a.length)
  .map((term) => [new RegExp(`(^|[^a-z0-9#+.])${escapeRegExp(term)}(?=$|[^a-z0-9#+])`), normalizeSkill(term)] as [RegExp, string]);

const MAX_SKILLS = 30;

/** Normalised skill tags found in the text, in vocabulary order of length, capped at thirty. */
export function extractSkills(description: string): string[] {
  const text = description.toLowerCase();
  const found = new Set<string>();
  for (const [re, skill] of MATCHERS) {
    if (found.size >= MAX_SKILLS) break;
    if (!found.has(skill) && re.test(text)) found.add(skill);
  }
  return [...found];
}
