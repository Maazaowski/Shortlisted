// Joins the clips recorded by tour.spec.ts into one MP4.
//
//   node walkthrough/join.mjs <path to ffmpeg> [output.mp4]
//
// The extension part is two recordings, the job page and the side panel. They
// are placed side by side, the way the panel sits next to a page in Chrome,
// and added after the web app part. Needs a full ffmpeg build; the one that
// ships with Playwright can only record.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;
const DIR = path.join(HERE, "..", ".tmp", "walkthrough");
const ffmpeg = process.argv[2];
const out = path.resolve(process.argv[3] ?? path.join(DIR, "shortlisted-walkthrough.mp4"));
if (!ffmpeg) throw new Error("Pass the path to ffmpeg as the first argument.");
for (const f of ["1-app.webm", "2-job.webm", "2-panel.webm"]) {
  if (!existsSync(path.join(DIR, f))) throw new Error(`Missing ${f}. Record first: E2E_WALKTHROUGH=1 pnpm exec playwright test --project=walkthrough`);
}

// Job page 900 wide, then the 380 wide panel cropped out of its 900 wide recording, with a hairline between: 1280 x 720.
const filter = [
  "[0:v]fps=25,scale=1280:720,setsar=1[app]",
  "[1:v]fps=25,crop=900:720:0:0,setsar=1[job]",
  "[2:v]fps=25,crop=380:720:0:0,drawbox=x=0:y=0:w=1:h=720:color=0xd9d4c7:t=fill,setsar=1[panel]",
  "[job][panel]hstack=inputs=2:shortest=1[ext]",
  "[app][ext]concat=n=2:v=1:a=0,format=yuv420p[v]",
].join(";");

const args = ["-y", "-i", path.join(DIR, "1-app.webm"), "-i", path.join(DIR, "2-job.webm"), "-i", path.join(DIR, "2-panel.webm"), "-filter_complex", filter, "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-movflags", "+faststart", out];
const result = spawnSync(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Written ${out}`);
