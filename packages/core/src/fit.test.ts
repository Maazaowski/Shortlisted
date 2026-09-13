import { describe, expect, it } from "vitest";
import { scoreFit } from "./fit.js";
import type { Bank, ParsedJob } from "./schemas.js";

const bank: Bank = {
  fullName: "Test User",
  email: "t@example.com",
  phone: null,
  location: null,
  links: [],
  headline: "Senior Software Engineer",
  summary: "Backend engineer.",
  skillGroups: [{ name: "Backend", skills: ["Node.js", "PostgreSQL", "Prisma"] }],
  education: [],
  entries: [
    {
      id: "e1",
      kind: "ROLE",
      organization: "Acme",
      title: "Engineer",
      location: null,
      startDate: "2022-01",
      endDate: null,
      url: null,
      bullets: [
        { id: "b1", text: "Built a Next.js app", skills: ["next.js", "react"], metric: null, inBase: true },
        { id: "b2", text: "Ran Docker in CI", skills: ["docker", "ci/cd"], metric: null, inBase: true },
      ],
    },
  ],
};

function job(must: string[], nice: string[] = []): ParsedJob {
  return {
    isJobPosting: true,
    title: "Backend Engineer",
    company: "X",
    location: null,
    seniority: "senior",
    mustHaveSkills: must,
    niceToHaveSkills: nice,
    keywords: [],
    responsibilities: [],
    yearsExperience: null,
  };
}

describe("scoreFit", () => {
  it("matches across aliases and casing", () => {
    const r = scoreFit(bank, job(["postgres", "node", "React"]));
    expect(r.verdict).toBe("STRONG");
    expect(r.gaps).toEqual([]);
  });

  it("names gaps in the posting's words", () => {
    const r = scoreFit(bank, job(["Kubernetes", "Go", "postgres", "node", "docker"]));
    expect(r.gaps).toEqual(["Kubernetes", "Go"]);
    expect(r.verdict).toBe("GOOD");
  });

  it("covers a phrase that contains a bank skill", () => {
    const r = scoreFit(bank, job(["experience with postgres and redis"]));
    expect(r.covered).toHaveLength(1);
  });

  it("returns poor when most must-haves are missing", () => {
    const r = scoreFit(bank, job(["rust", "kubernetes", "terraform", "go", "node"]));
    expect(r.verdict).toBe("POOR");
    expect(r.score).toBeLessThan(40);
  });

  it("is strong when the posting lists nothing", () => {
    expect(scoreFit(bank, job([])).verdict).toBe("STRONG");
  });
});
