import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { tmpdir } from "node:os";
import { cliLabel, invocation, type CliProvider } from "@shortlisted/core";

/**
 * Signing in to Claude Code or Codex from inside the app, so nobody has to
 * open a terminal. The app starts the tool's own sign-in, shows the link it
 * prints, and passes back what the tool asks for:
 *
 *   Claude Code  prints a link, then waits for the code the page shows.
 *   Codex        prints a link and a one-time code, then waits by itself.
 *
 * The tool is the unmodified one and keeps its own login where it always
 * does. The app never sees a password, only the link and the code. One
 * sign-in runs at a time, held in this process.
 */

export type LoginView = {
  kind: CliProvider;
  state: "starting" | "waiting" | "done" | "failed";
  /** The page to open. */
  url: string | null;
  /** Codex: the one-time code to type on that page. */
  userCode: string | null;
  /** Claude Code: the page gives a code that has to be pasted back. */
  needsCode: boolean;
  message: string | null;
};

type Session = LoginView & { child: ChildProcessWithoutNullStreams; output: string; timer: NodeJS.Timeout };

const g = globalThis as unknown as { shortlistedLogin?: Session };

const LOGIN_ARGS: Record<CliProvider, string[]> = {
  "claude-cli": ["auth", "login"],
  "codex-cli": ["login", "--device-auth"],
};
const LOGOUT_ARGS: Record<CliProvider, string[]> = {
  "claude-cli": ["auth", "logout"],
  "codex-cli": ["logout"],
};

const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

function start(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  const options = { cwd: tmpdir(), env, windowsHide: true };
  // On Windows the tools are .cmd shims, which only a shell can start. The arguments are fixed, never user text.
  return process.platform === "win32" ? spawn([command, ...args].join(" "), { ...options, shell: true }) : spawn(command, args, options);
}

function view(s: Session): LoginView {
  return { kind: s.kind, state: s.state, url: s.url, userCode: s.userCode, needsCode: s.needsCode, message: s.message };
}

function lastLines(text: string): string {
  return strip(text).trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" ").slice(0, 300);
}

function read(s: Session): void {
  const text = strip(s.output);
  if (!s.url) {
    const m = s.kind === "claude-cli" ? /visit:\s*(https:\/\/\S+)/.exec(text) : /(https:\/\/auth\.openai\.com\/\S+)/.exec(text);
    if (m?.[1]) s.url = m[1];
  }
  if (s.kind === "codex-cli" && !s.userCode) {
    const m = /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/.exec(text);
    if (m?.[1]) s.userCode = m[1];
  }
  const ready = s.kind === "claude-cli" ? Boolean(s.url) : Boolean(s.url && s.userCode);
  if (ready && s.state === "starting") s.state = "waiting";
}

export function cancelLogin(): void {
  const s = g.shortlistedLogin;
  if (!s) return;
  clearTimeout(s.timer);
  if (s.state === "starting" || s.state === "waiting") s.child.kill();
  g.shortlistedLogin = undefined;
}

/** Starts the tool's sign-in and returns once it has printed its link, or failed to. */
export async function startLogin(kind: CliProvider): Promise<LoginView> {
  cancelLogin();
  const { command, env } = invocation(kind);
  const child = start(command, LOGIN_ARGS[kind], env);
  const s: Session = {
    kind,
    child,
    output: "",
    state: "starting",
    url: null,
    userCode: null,
    needsCode: kind === "claude-cli",
    message: null,
    // The codes expire; a sign-in nobody finished is stopped rather than left running.
    timer: setTimeout(() => cancelLogin(), 15 * 60_000),
  };
  g.shortlistedLogin = s;

  const take = (d: Buffer) => {
    s.output += d.toString("utf8");
    read(s);
  };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  child.stdin.on("error", () => {});
  child.on("error", (e: NodeJS.ErrnoException) => {
    s.state = "failed";
    s.message = e.code === "ENOENT" ? `${cliLabel(kind)} is not installed where Shortlisted runs.` : `${cliLabel(kind)} could not start: ${e.message}`;
  });
  child.on("close", (code) => {
    clearTimeout(s.timer);
    if (s.state === "failed") return;
    s.state = code === 0 ? "done" : "failed";
    if (code !== 0) s.message = lastLines(s.output) || `${cliLabel(kind)} stopped before the sign-in finished.`;
  });

  const until = Date.now() + 25_000;
  while (s.state === "starting" && Date.now() < until) await new Promise((r) => setTimeout(r, 150));
  if (s.state === "starting") {
    s.state = "failed";
    s.message = `${cliLabel(kind)} did not show a sign-in link. ${lastLines(s.output)}`.trim();
    child.kill();
  }
  return view(s);
}

/** Where the running sign-in stands. Null when none was started. */
export function loginStatus(): LoginView | null {
  const s = g.shortlistedLogin;
  return s ? view(s) : null;
}

/** Claude Code: hands the code from the sign-in page to the tool and waits for it to finish. */
export async function submitLoginCode(code: string): Promise<LoginView | null> {
  const s = g.shortlistedLogin;
  if (!s) return null;
  if (s.state !== "waiting") return view(s);
  // One line of text to the tool's own prompt. Line breaks are removed so it stays one answer.
  s.child.stdin.write(`${code.replace(/[\r\n]/g, "").trim()}\n`);
  const until = Date.now() + 60_000;
  while (s.state === "waiting" && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
  if (s.state === "waiting") {
    s.state = "failed";
    s.message = "The sign-in did not finish. Start it again and use a fresh code.";
    s.child.kill();
  }
  return view(s);
}

/** Signs the tool out. Used when the user wants to switch accounts. */
export async function logout(kind: CliProvider): Promise<void> {
  cancelLogin();
  const { command, env } = invocation(kind);
  await new Promise<void>((resolve) => {
    const child = start(command, LOGOUT_ARGS[kind], env);
    const timer = setTimeout(() => child.kill(), 20_000);
    child.on("error", () => resolve());
    child.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
    child.stdin.end();
  });
}
