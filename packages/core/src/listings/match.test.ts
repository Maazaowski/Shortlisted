import { describe, expect, it } from "vitest";
import { matchListing } from "./match.js";

const bank = new Set(["typescript", "react", "postgres", "docker"]);

describe("matchListing", () => {
  it("splits the posting's skills into shown and missing", () => {
    const m = matchListing(bank, [], { title: "Frontend Engineer", skills: ["react", "typescript", "graphql", "kubernetes"] });
    expect(m.shown).toEqual(["react", "typescript"]);
    expect(m.missing).toEqual(["graphql", "kubernetes"]);
    expect(m.score).toBe(35);
  });

  it("does not call one matching skill a full match", () => {
    const one = matchListing(bank, [], { title: "Engineer", skills: ["react"] });
    const four = matchListing(bank, [], { title: "Engineer", skills: ["react", "typescript", "postgres", "docker"] });
    expect(one.score).toBeLessThan(four.score);
    expect(four.score).toBe(70);
  });

  it("adds the title when every word of a target title is there", () => {
    const m = matchListing(bank, ["Frontend Engineer"], { title: "Senior Frontend Engineer, Growth", skills: [] });
    expect(m.titleMatch).toBe(true);
    expect(m.score).toBe(30);
  });

  it("ignores seniority words in the target title", () => {
    expect(matchListing(bank, ["Senior Data Analyst"], { title: "Data Analyst II", skills: [] }).titleMatch).toBe(true);
  });

  it("gives half for half the title and nothing for an unrelated one", () => {
    expect(matchListing(bank, ["Backend Engineer"], { title: "Platform Engineer", skills: [] }).score).toBe(15);
    expect(matchListing(bank, ["Backend Engineer"], { title: "Account Executive", skills: [] }).score).toBe(0);
  });

  it("orders a listing higher after the skill is added to the bank", () => {
    const listing = { title: "Engineer", skills: ["react", "graphql", "kafka", "redis"] };
    const before = matchListing(bank, [], listing).score;
    const after = matchListing(new Set([...bank, "graphql"]), [], listing).score;
    expect(after).toBeGreaterThan(before);
  });
});
