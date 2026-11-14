// A stand-in for Claude Code, used only by the end-to-end tests. It answers
// the three prompts Shortlisted sends (import, parse, select) from fixed rules,
// so the automatic path can be tested with no subscription and no network.
//
// A posting can steer it with a marker word:
//   FAKE_FAIL      exit with an error, as a signed-out tool would
//   FAKE_BADJSON   print something that is not JSON, twice
//   FAKE_NOTJOB    say the page is not a job posting
//   FAKE_INVENT    reword a bullet with a number the bank does not contain
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

// Signing in. Without FAKE_CLAUDE_HOME the tool is always signed in. With it,
// it is signed in only after "auth login" was given the code "good-code".
const home = process.env.FAKE_CLAUDE_HOME;
const marker = home ? path.join(home, "signed-in") : null;
if (args[0] === "auth") {
  if (!marker) process.exit(0);
  if (args[1] === "status") process.exit(existsSync(marker) ? 0 : 1);
  if (args[1] === "logout") {
    rmSync(marker, { force: true });
    process.exit(0);
  }
  if (args[1] === "login") {
    process.stdout.write("Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.example/oauth/authorize?code=true&client_id=fake\nPaste code here if prompted > ");
    let typed = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      typed += chunk;
      if (typed.includes("\n")) break;
    }
    if (typed.trim() === "good-code") {
      mkdirSync(home, { recursive: true });
      writeFileSync(marker, "yes");
      process.stdout.write("\nLogin successful.\n");
      process.exit(0);
    }
    process.stderr.write("\nInvalid code. Login failed.\n");
    process.exit(1);
  }
  process.exit(0);
}
if (marker && !existsSync(marker)) {
  process.stderr.write("Not logged in. Please run /login\n");
  process.exit(1);
}

let prompt = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) prompt += chunk;

const say = (value) => {
  process.stdout.write(`Here is the JSON:\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`);
  process.exit(0);
};

if (prompt.includes("FAKE_FAIL")) {
  process.stderr.write("Invalid API key. Please run /login\n");
  process.exit(1);
}
if (prompt.includes("FAKE_BADJSON")) {
  process.stdout.write("I am sorry, I cannot help with that.\n");
  process.exit(0);
}

// A short prompt with no section headings is the connection test.
if (!prompt.includes("## ")) {
  process.stdout.write("ok\n");
  process.exit(0);
}

// Import: the resume becomes the bank.
if (prompt.includes("## Resume")) {
  say(JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "fixtures", "bank.json"), "utf8")));
}

const list = (text, label) => {
  const m = text.match(new RegExp(`${label}:\\s*([^.\\n]+)`, "i"));
  return m ? m[1].split(/,| and /).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
};

// Select: pick the first two bullets of every entry in the bank as printed.
if (prompt.includes("## Experience bank")) {
  const bank = prompt.slice(prompt.indexOf("## Experience bank"), prompt.lastIndexOf("## Job"));
  const job = prompt.slice(prompt.lastIndexOf("## Job"), prompt.lastIndexOf("## Reply"));
  const entries = [];
  let current = null;
  for (const line of bank.split("\n")) {
    const e = line.match(/^### (e\d+):/);
    if (e) {
      current = { entryId: e[1], bullets: [] };
      entries.push(current);
      continue;
    }
    const b = line.match(/^- (b\d+): (.*)$/);
    if (b && current && current.bullets.length < 2) current.bullets.push({ id: b[1], rewording: null });
  }
  const first = entries[0]?.bullets[0];
  if (first && job.includes("fake_invent")) first.rewording = "Built a ledger on Kubernetes that cut costs by 97%";
  const name = bank.match(/^Name: (.*)$/m)?.[1] ?? "The candidate";
  const company = job.match(/Company: (.*)$/m)?.[1] ?? "your company";
  say({
    headline: "Senior Software Engineer",
    summary: "Backend engineer who ships multi-tenant SaaS on Node, Postgres and TypeScript.",
    skillGroups: [{ name: "Backend", skills: ["node", "typescript", "postgres"] }],
    entries: entries.filter((x) => x.bullets.length > 0),
    certifications: bank.includes("- c1:") ? ["c1"] : [],
    coverLetter: `Dear hiring team,\n\nI build payment ledgers on Postgres and would like to do that at ${company}. I would welcome a conversation.\n\n${name}`,
  });
}

// Parse: read "Title at Company" from the first line and the two skill lines.
if (prompt.includes("## Page text")) {
  const page = prompt.slice(prompt.indexOf("## Page text") + 12, prompt.lastIndexOf("## Reply"));
  if (page.includes("FAKE_NOTJOB")) {
    say({ isJobPosting: false, title: "", company: "", location: null, seniority: "unknown", mustHaveSkills: [], niceToHaveSkills: [], keywords: [], responsibilities: [], yearsExperience: null });
  }
  const title = page.match(/^\s*(?:Title|Role): (.*)$/im)?.[1]?.trim() ?? page.match(/"title"\s*:\s*"([^"]+)"/)?.[1] ?? "Software Engineer";
  const company = page.match(/^\s*Company: (.*)$/im)?.[1]?.trim() ?? page.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? "Unknown company";
  const location = page.match(/^\s*Location: (.*)$/im)?.[1]?.trim() ?? null;
  say({
    isJobPosting: true,
    title,
    company,
    location,
    seniority: /staff/i.test(title) ? "staff" : /senior/i.test(title) ? "senior" : "mid",
    mustHaveSkills: list(page, "Must have"),
    niceToHaveSkills: list(page, "Nice to have"),
    // The select prompt only sees the parsed job, so a marker for it travels as a keyword.
    keywords: page.includes("FAKE_INVENT") ? ["fake_invent"] : [],
    responsibilities: ["Own the service", "Mentor engineers"],
    yearsExperience: null,
  });
}

process.stderr.write("fake claude: did not recognise the prompt\n");
process.exit(1);
