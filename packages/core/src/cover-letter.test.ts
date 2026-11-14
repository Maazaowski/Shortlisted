import { describe, expect, it } from "vitest";
import { validateCoverLetter } from "./validate.js";
import type { Bank } from "./schemas.js";

const bank: Bank = {
  fullName: "Test User",
  email: "t@example.com",
  phone: null,
  location: "Lahore, Pakistan",
  links: [],
  headline: "Backend Engineer",
  summary: "Backend engineer with 6 years in payments.",
  skillGroups: [{ name: "Backend", skills: ["TypeScript", "Postgres"] }],
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
      bullets: [{ id: "b1", text: "Cut checkout latency by 40% by moving sessions to Redis", skills: ["redis"], metric: "40%", inBase: true }],
    },
  ],
};

const allow = ["Platform Engineer", "Ledgerly", "Sara Khan"];

describe("validateCoverLetter", () => {
  it("passes a letter that only says what the bank says", () => {
    const text = "Dear Sara,\n\nAt Acme I cut checkout latency by 40% using Redis. I have 6 years in payments and would bring that to the Platform Engineer role at Ledgerly.\n\nBest regards,\nTest User";
    expect(validateCoverLetter(bank, text, allow)).toEqual([]);
  });

  it("flags a number the bank does not contain, once", () => {
    const flags = validateCoverLetter(bank, "I cut latency by 70%. That 70% held for a year.", allow);
    expect(flags.filter((f) => f.kind === "cover_number").map((f) => f.detail)).toEqual(['The cover letter mentions "70%", which is not in the bank.']);
  });

  it("flags a tool the bank does not name", () => {
    const flags = validateCoverLetter(bank, "I ran our services on Kubernetes and Postgres.", allow);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.kind).toBe("cover_term");
    expect(flags[0]?.detail).toContain('"kubernetes"');
  });

  it("does not flag ordinary words that start a sentence", () => {
    expect(validateCoverLetter(bank, "Shipping matters to me. Reliable systems are what I build. Thanks for reading.", allow)).toEqual([]);
  });

  it("accepts a year from the bank's dates", () => {
    expect(validateCoverLetter(bank, "I have been at Acme since 2022.", allow)).toEqual([]);
  });

  it("does not flag a skill the letter only says the candidate lacks", () => {
    // From a live run: the honest sentence about missing skills was the one that got flagged.
    const flags = validateCoverLetter(bank, "My systems work has been in Postgres rather than Rust, and I have not worked with Kubernetes. I do not hold NMC registration or an Immediate Life Support certificate.");
    expect(flags).toEqual([]);
  });

  it("still flags a claim that follows a denial after but", () => {
    const flags = validateCoverLetter(bank, "I have not used Rust, but I led Kubernetes migrations for two teams.");
    expect(flags.map((f) => f.detail).join(" ")).toMatch(/kubernetes/i);
    expect(flags.map((f) => f.detail).join(" ")).not.toMatch(/rust/i);
  });

  it("still flags a skill that is denied in one sentence and claimed in another", () => {
    const flags = validateCoverLetter(bank, "I have not used Kubernetes at work. In my own projects I run Kubernetes clusters.");
    expect(flags.map((f) => f.detail).join(" ")).toMatch(/kubernetes/i);
  });
});
