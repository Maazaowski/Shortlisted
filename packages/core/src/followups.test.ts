import { describe, expect, it } from "vitest";
import { followupTemplates, followupsForStage, type FollowupContext } from "./followups.js";

const ctx: FollowupContext = {
  role: "Backend Engineer",
  company: "Ledgerly",
  contactName: "Sara Khan",
  yourName: "Test User",
  appliedAt: new Date("2026-11-03T09:00:00Z"),
  interviewAt: new Date("2026-11-12T00:00:00Z"),
};

describe("followupTemplates", () => {
  it("returns the five templates", () => {
    expect(followupTemplates(ctx).map((t) => t.id)).toEqual(["applied-note", "follow-up", "thank-you", "check-in", "rejection-reply"]);
  });

  it("fills role, company, contact first name, dates and the signature", () => {
    const followUp = followupTemplates(ctx).find((t) => t.id === "follow-up")!;
    expect(followUp.subject).toBe("Following up: Backend Engineer");
    expect(followUp.body).toContain("Hi Sara,");
    expect(followUp.body).toContain("the Backend Engineer role at Ledgerly on 3 November");
    expect(followUp.body.endsWith("Best regards,\nTest User")).toBe(true);
    expect(followupTemplates(ctx).find((t) => t.id === "thank-you")!.body).toContain("on 12 November");
  });

  it("reads naturally with nothing known", () => {
    const bare = followupTemplates({ role: null, company: null, contactName: null, yourName: "Test User", appliedAt: null, interviewAt: null });
    for (const t of bare) {
      expect(t.body).toContain("Hello,");
      expect(t.body).not.toMatch(/null|undefined|  /);
    }
    expect(bare.find((t) => t.id === "follow-up")!.body).toContain("I applied for the role recently");
  });

  it("has no em dashes or exclamation marks", () => {
    for (const t of followupTemplates(ctx)) expect(`${t.subject}${t.body}${t.when}`).not.toMatch(/[—!]/);
  });
});

describe("followupsForStage", () => {
  it("puts the ten-day follow-up first in Applied", () => {
    const { now, others } = followupsForStage("APPLIED", ctx);
    expect(now.map((t) => t.id)).toEqual(["follow-up", "applied-note"]);
    expect(others).toHaveLength(3);
  });

  it("offers the rejection reply when rejected and nothing when saved", () => {
    expect(followupsForStage("REJECTED", ctx).now.map((t) => t.id)).toEqual(["rejection-reply"]);
    expect(followupsForStage("SAVED", ctx).now).toEqual([]);
    expect(followupsForStage("SAVED", ctx).others).toHaveLength(5);
  });
});
