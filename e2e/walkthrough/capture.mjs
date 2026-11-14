// Runs a command and saves what it printed, with timings, so the release tour
// can replay real terminal output on screen.
//
//   node walkthrough/capture.mjs <out.json> <cwd> <shown command> -- <real command...>
//
// "shown command" is what the replay types at the prompt. The real command may
// differ only in plumbing (for example a full path to powershell).
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [out, cwd, shown, sep, ...real] = process.argv.slice(2);
if (!out || !cwd || !shown || sep !== "--" || real.length === 0) {
  console.error("usage: capture.mjs <out.json> <cwd> <shown command> -- <real command...>");
  process.exit(2);
}

const started = Date.now();
const chunks = [];
const child = spawn(real.join(" "), { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
const take = (data) => {
  const text = data.toString("utf8");
  process.stdout.write(text);
  chunks.push({ t: Date.now() - started, text });
};
child.stdout.on("data", take);
child.stderr.on("data", take);
child.on("close", (code) => {
  writeFileSync(out, JSON.stringify({ command: shown, cwd, code, seconds: Math.round((Date.now() - started) / 1000), chunks }, null, 2));
  process.exit(code ?? 1);
});
