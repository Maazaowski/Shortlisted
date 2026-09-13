import { describe, expect, it } from "vitest";
import {
  formatCertificationLines,
  formatEducationLines,
  parseCertificationLines,
  parseEducationLines,
} from "./certifications.js";

describe("education lines", () => {
  it("round trips every field", () => {
    const items = [
      {
        degree: "BSc",
        field: "Computer Science",
        institution: "State University",
        start: "2014-09",
        end: "2018-06",
        gpa: "3.7/4.0",
        honors: "Dean's List 2017",
      },
      {
        degree: "MSc",
        field: null,
        institution: "Other",
        start: null,
        end: "2020",
        gpa: null,
        honors: null,
      },
    ];
    const text = formatEducationLines(items);
    expect(text.split("\n")[1]).toBe("MSc |  | Other |  | 2020");
    expect(parseEducationLines(text)).toEqual(items);
  });

  it("ignores blank lines and lines with no degree or institution", () => {
    expect(parseEducationLines("\n | | \n")).toEqual([]);
  });
});

describe("certification lines", () => {
  it("keeps the id of a certification whose name is unchanged", () => {
    const existing = [
      {
        id: "c_keep",
        name: "AWS Developer",
        issuer: "AWS",
        date: "2023-04",
        url: null,
      },
    ];
    const parsed = parseCertificationLines(
      "AWS Developer | Amazon Web Services | 2023-04\nNew Cert | Vendor",
      existing,
    );
    expect(parsed[0]).toEqual({
      id: "c_keep",
      name: "AWS Developer",
      issuer: "Amazon Web Services",
      date: "2023-04",
      url: null,
    });
    expect(parsed[1]?.id).toMatch(/^c_[0-9a-f]{10}$/);
    expect(parsed[1]).toMatchObject({
      name: "New Cert",
      issuer: "Vendor",
      date: null,
      url: null,
    });
  });

  it("formats without trailing separators", () => {
    expect(
      formatCertificationLines([
        { id: "x", name: "Cert", issuer: null, date: null, url: null },
      ]),
    ).toBe("Cert");
    expect(
      formatCertificationLines([
        {
          id: "x",
          name: "Cert",
          issuer: "V",
          date: "2024",
          url: "https://v.example",
        },
      ]),
    ).toBe("Cert | V | 2024 | https://v.example");
  });
});
