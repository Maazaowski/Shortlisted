import { describe, expect, it } from "vitest";
import { validateSelection, extractNumbers, extractTerms } from "./validate.js";
import type { Bank, Selection } from "./schemas.js";

const bank: Bank = {
  fullName: "T",
  email: "t@example.com",
  phone: null,
  location: null,
  links: [],
  headline: "Engineer",
  summary: "Shipped a ledger used by 40 businesses.",
  skillGroups: [],
  education: [],
  entries: [
    {
      id: "e1",
      kind: "ROLE",
      organization: "Acme",
      title: "Engineer",
      location: null,
      startDate: null,
      endDate: null,
      url: null,
      bullets: [
        { id: "b1", text: "Cut invoice extraction time by 40% using PyMuPDF fingerprints", skills: [], metric: "40%", inBase: true },
        { id: "b2", text: "Built a double-entry ledger in Postgres", skills: [], metric: null, inBase: true },
      ],
    },
  ],
};

function sel(entries: Selection["entries"], summary = "Backend engineer."): Selection {
  return { headline: "Engineer", summary, skillGroups: [], entries, coverLetter: "", reasoning: "" };
}

describe("validateSelection", () => {
  it("drops bullets that are not in the bank", () => {
    const r = validateSelection(bank, sel([{ entryId: "e1", bullets: [{ id: "b1", rewording: null }, { id: "zzz", rewording: null }] }]));
    expect(r.selection.entries[0]!.bullets.map((b) => b.id)).toEqual(["b1"]);
    expect(r.flags.some((f) => f.kind === "missing_bullet")).toBe(true);
  });

  it("flags an added number once, not again as a term", () => {
    const r = validateSelection(bank, sel([{ entryId: "e1", bullets: [{ id: "b1", rewording: "Cut invoice extraction time by 40% across 3 pipelines using PyMuPDF fingerprints" }] }]));
    expect(r.flags.filter((f) => f.detail.includes('"3"')).map((f) => f.kind)).toEqual(["added_number"]);
  });

  it("flags a number that was not in the original", () => {
    const r = validateSelection(
      bank,
      sel([{ entryId: "e1", bullets: [{ id: "b1", rewording: "Cut extraction time by 60% using PyMuPDF fingerprints" }] }]),
    );
    expect(r.flags.map((f) => f.kind)).toContain("added_number");
  });

  it("flags a tool name that was not in the original", () => {
    const r = validateSelection(
      bank,
      sel([{ entryId: "e1", bullets: [{ id: "b2", rewording: "Built a double-entry ledger in Postgres and Kafka" }] }]),
    );
    expect(r.flags.find((f) => f.kind === "new_term")?.detail).toContain("kafka");
  });

  it("accepts a faithful rewording without flags", () => {
    const r = validateSelection(
      bank,
      sel([{ entryId: "e1", bullets: [{ id: "b1", rewording: "Reduced invoice extraction time 40% with PyMuPDF fingerprints" }] }]),
    );
    expect(r.flags).toEqual([]);
    expect(r.selection.entries[0]!.bullets[0]!.rewording).toContain("Reduced");
  });

  it("flags summary numbers that appear nowhere in the bank", () => {
    const r = validateSelection(bank, sel([{ entryId: "e1", bullets: [{ id: "b1", rewording: null }] }], "Served 500 clients."));
    expect(r.flags.map((f) => f.kind)).toContain("summary_number");
  });

  it("allows summary numbers that are in the bank", () => {
    const r = validateSelection(bank, sel([{ entryId: "e1", bullets: [{ id: "b1", rewording: null }] }], "Ledger used by 40 businesses."));
    expect(r.flags).toEqual([]);
  });
});

describe("helpers", () => {
  it("extracts numbers with units", () => {
    expect(extractNumbers("cut by 40% in 3 months")).toEqual(["40%", "3months"]);
  });
  it("extracts capitalised and symbol terms", () => {
    expect(extractTerms("Built C# services on .NET with Postgres")).toEqual(["c#", ".net", "postgres"]);
  });
});
