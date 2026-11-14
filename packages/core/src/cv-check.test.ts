import { describe, expect, it } from "vitest";
import { checkCv } from "./cv-check.js";
import type { Bank } from "./schemas.js";

function bullet(id: string, text: string, skills: string[] = ["typescript"]) {
  return { id, text, skills, metric: null, inBase: true };
}

function bank(over: Partial<Bank> = {}): Bank {
  return {
    fullName: "Test User",
    email: "t@example.com",
    phone: "+92 300 1234567",
    location: "Lahore, Pakistan",
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/test" }],
    headline: "Software Engineer",
    summary: "Backend engineer with six years building payment systems for banks and fintech companies.",
    skillGroups: [{ name: "Backend", skills: ["typescript", "node", "postgres", "redis", "docker"] }],
    education: [],
    certifications: [],
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
        bullets: [bullet("b1", "Cut checkout latency by 40% by moving sessions to Redis"), bullet("b2", "Built the ledger service used by 12 teams"), bullet("b3", "Led the migration to Postgres")],
      },
    ],
    ...over,
  };
}

const ids = (b: Bank) => checkCv(b).findings.map((f) => f.id);

describe("checkCv", () => {
  it("scores a clean bank 100 with nothing to fix", () => {
    const result = checkCv(bank());
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.passed.length).toBeGreaterThan(10);
  });

  it("flags a phone number without a country code", () => {
    const result = checkCv(bank({ phone: "0300 1234567" }));
    expect(result.findings[0]?.id).toBe("phone");
    expect(result.findings[0]?.severity).toBe("fix");
    expect(result.score).toBe(90);
  });

  it("accepts 00 as a country code prefix", () => {
    expect(ids(bank({ phone: "0092 300 1234567" }))).not.toContain("phone");
  });

  it("flags personal details and names them", () => {
    const result = checkCv(bank({ summary: "Backend engineer with six years of experience. Date of birth: 4 May 1996. Marital status: single." }));
    const finding = result.findings.find((f) => f.id === "personal-details");
    expect(finding?.detail).toContain("date of birth");
    expect(finding?.detail).toContain("marital status");
  });

  it("does not read ordinary words as personal details", () => {
    expect(ids(bank({ summary: "Backend engineer who built a single source of truth for billing across the company, used by teams of every age." }))).not.toContain("personal-details");
  });

  it("flags a city with no country, and a missing LinkedIn link", () => {
    const found = ids(bank({ location: "Lahore", links: [] }));
    expect(found).toContain("location");
    expect(found).toContain("linkedin");
  });

  it("flags bullets without numbers when under half have one", () => {
    const b = bank();
    b.entries[0]!.bullets = [bullet("b1", "Built the ledger service"), bullet("b2", "Led the migration to Postgres"), bullet("b3", "Cut latency by 40%"), bullet("b4", "Wrote the on-call guide")];
    const finding = checkCv(b).findings.find((f) => f.id === "numbers");
    expect(finding?.examples).toContain("Built the ledger service");
    expect(finding?.points).toBe(10);
  });

  it("flags weak openers, long bullets and first person", () => {
    const b = bank();
    b.entries[0]!.bullets = [
      bullet("b1", "Responsible for the 3 billing services"),
      bullet("b2", "I built 2 dashboards"),
      bullet("b3", `Built ${Array.from({ length: 40 }, (_, i) => `thing${i}`).join(" ")}`),
    ];
    const found = ids(b);
    expect(found).toContain("weak-openers");
    expect(found).toContain("first-person");
    expect(found).toContain("long-bullets");
  });

  it("flags a role with no start date and a role with one bullet", () => {
    const b = bank();
    b.entries.push({ id: "e2", kind: "ROLE", organization: "Beta", title: "Intern", location: null, startDate: null, endDate: null, url: null, bullets: [bullet("b9", "Shipped 4 features")] });
    const result = checkCv(b);
    expect(result.findings.find((f) => f.id === "dates")?.examples).toEqual(["Intern, Beta"]);
    expect(result.findings.map((f) => f.id)).toContain("thin-roles");
  });

  it("flags untagged bullets when most have no skills", () => {
    const b = bank();
    b.entries[0]!.bullets = [bullet("b1", "Cut latency by 40%", []), bullet("b2", "Built 2 services", []), bullet("b3", "Led 5 engineers")];
    expect(ids(b)).toContain("untagged");
  });

  it("puts fixes before improvements", () => {
    const result = checkCv(bank({ phone: "0300 1234567", links: [] }));
    expect(result.findings.map((f) => f.severity)).toEqual(["fix", "improve"]);
  });

  it("says so when the bank is empty", () => {
    const result = checkCv(bank({ entries: [] }));
    expect(result.score).toBe(0);
    expect(result.findings[0]?.id).toBe("empty");
  });
});
