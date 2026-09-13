import { describe, expect, it } from "vitest";
import { applicationsPerWeek, countPerStage, responseRateByVerdict, weekStart, type StatsApplication } from "./stats.js";

const at = (iso: string) => new Date(iso);

function app(id: string, stage: StatsApplication["stage"], fitVerdict: StatsApplication["fitVerdict"], events: [StatsApplication["stage"], string][]): StatsApplication {
  return { id, stage, fitVerdict, events: events.map(([toStage, iso]) => ({ toStage, createdAt: at(iso) })) };
}

describe("weekStart", () => {
  it("returns the Monday of the week in UTC", () => {
    expect(weekStart(at("2026-09-11T15:00:00Z")).toISOString()).toBe("2026-09-07T00:00:00.000Z"); // Friday
    expect(weekStart(at("2026-09-13T23:59:00Z")).toISOString()).toBe("2026-09-07T00:00:00.000Z"); // Sunday
    expect(weekStart(at("2026-09-14T00:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z"); // Monday
  });
});

describe("applicationsPerWeek", () => {
  const now = at("2026-09-11T12:00:00Z");
  const apps = [
    app("a", "APPLIED", "GOOD", [["SAVED", "2026-09-01T09:00:00Z"], ["APPLIED", "2026-09-06T23:30:00Z"]]), // Sunday, week of 08-31
    app("b", "SCREENING", "STRONG", [["APPLIED", "2026-09-07T00:10:00Z"], ["SCREENING", "2026-09-10T00:00:00Z"]]), // Monday, week of 09-07
    app("c", "APPLIED", "GOOD", [["APPLIED", "2026-09-09T00:00:00Z"]]),
    app("d", "GENERATED", "GOOD", [["SAVED", "2026-09-09T00:00:00Z"]]), // never applied
    app("e", "APPLIED", "POOR", [["APPLIED", "2026-06-01T00:00:00Z"]]), // outside the window
  ];

  it("buckets by week across a boundary, zero-filled and oldest first", () => {
    const weeks = applicationsPerWeek(apps, now, 3);
    expect(weeks).toEqual([
      { weekStart: "2026-08-24", count: 0 },
      { weekStart: "2026-08-31", count: 1 },
      { weekStart: "2026-09-07", count: 2 },
    ]);
  });

  it("uses the first Applied event when there are several", () => {
    const twice = app("f", "APPLIED", "GOOD", [["APPLIED", "2026-09-02T00:00:00Z"], ["SAVED", "2026-09-03T00:00:00Z"], ["APPLIED", "2026-09-09T00:00:00Z"]]);
    const weeks = applicationsPerWeek([twice], now, 2);
    expect(weeks).toEqual([
      { weekStart: "2026-08-31", count: 1 },
      { weekStart: "2026-09-07", count: 0 },
    ]);
  });
});

describe("countPerStage", () => {
  it("counts every stage, including empty ones", () => {
    const counts = countPerStage([app("a", "APPLIED", null, []), app("b", "APPLIED", null, []), app("c", "OFFER", null, [])]);
    expect(counts.APPLIED).toBe(2);
    expect(counts.OFFER).toBe(1);
    expect(counts.SAVED).toBe(0);
    expect(Object.keys(counts)).toHaveLength(8);
  });
});

describe("responseRateByVerdict", () => {
  it("counts a later Screening, Interview or Offer as a response", () => {
    const r = responseRateByVerdict([
      app("a", "SCREENING", "STRONG", [["APPLIED", "2026-09-01T00:00:00Z"], ["SCREENING", "2026-09-05T00:00:00Z"]]),
      app("b", "REJECTED", "STRONG", [["APPLIED", "2026-09-01T00:00:00Z"], ["REJECTED", "2026-09-05T00:00:00Z"]]),
      app("c", "OFFER", "GOOD", [["APPLIED", "2026-09-01T00:00:00Z"], ["INTERVIEW", "2026-09-05T00:00:00Z"], ["OFFER", "2026-09-08T00:00:00Z"]]),
      app("d", "GENERATED", "GOOD", [["SAVED", "2026-09-01T00:00:00Z"]]),
    ]);
    expect(r.STRONG).toEqual({ applied: 2, responded: 1, rate: 0.5 });
    expect(r.GOOD).toEqual({ applied: 1, responded: 1, rate: 1 });
    expect(r.POSSIBLE).toEqual({ applied: 0, responded: 0, rate: null });
  });

  it("ignores applications without a verdict", () => {
    const r = responseRateByVerdict([app("a", "APPLIED", null, [["APPLIED", "2026-09-01T00:00:00Z"]])]);
    expect(Object.values(r).every((b) => b.applied === 0)).toBe(true);
  });
});
