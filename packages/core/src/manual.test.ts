import { describe, expect, it } from "vitest";
import type { Bank } from "./schemas.js";
import { bankAliases, buildImportPrompt, buildSelectionPrompt, extractJson, parseImportReply, parseSelectionReply } from "./manual.js";

const bank: Bank = {
  fullName: "Sample Person",
  email: "s@example.com",
  phone: null,
  location: null,
  links: [],
  headline: "Engineer",
  summary: "Builds things.",
  skillGroups: [{ name: "Backend", skills: ["node", "postgres"] }],
  education: [],
  certifications: [],
  entries: [
    {
      id: "cuid_entry_a",
      kind: "ROLE",
      organization: "Acme",
      title: "Senior Engineer",
      location: null,
      startDate: "2022-03",
      endDate: null,
      url: null,
      bullets: [
        { id: "cuid_b1", text: "Built a ledger used by 40 businesses", skills: ["postgres"], metric: "40 businesses", inBase: true },
        { id: "cuid_b2", text: "Cut extraction time by 40%", skills: ["python"], metric: "40%", inBase: true },
      ],
    },
    {
      id: "cuid_entry_b",
      kind: "PROJECT",
      organization: "Side",
      title: "Tool",
      location: null,
      startDate: null,
      endDate: null,
      url: null,
      bullets: [{ id: "cuid_b3", text: "Shipped a desktop app", skills: ["rust"], metric: null, inBase: false }],
    },
  ],
};

describe("bankAliases", () => {
  it("numbers entries and bullets in bank order", () => {
    const a = bankAliases(bank);
    expect(a.entries.get("e2")).toBe("cuid_entry_b");
    expect(a.bullets.get("b3")).toBe("cuid_b3");
  });
});

describe("buildSelectionPrompt", () => {
  it("shows aliases instead of ids and includes the posting", () => {
    const p = buildSelectionPrompt(bank, "Senior Backend Engineer at Example", "lead with the ledger");
    expect(p).toContain("### e1: Senior Engineer, Acme");
    expect(p).toContain("- b2: Cut extraction time by 40% (metric: 40%) [python]");
    expect(p).not.toContain("cuid_");
    expect(p).toContain("Senior Backend Engineer at Example");
    expect(p).toContain("lead with the ledger");
  });
});

describe("parseSelectionReply", () => {
  const reply = {
    parsed: {
      isJobPosting: true,
      title: "Backend Engineer",
      company: "Example",
      location: null,
      seniority: "senior",
      mustHaveSkills: ["postgres"],
      niceToHaveSkills: [],
      keywords: [],
      responsibilities: [],
      yearsExperience: null,
    },
    selection: {
      headline: "Backend Engineer",
      summary: "Builds ledgers.",
      skillGroups: [{ name: "Backend", skills: ["postgres", "node"] }],
      entries: [{ entryId: "e1", bullets: [{ id: "b1", rewording: null }, { id: "b9", rewording: null }] }],
      coverLetter: "Dear team",
    },
  };

  it("maps aliases back to bank ids and leaves unknown aliases for the validator", () => {
    const out = parseSelectionReply(JSON.stringify(reply), bank);
    expect(out.selection.entries[0]?.entryId).toBe("cuid_entry_a");
    expect(out.selection.entries[0]?.bullets.map((b) => b.id)).toEqual(["cuid_b1", "b9"]);
    expect(out.selection.reasoning).toBe("");
    expect(out.parsed.title).toBe("Backend Engineer");
  });

  it("tolerates code fences and chatter around the JSON", () => {
    const text = `Here you go:\n\`\`\`json\n${JSON.stringify(reply, null, 2)}\n\`\`\`\nLet me know if you want changes.`;
    expect(parseSelectionReply(text, bank).parsed.company).toBe("Example");
  });

  it("explains a missing field", () => {
    const broken = { parsed: reply.parsed, selection: { ...reply.selection, coverLetter: undefined } };
    expect(() => parseSelectionReply(JSON.stringify(broken), bank)).toThrow(/selection\.coverLetter/);
  });

  it("explains non-JSON", () => {
    expect(() => extractJson("no braces here")).toThrow(/No JSON object/);
    expect(() => extractJson("{ not json }")).toThrow(/not valid JSON/);
  });
});

describe("import prompt and reply", () => {
  it("round trips a bank", () => {
    expect(buildImportPrompt("RESUME TEXT")).toContain("RESUME TEXT");
    const imported = parseImportReply(
      JSON.stringify({
        fullName: "A",
        email: "a@b.c",
        phone: null,
        location: null,
        links: [],
        headline: "H",
        summary: "S",
        skillGroups: [],
        education: [],
        certifications: [],
        entries: [{ kind: "ROLE", organization: "O", title: "T", location: null, startDate: "2020-01", endDate: null, url: null, bullets: [{ text: "Did a thing", skills: ["x"], metric: null }] }],
      }),
    );
    expect(imported.entries[0]?.bullets[0]?.text).toBe("Did a thing");
  });
});

describe("certification aliases", () => {
  it("labels certifications c1.. in the prompt and maps them back", () => {
    const withCerts: Bank = { ...bank, certifications: [{ id: "cuid_cert", name: "Cloud Cert", issuer: "Vendor", date: "2024", url: null }] };
    expect(buildSelectionPrompt(withCerts, "posting")).toContain("- c1: Cloud Cert, Vendor, 2024");
    const reply = {
      parsed: { isJobPosting: true, title: "T", company: "C", location: null, seniority: "senior", mustHaveSkills: [], niceToHaveSkills: [], keywords: [], responsibilities: [], yearsExperience: null },
      selection: { headline: "H", summary: "S", skillGroups: [], entries: [], certifications: ["c1", "c9"], coverLetter: "x" },
    };
    expect(parseSelectionReply(JSON.stringify(reply), withCerts).selection.certifications).toEqual(["cuid_cert", "c9"]);
  });
});
