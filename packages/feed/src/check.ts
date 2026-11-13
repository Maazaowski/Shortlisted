import { loadCompanies } from "./companies.js";
import { pool } from "./http.js";
import { SOURCES } from "./sources/index.js";

/**
 * Checks every board in companies.yaml and prints which ones answer and how
 * many jobs they list. Run it before adding companies:
 *
 *   pnpm --filter @shortlisted/feed check-boards
 */
const companies = loadCompanies();
const results = await pool(companies, 6, async (c) => {
  const source = SOURCES[c.ats];
  if (!source) throw new Error(`unknown ats ${c.ats}`);
  return (await source(c)).length;
});

let bad = 0;
results.forEach((r, i) => {
  const c = companies[i];
  if (!c) return;
  if (r.ok && r.value > 0) console.log(`ok    ${String(r.value).padStart(5)}  ${c.ats}:${c.board}  ${c.name}`);
  else {
    bad++;
    console.log(`${r.ok ? "empty" : "FAIL "}        ${c.ats}:${c.board}  ${c.name}${r.ok ? "" : `  (${r.error.message})`}`);
  }
});
console.log(`\n${companies.length - bad} of ${companies.length} boards answered with jobs.`);
