import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { ManualReplyError } from "./manual.js";
import type { CliProvider } from "./provider.js";

/**
 * The CLI providers: the same text prompts as manual mode, sent through a
 * command line tool the user has signed in to with their own subscription.
 * The tool is used as plain text in, text out. It gets no tools of its own and
 * runs in an empty directory, so it reads nothing from the machine.
 *
 * Everything that differs between the two tools is in invocation(). The prompt
 * always goes in on stdin, never on the command line, so no posting or resume
 * text reaches a shell.
 */

export type CliInvocation = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

const LABEL: Record<CliProvider, string> = {
  "claude-cli": "Claude Code",
  "codex-cli": "Codex",
};
const SIGN_IN: Record<CliProvider, string> = {
  "claude-cli": "claude auth login",
  "codex-cli": "codex login --device-auth",
};

/**
 * In print mode Claude Code prefers an API key over the subscription login
 * whenever one is in the environment. Choosing claude-cli means "use my
 * subscription", so the key and the cloud selectors are kept from the child.
 */
const CLAUDE_ENV_DROPPED = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

export function invocation(
  kind: CliProvider,
  env: NodeJS.ProcessEnv = process.env,
): CliInvocation {
  const model = env.SHORTLISTED_CLI_MODEL?.trim();
  if (kind === "claude-cli") {
    const childEnv = { ...env };
    for (const name of CLAUDE_ENV_DROPPED) delete childEnv[name];
    return {
      command: env.CLAUDE_BIN?.trim() || "claude",
      // One turn, no tools, no MCP servers, no CLAUDE.md, skills or hooks, no
      // transcript on disk, and nothing that could wait for an answer.
      args: [
        "--print",
        "--output-format",
        "text",
        "--max-turns",
        "1",
        "--tools",
        "",
        "--safe-mode",
        "--strict-mcp-config",
        "--permission-mode",
        "dontAsk",
        "--no-session-persistence",
        ...(model ? ["--model", model] : []),
      ],
      env: childEnv,
    };
  }
  return {
    command: env.CODEX_BIN?.trim() || "codex",
    // exec never asks for approval and prints only the final message on stdout.
    // "-" reads the prompt from stdin. Codex has no switch that removes its
    // tools, so the read-only sandbox and the empty directory are the limits.
    args: [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--color",
      "never",
      ...(model ? ["--model", model] : []),
      "-",
    ],
    env: { ...env },
  };
}

export class CliError extends Error {}
export class CliNotInstalledError extends CliError {
  constructor(label: string, command: string) {
    super(
      `${label} is not installed where Shortlisted runs. The command "${command}" was not found.`,
    );
  }
}

export function cliLabel(kind: CliProvider): string {
  return LABEL[kind];
}

const TIMEOUT_MS = Number(process.env.SHORTLISTED_CLI_TIMEOUT_MS) || 5 * 60_000;

function lastLines(text: string, n: number): string {
  return text.trim().split(/\r?\n/).slice(-n).join(" ").slice(0, 400);
}

type Finished = { code: number | null; out: string; err: string };

/** Starts a tool with fixed arguments, feeds it stdin, and collects what it prints. Rejects only when it cannot start or times out. */
function execTool(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdin: string,
  timeoutMs: number,
): Promise<Finished> {
  const onWindows = process.platform === "win32";
  return new Promise((resolve, reject) => {
    // On Windows the tools are .cmd shims, which only a shell can start, so
    // the fixed arguments are joined into one command line. Only the empty
    // argument and a path with spaces need quoting.
    const quote = (a: string) => (a === "" || /\s/.test(a) ? `"${a}"` : a);
    const options = {
      cwd: tmpdir(),
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    };
    const child = onWindows
      ? spawn([command, ...args].map(quote).join(" "), {
          ...options,
          shell: true,
        })
      : spawn(command, args, options);
    let out = "";
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      const span =
        timeoutMs >= 60_000
          ? `${Math.round(timeoutMs / 60_000)} minutes`
          : `${Math.round(timeoutMs / 1000)} seconds`;
      finish(() =>
        reject(new CliError(`${label} did not answer within ${span}.`)),
      );
    }, timeoutMs);

    child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (err += d));
    child.on("error", (e: NodeJS.ErrnoException) =>
      finish(() =>
        reject(
          e.code === "ENOENT"
            ? new CliNotInstalledError(label, command)
            : new CliError(`${label} could not start: ${e.message}`),
        ),
      ),
    );
    child.on("close", (code) => finish(() => resolve({ code, out, err })));
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

/** The Windows shell reports a missing command as exit code 1 with this text, not as ENOENT. */
function looksMissing(f: Finished): boolean {
  return (
    f.code !== 0 &&
    /is not recognized as an internal or external command|command not found|No such file or directory/i.test(
      f.err,
    )
  );
}

/** Runs the tool once and returns what it printed. */
export async function runCli(
  kind: CliProvider,
  prompt: string,
): Promise<string> {
  const { command, args, env } = invocation(kind);
  const label = LABEL[kind];
  const f = await execTool(label, command, args, env, prompt, TIMEOUT_MS);
  if (looksMissing(f)) throw new CliNotInstalledError(label, command);
  if (f.code === 0 && f.out.trim()) return f.out;
  const detail = lastLines(f.err || f.out, 4) || "It printed nothing.";
  const signedOut = /log(ged)? ?in|authenticat|sign(ed)? ?in|401/i.test(detail);
  const hint = signedOut
    ? ` Sign in with "${SIGN_IN[kind]}" (in Docker, put "docker compose exec worker" in front), then try again.`
    : "";
  throw new CliError(
    `${label} exited with code ${f.code ?? "none"}. ${detail}${/[.!?]$/.test(detail) ? "" : "."}${hint}`,
  );
}

export type CliStatus = {
  installed: boolean;
  signedIn: boolean;
  signInCommand: string;
};

const STATUS_ARGS: Record<CliProvider, string[]> = {
  "claude-cli": ["auth", "status"],
  "codex-cli": ["login", "status"],
};

/** Is the tool present and signed in? Both tools answer this with an exit code and no model call. */
export async function cliStatus(kind: CliProvider): Promise<CliStatus> {
  const { command, env } = invocation(kind);
  const signInCommand = SIGN_IN[kind];
  try {
    const f = await execTool(
      LABEL[kind],
      command,
      STATUS_ARGS[kind],
      env,
      "",
      20_000,
    );
    if (looksMissing(f))
      return { installed: false, signedIn: false, signInCommand };
    return { installed: true, signedIn: f.code === 0, signInCommand };
  } catch (e) {
    if (e instanceof CliNotInstalledError)
      return { installed: false, signedIn: false, signInCommand };
    return { installed: true, signedIn: false, signInCommand };
  }
}

/**
 * One model call through a CLI. `read` is the same reply parser manual mode
 * uses. A reply that does not parse gets one more attempt with the reason
 * attached; after that the error surfaces to the user as a sentence.
 */
export async function askCli<T>(
  kind: CliProvider,
  stage: string,
  prompt: string,
  read: (text: string) => T,
  run: (kind: CliProvider, prompt: string) => Promise<string> = runCli,
): Promise<T> {
  const first = await run(kind, prompt);
  try {
    return read(first);
  } catch (e) {
    if (!(e instanceof ManualReplyError)) throw e;
    const retry = `${prompt}\n\nYour previous reply was rejected. ${e.message} Reply again with only the JSON object.`;
    const second = await run(kind, retry);
    try {
      return read(second);
    } catch (e2) {
      if (!(e2 instanceof ManualReplyError)) throw e2;
      throw new CliError(
        `${LABEL[kind]} gave a ${stage} reply that could not be used. ${e2.message}`,
      );
    }
  }
}
