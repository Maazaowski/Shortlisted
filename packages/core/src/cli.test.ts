import { describe, expect, it } from "vitest";
import { askCli, CliError, invocation } from "./cli.js";
import {
  buildParsePrompt,
  buildSelectPrompt,
  parseParseReply,
  parseSelectReply,
} from "./manual.js";
import { provider } from "./provider.js";
import type { Bank } from "./schemas.js";

const PARSED = {
  isJobPosting: true,
  title: "Backend Engineer",
  company: "Example",
  location: null,
  seniority: "senior",
  mustHaveSkills: ["python"],
  niceToHaveSkills: [],
  keywords: [],
  responsibilities: [],
  yearsExperience: null,
};

const bank: Bank = {
  fullName: "Sam Lee",
  email: "sam@example.com",
  phone: null,
  location: null,
  links: [],
  headline: "Engineer",
  summary: "Builds things.",
  skillGroups: [{ name: "Languages", skills: ["python"] }],
  education: [],
  certifications: [],
  entries: [
    {
      id: "cuid_entry",
      kind: "ROLE",
      organization: "Acme",
      title: "Engineer",
      location: null,
      startDate: "2020-01",
      endDate: null,
      url: null,
      bullets: [
        {
          id: "cuid_bullet",
          text: "Cut extraction time by 40%",
          skills: ["python"],
          metric: "40%",
          inBase: true,
        },
      ],
    },
  ],
};

describe("provider", () => {
  it("accepts the CLI providers by name and never guesses them", () => {
    const before = {
      p: process.env.SHORTLISTED_PROVIDER,
      k: process.env.ANTHROPIC_API_KEY,
    };
    try {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.SHORTLISTED_PROVIDER = "Claude-CLI";
      expect(provider()).toBe("claude-cli");
      process.env.SHORTLISTED_PROVIDER = "codex-cli";
      expect(provider()).toBe("codex-cli");
      process.env.SHORTLISTED_PROVIDER = "something-else";
      expect(provider()).toBe("manual");
    } finally {
      if (before.p === undefined) delete process.env.SHORTLISTED_PROVIDER;
      else process.env.SHORTLISTED_PROVIDER = before.p;
      if (before.k !== undefined) process.env.ANTHROPIC_API_KEY = before.k;
    }
  });
});

describe("invocation", () => {
  it("keeps the prompt off the command line", () => {
    for (const kind of ["claude-cli", "codex-cli"] as const) {
      const { args } = invocation(kind, {});
      expect(args.join(" ")).not.toContain("{");
    }
  });

  it("honours the binary and model overrides", () => {
    const inv = invocation("claude-cli", {
      CLAUDE_BIN: "/opt/claude",
      SHORTLISTED_CLI_MODEL: "some-model",
    });
    expect(inv.command).toBe("/opt/claude");
    expect(inv.args).toContain("some-model");
  });
});

describe("askCli", () => {
  it("returns the parsed reply, tolerating chatter around the JSON", async () => {
    const run = async () =>
      `Here you go:\n\`\`\`json\n${JSON.stringify(PARSED)}\n\`\`\``;
    const job = await askCli(
      "claude-cli",
      "parse",
      buildParsePrompt("posting"),
      parseParseReply,
      run,
    );
    expect(job.title).toBe("Backend Engineer");
  });

  it("retries once with the reason, then succeeds", async () => {
    const prompts: string[] = [];
    const run = async (_k: unknown, prompt: string) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? "I cannot find the posting."
        : JSON.stringify(PARSED);
    };
    const job = await askCli(
      "codex-cli",
      "parse",
      "PROMPT",
      parseParseReply,
      run,
    );
    expect(job.company).toBe("Example");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous reply was rejected.");
  });

  it("fails with a sentence after two unusable replies", async () => {
    const run = async () => "no json here";
    await expect(
      askCli("claude-cli", "parse", "PROMPT", parseParseReply, run),
    ).rejects.toThrow(CliError);
    await expect(
      askCli("claude-cli", "parse", "PROMPT", parseParseReply, run),
    ).rejects.toThrow(/Claude Code gave a parse reply that could not be used/);
  });
});

describe("select through a CLI", () => {
  it("shows aliases in the prompt and maps them back to bank ids", () => {
    const prompt = buildSelectPrompt(bank, "Job title: Backend Engineer");
    expect(prompt).toContain("- b1: Cut extraction time by 40%");
    expect(prompt).not.toContain("cuid_");
    const reply = JSON.stringify({
      headline: "Backend Engineer",
      summary: "Builds things.",
      skillGroups: [{ name: "Languages", skills: ["python"] }],
      entries: [{ entryId: "e1", bullets: [{ id: "b1", rewording: null }] }],
      certifications: [],
      coverLetter: "Hello.",
    });
    const selection = parseSelectReply(reply, bank);
    expect(selection.entries[0]?.entryId).toBe("cuid_entry");
    expect(selection.entries[0]?.bullets[0]?.id).toBe("cuid_bullet");
  });
});

describe("claude-cli environment", () => {
  it("keeps an API key away from the tool so the subscription is used", () => {
    const inv = invocation("claude-cli", {
      ANTHROPIC_API_KEY: "k",
      PATH: "/bin",
    });
    expect(inv.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(inv.env.PATH).toBe("/bin");
  });
});
