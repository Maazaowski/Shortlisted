import { describe, expect, it } from "vitest";
import { expandSkill, expandSkills, skillCovered } from "./skills.js";

/** Skills written the way a real profile writes them, found by a live run that scored every posting as a poor fit. */
const bank = new Set(
  expandSkills([
    "LLM application development",
    "Claude API",
    "Retrieval-Augmented Generation (RAG)",
    "embeddings and vector databases",
    "ChromaDB",
    "prompt design and evaluation",
    "AI agents and tool use",
    "CI/CD (Azure DevOps)",
    "React Native/Expo",
    "PostgreSQL",
    "MongoDB",
    "REST",
    "Docker",
    "AWS",
    "TypeScript",
    "Playwright",
  ]),
);

describe("expandSkill", () => {
  it("finds the short name in brackets", () => {
    expect(expandSkill("Retrieval-Augmented Generation (RAG)")).toEqual(expect.arrayContaining(["rag", "retrieval-augmented generation"]));
  });

  it("splits joined skills", () => {
    expect(expandSkill("embeddings and vector databases")).toEqual(expect.arrayContaining(["embeddings", "vector databases"]));
    expect(expandSkill("React Native/Expo")).toEqual(expect.arrayContaining(["react native", "expo"]));
  });

  it("keeps a known spelling with a slash whole", () => {
    expect(expandSkill("CI/CD (Azure DevOps)")).toEqual(expect.arrayContaining(["ci cd", "azure devops"]));
    expect(expandSkill("CI/CD")).not.toContain("cd");
  });
});

describe("skillCovered", () => {
  it.each(["rag", "vector databases", "embeddings", "llms", "postgres", "ci/cd", "expo"])("finds %s in the bank", (skill) => {
    expect(skillCovered(skill, bank)).toBe(true);
  });

  it.each([
    ["relational databases", "postgres"],
    ["sql", "postgres"],
    ["nosql", "mongodb"],
    ["cloud platforms", "aws"],
    ["apis", "rest"],
    ["containerized deployments", "docker"],
    ["prompt engineering", "prompt design"],
    ["agentic workflows", "ai agents"],
    ["test automation", "playwright"],
    ["javascript", "typescript"],
    ["llm integration", "claude api"],
  ])("counts the general term %s as shown by %s", (term) => {
    expect(skillCovered(term, bank)).toBe(true);
  });

  it("accepts any one of several alternatives", () => {
    expect(skillCovered("go or typescript", bank)).toBe(true);
    expect(skillCovered("aws or gcp or azure", bank)).toBe(true);
    expect(skillCovered("go or rust", bank)).toBe(false);
  });

  it.each(["rust", "go", "kubernetes", "langgraph", "oauth", "knowledge graphs", "java", "angular"])("still reports %s as missing", (skill) => {
    expect(skillCovered(skill, bank)).toBe(false);
  });

  it("does not match inside another word", () => {
    expect(skillCovered("restructuring", bank)).toBe(false);
    expect(skillCovered("awsome", bank)).toBe(false);
  });
});
