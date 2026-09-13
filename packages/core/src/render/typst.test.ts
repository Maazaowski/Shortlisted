import { describe, expect, it } from "vitest";
import type { Bank, Selection } from "../schemas.js";
import {
  buildCoverLetterTypst,
  buildResumeTypst,
  dateRange,
  esc,
  formatMonth,
} from "./typst.js";

const bank: Bank = {
  fullName: "Ada Example",
  email: "ada@example.com",
  phone: "+1 555 0100",
  location: "Lagos, Nigeria",
  links: [
    { label: "LinkedIn", url: "https://www.linkedin.com/in/ada-example/" },
    { label: "GitHub", url: "https://github.com/ada" },
    { label: "Site", url: "https://ada.dev/work" },
  ],
  headline: "Engineer",
  summary: "Base summary.",
  skillGroups: [{ name: "Languages", skills: ["typescript"] }],
  education: [
    {
      institution: "Some University",
      degree: "BSc",
      field: "Computer Science",
      start: "2014-09",
      end: "2018",
      gpa: "3.7/4.0",
      honors: "Dean's List 2017",
    },
  ],
  certifications: [
    {
      id: "c1",
      name: "Cloud Practitioner",
      issuer: "Vendor",
      date: "2024-03",
      url: "https://verify.example/c1",
    },
    { id: "c2", name: "Unrelated Cert", issuer: null, date: null, url: null },
  ],
  entries: [
    {
      id: "e1",
      kind: "ROLE",
      organization: "Acme",
      title: "Senior Engineer",
      location: "Remote",
      startDate: "2025-01",
      endDate: null,
      url: null,
      bullets: [
        {
          id: "b1",
          text: "Did #1 thing [fast]",
          skills: [],
          metric: null,
          inBase: true,
        },
      ],
    },
    {
      id: "e2",
      kind: "ROLE",
      organization: "Acme",
      title: "Engineer",
      location: "Lagos",
      startDate: "2022-03",
      endDate: "2024-12",
      url: null,
      bullets: [
        {
          id: "b2",
          text: "Did another",
          skills: [],
          metric: null,
          inBase: true,
        },
      ],
    },
    {
      id: "e3",
      kind: "ROLE",
      organization: "Globex",
      title: "Junior",
      location: null,
      startDate: "2020-06",
      endDate: "2022-02",
      url: null,
      bullets: [
        { id: "b3", text: "Started", skills: [], metric: null, inBase: true },
      ],
    },
    {
      id: "e4",
      kind: "PROJECT",
      organization: "Side",
      title: "Ledger",
      location: null,
      startDate: "2026-01",
      endDate: null,
      url: "https://ledger.example.com",
      bullets: [
        { id: "b4", text: "Built it", skills: [], metric: null, inBase: true },
      ],
    },
  ],
};

const selection: Selection = {
  headline: "Senior Engineer",
  summary: "Tailored summary.",
  skillGroups: bank.skillGroups,
  entries: [
    { entryId: "e1", bullets: [{ id: "b1", rewording: null }] },
    {
      entryId: "e2",
      bullets: [{ id: "b2", rewording: "Did another, reworded" }],
    },
    { entryId: "e3", bullets: [{ id: "b3", rewording: null }] },
    { entryId: "e4", bullets: [{ id: "b4", rewording: null }] },
  ],
  certifications: ["c1"],
  coverLetter: "Dear team,\n\nOne paragraph.\n\nAda",
  reasoning: "",
};

describe("dates", () => {
  it("formats YYYY-MM as a month name", () => {
    expect(formatMonth("2026-05")).toBe("May 2026");
    expect(formatMonth("2020")).toBe("2020");
    expect(formatMonth("2026-13")).toBe("2026-13");
  });
  it("builds ranges", () => {
    expect(dateRange("2025-01", null)).toBe("January 2025 – Present");
    expect(dateRange("2022-03", "2024-12")).toBe("March 2022 – December 2024");
    expect(dateRange(null, "2018")).toBe("2018");
    expect(dateRange(null, null)).toBe("");
  });
});

describe("buildResumeTypst", () => {
  const src = buildResumeTypst(bank, selection);

  it("escapes bullet text and uses rewordings", () => {
    expect(src).toContain("- Did \\#1 thing \\[fast\\]");
    expect(src).toContain("- Did another, reworded");
  });

  it("groups consecutive roles at one organisation under its name once", () => {
    expect(src.match(/weight: "bold"\)\[Acme\]/g)).toHaveLength(1);
    expect(src).toContain("stroke: (left: 0.7pt + rule)");
    expect(src).toContain("[*Senior Engineer*]");
    expect(src).toContain("[*Engineer*]");
    // Globex is alone, so its title leads and the organisation sits under it.
    expect(src).toContain(`weight: "bold")[Junior]`);
    expect(src).toContain("[Globex]");
  });

  it("shortens links and picks an icon per host", () => {
    expect(src).toContain("[in/ada-example]");
    expect(src).toContain("[github.com/ada]");
    expect(src).toContain("[ada.dev/work]");
    expect(src).toContain("[ledger.example.com]");
  });

  it("uses the bundled font only", () => {
    expect(src).toContain(`font: ("Merriweather"`);
    expect(src).toContain(`paper: "us-letter"`);
  });

  it("renders education with GPA and honours under its own heading", () => {
    expect(src).toContain("= Education");
    expect(src).toContain("September 2014 – 2018");
    expect(src).toContain("GPA 3.7/4.0");
    expect(src).toContain("- Dean's List 2017");
  });

  it("renders only the selected certifications, after education", () => {
    expect(src).toContain("= Certifications");
    expect(src).toContain("[Cloud Practitioner]");
    expect(src).toContain("March 2024");
    expect(src).toContain("[verify.example/c1]");
    expect(src).not.toContain("Unrelated Cert");
    expect(src.indexOf("= Certifications")).toBeGreaterThan(
      src.indexOf("= Education"),
    );
  });
});

describe("buildCoverLetterTypst", () => {
  it("keeps the letter's own paragraphs and names the role", () => {
    const src = buildCoverLetterTypst(bank, selection.coverLetter, {
      title: "Senior Engineer",
      company: "Acme",
    });
    expect(src).toContain("*Re: Senior Engineer at Acme*");
    expect(src).toContain("Dear team,\n\nOne paragraph.\n\nAda");
    expect(src).not.toContain("= Summary");
  });
});

describe("esc", () => {
  it("escapes Typst markup characters", () => {
    expect(esc("a*b_c#d$e`f<g>h@i[j]k\\l")).toBe(
      "a\\*b\\_c\\#d\\$e\\`f\\<g\\>h\\@i\\[j\\]k\\\\l",
    );
  });
});
