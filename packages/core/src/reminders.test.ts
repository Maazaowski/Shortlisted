import { describe, expect, it } from "vitest";
import { QUIET_AFTER_APPLIED, dueReminderFor, quietDays } from "./reminders.js";

const applied = new Date("2026-09-01T10:00:00Z");
const day = (n: number) => new Date(applied.getTime() + n * 86_400_000);

describe("dueReminderFor", () => {
  it("is due ten days after Applied with no change", () => {
    const r = dueReminderFor({ stage: "APPLIED", lastEventAt: applied }, day(10));
    expect(r).toEqual({ rule: QUIET_AFTER_APPLIED.rule, dueAt: day(10) });
  });

  it("is not due on day nine", () => {
    expect(dueReminderFor({ stage: "APPLIED", lastEventAt: applied }, day(9.9))).toBeNull();
  });

  it("stays due after the tenth day", () => {
    expect(dueReminderFor({ stage: "APPLIED", lastEventAt: applied }, day(30))?.dueAt).toEqual(day(10));
  });

  it("is not due once the stage has moved on", () => {
    expect(dueReminderFor({ stage: "SCREENING", lastEventAt: applied }, day(30))).toBeNull();
    expect(dueReminderFor({ stage: "REJECTED", lastEventAt: applied }, day(30))).toBeNull();
  });

  it("is not due before Applied", () => {
    expect(dueReminderFor({ stage: "GENERATED", lastEventAt: applied }, day(30))).toBeNull();
  });
});

describe("quietDays", () => {
  it("counts whole days", () => {
    expect(quietDays(applied, day(11.7))).toBe(11);
    expect(quietDays(applied, day(0.5))).toBe(0);
  });
});
