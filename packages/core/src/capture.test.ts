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
