import { describe, expect, it } from "vitest";
import { normalizeCapture, provisionalTitle } from "./capture.js";

describe("provisionalTitle", () => {
  it("takes the part before the first separator", () => {
    expect(provisionalTitle("Backend Engineer, Ledger - Lumen Bank | Careers")).toBe("Backend Engineer, Ledger");
    expect(provisionalTitle("Staff Engineer | Acme")).toBe("Staff Engineer");
  });
  it("gives up on nothing useful", () => {
    expect(provisionalTitle("")).toBeNull();
    expect(provisionalTitle(null)).toBeNull();
    expect(provisionalTitle("x")).toBeNull();
  });
});

describe("normalizeCapture", () => {
  it("uses the page title as a stand-in when there is no JSON-LD", () => {
    const n = normalizeCapture({ url: "https://jobs.example.com/1", pageTitle: "Platform Engineer - Example", jsonLd: null, text: "Platform Engineer. Example is hiring." });
    expect(n.title).toBe("Platform Engineer");
    expect(n.company).toBeNull();
  });
});

describe("structured data with a one-line description", () => {
  // Found on a live run: the requirements were in the page, the structured description was one sentence, and the posting scored with no requirements at all.
  const page = "Platform Engineer\nQuillfeather\nRequirements\n- Docker and a CI/CD system\n- TypeScript or Go\n- PostgreSQL in production\nBonus\n- Terraform";
  const jsonLd = { "@type": "JobPosting", title: "Platform Engineer", hiringOrganization: { name: "Quillfeather" }, description: "<p>Quillfeather is hiring a Platform Engineer.</p>" };

  it("adds the page text when the description is a teaser", () => {
    const n = normalizeCapture({ url: "https://example.com/job", pageTitle: "Platform Engineer", jsonLd, text: page });
    expect(n.title).toBe("Platform Engineer");
    expect(n.company).toBe("Quillfeather");
    expect(n.rawText).toContain("PostgreSQL in production");
  });

  it("leaves a full description alone", () => {
    const full = { ...jsonLd, description: `<p>${"We need someone who knows Postgres and TypeScript well. ".repeat(40)}</p>` };
    const n = normalizeCapture({ url: "https://example.com/job", pageTitle: "Platform Engineer", jsonLd: full, text: `${page} COOKIE BANNER TEXT` });
    expect(n.rawText).not.toContain("COOKIE BANNER TEXT");
  });
});
