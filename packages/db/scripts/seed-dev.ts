// Seeds a small experience bank so the bank editor and the generation
// pipeline can be exercised without running the resume import.
//
//   pnpm --filter @shortlisted/db seed
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { LOCAL_USER_ID, prisma, withUser } from "../src/index.js";

const rootEnv = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) loadEnvFile(rootEnv);

const userId = LOCAL_USER_ID;

await withUser(userId, async (tx) => {
  await tx.profile.upsert({
    where: { userId },
    create: {
      userId,
      fullName: "Sample Person",
      email: "sample@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      links: [{ label: "github.com", url: "https://github.com/example" }],
      headline: "Senior Software Engineer",
      summary: "Backend engineer who ships multi-tenant SaaS on Node, Postgres and TypeScript, with a habit of measuring what changed.",
      skillGroups: [
        { name: "Backend", skills: ["node", "typescript", "postgres", "prisma", "nestjs"] },
        { name: "Frontend", skills: ["react", "next", "tailwind"] },
        { name: "Infra", skills: ["docker", "ci cd", "aws"] },
      ],
      education: [{ institution: "State University", degree: "BSc", field: "Computer Science", start: "2014-09", end: "2018-06" }],
    },
    update: {},
  });
  await tx.bankEntry.deleteMany({ where: { userId } });
  await tx.bankEntry.create({
    data: {
      userId,
      kind: "ROLE",
      organization: "Acme Payments",
      title: "Senior Software Engineer",
      location: "Remote",
      startDate: "2022-03",
      endDate: null,
      sortOrder: 0,
      bullets: {
        create: [
          { userId, text: "Built a double-entry ledger with multi-currency FX on Postgres, used by 40 businesses", skills: ["postgres", "typescript", "nestjs"], metric: "40 businesses", sortOrder: 0 },
          { userId, text: "Cut invoice extraction time by 40% with PDF fingerprinting and per-customer models", skills: ["python", "fastapi", "mysql"], metric: "40%", sortOrder: 1 },
          { userId, text: "Introduced Postgres row-level security across every tenant table, replacing app-only checks", skills: ["postgres", "rls", "prisma"], metric: null, sortOrder: 2 },
          { userId, text: "Set up Playwright end-to-end suites that run on every pull request in under 6 minutes", skills: ["playwright", "ci cd", "testing"], metric: "6 minutes", sortOrder: 3, inBase: false },
        ],
      },
    },
  });
  await tx.bankEntry.create({
    data: {
      userId,
      kind: "ROLE",
      organization: "Widget Co",
      title: "Software Engineer",
      startDate: "2018-07",
      endDate: "2022-02",
      sortOrder: 1,
      bullets: {
        create: [
          { userId, text: "Migrated a monolith's reporting module to a Next.js app with React Query, halving page load time", skills: ["next", "react", "react query"], metric: "halved", sortOrder: 0 },
          { userId, text: "Containerised 12 services with Docker and moved deploys to a GitHub Actions pipeline", skills: ["docker", "ci cd", "github actions"], metric: "12 services", sortOrder: 1 },
        ],
      },
    },
  });
  await tx.bankEntry.create({
    data: {
      userId,
      kind: "PROJECT",
      organization: "Velaro",
      title: "Desktop app to train and serve local LLMs",
      url: "https://github.com/example/velaro",
      startDate: "2025-01",
      endDate: null,
      sortOrder: 2,
      bullets: {
        create: [
          { userId, text: "Shipped a Tauri v2 and React 19 desktop app exposing an OpenAI-compatible API for local models", skills: ["tauri", "rust", "react", "llm"], metric: null, sortOrder: 0 },
        ],
      },
    },
  });
});

console.log("Seeded the sample bank. Edit it at /bank.");
await prisma.$disconnect();
