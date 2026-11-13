import { describe, expect, it } from "vitest";
import {
  CAREER_FIELDS,
  COUNTRIES,
  countryName,
  DEFAULT_PREFERENCES,
  parseTitleLines,
  PreferencesSchema,
} from "./preferences.js";

describe("preferences", () => {
  it("has sixteen career fields and named countries", () => {
    expect(CAREER_FIELDS).toHaveLength(16);
    expect(countryName("PK")).toBe("Pakistan");
    expect(COUNTRIES.find((c) => c.code === "AE")?.name).toBe(
      "United Arab Emirates",
    );
    expect(countryName("ZZ")).toBe("ZZ");
  });

  it("accepts the defaults", () => {
    expect(PreferencesSchema.safeParse(DEFAULT_PREFERENCES).success).toBe(true);
  });

  it("normalises country case and rejects unknown codes", () => {
    expect(
      PreferencesSchema.parse({ ...DEFAULT_PREFERENCES, homeCountry: "eg" })
        .homeCountry,
    ).toBe("EG");
    expect(
      PreferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, citizenship: "XX" })
        .success,
    ).toBe(false);
  });

  it("needs at least one pool and an https feed address", () => {
    expect(
      PreferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, pools: [] })
        .success,
    ).toBe(false);
    expect(
      PreferencesSchema.safeParse({
        ...DEFAULT_PREFERENCES,
        feedUrl: "http://example.com/feed",
      }).success,
    ).toBe(false);
    expect(
      PreferencesSchema.safeParse({
        ...DEFAULT_PREFERENCES,
        feedUrl: "https://example.com/feed",
      }).success,
    ).toBe(true);
  });

  it("reads one title per line without repeats", () => {
    expect(
      parseTitleLines(
        "Backend Engineer\n\n  backend   engineer \nData Analyst",
      ),
    ).toEqual(["Backend Engineer", "Data Analyst"]);
  });
});
