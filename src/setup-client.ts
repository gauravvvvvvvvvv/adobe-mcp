import { execFileSync } from "node:child_process";

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command: string, args: string[]) {
  try {
    const stdout = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    const err = error as Error & { status?: number; stdout?: string; stderr?: string };
    return {
      ok: false,
      status: err.status,
      stdout: String(err.stdout ?? "").trim(),
      stderr: String(err.stderr ?? err.message ?? "").trim()
    };
  }
}

function usage(): never {
  console.error("Usage: adobe-mcp-setup --client codex|claude [--server-command adobe-mcp] [--scope user|local|project] [--force]");
  process.exit(2);
}

const client = value("--client");
if (client !== "codex" && client !== "claude") usage();

const serverCommand = value("--server-command") ?? "adobe-mcp";
const force = process.argv.includes("--force");
const requestedScope = value("--scope");
const claudeScope = requestedScope ?? "user";
if (client === "codex" && requestedScope) {
  console.error(JSON.stringify({
    ok: false,
    client,
    error: "--scope is only supported for Claude Code setup"
  }, null, 2));
  process.exit(2);
}
if (client === "claude" && !["user", "local", "project"].includes(claudeScope)) {
  console.error(JSON.stringify({
    ok: false,
    client,
    error: "Invalid Claude Code scope. Use user, local or project."
  }, null, 2));
  process.exit(2);
}

if (client === "codex") {
  const existing = run("codex", ["mcp", "get", "adobe"]);
  if (existing.ok && !force) {
    console.log(JSON.stringify({
      ok: true,
      changed: false,
      client,
      message: "Codex already has an MCP server named adobe. Use --force to replace it.",
      existing: existing.stdout
    }, null, 2));
    process.exit(0);
  }
  if (existing.ok && force) {
    const removed = run("codex", ["mcp", "remove", "adobe"]);
    if (!removed.ok) {
      console.error(JSON.stringify({ ok: false, client, stage: "remove", error: removed.stderr || removed.stdout }, null, 2));
      process.exit(1);
    }
  }

  const added = run("codex", ["mcp", "add", "adobe", "--", serverCommand]);
  if (!added.ok) {
    console.error(JSON.stringify({
      ok: false,
      client,
      stage: "add",
      error: added.stderr || added.stdout,
      fallback: '[mcp_servers.adobe]\ncommand = "' + serverCommand.replace(/"/g, '\\"') + '"'
    }, null, 2));
    process.exit(1);
  }
  const verified = run("codex", ["mcp", "get", "adobe"]);
  if (!verified.ok) {
    console.error(JSON.stringify({
      ok: false,
      changed: true,
      client,
      stage: "verify",
      error: verified.stderr || verified.stdout || "Codex configuration was written but could not be read back."
    }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    ok: true,
    changed: true,
    client,
    command: serverCommand,
    verification: "codex mcp get adobe",
    output: verified.stdout || added.stdout
  }, null, 2));
  process.exit(0);
}

const existing = run("claude", ["mcp", "get", "adobe"]);
if (existing.ok && !force) {
  console.log(JSON.stringify({
    ok: true,
    changed: false,
    client,
    message: "Claude Code already has an MCP server named adobe. Use --force to replace it.",
    existing: existing.stdout
  }, null, 2));
  process.exit(0);
}
if (existing.ok && force) {
  const removed = run("claude", ["mcp", "remove", "adobe", "--scope", "user"]);
  if (!removed.ok) {
    console.error(JSON.stringify({ ok: false, client, stage: "remove", error: removed.stderr || removed.stdout }, null, 2));
    process.exit(1);
  }
}

const commandArgs = process.platform === "win32"
  ? ["mcp", "add", "--transport", "stdio", "--scope", claudeScope, "adobe", "--", "cmd", "/c", serverCommand]
  : ["mcp", "add", "--transport", "stdio", "--scope", claudeScope, "adobe", "--", serverCommand];

const added = run("claude", commandArgs);
if (!added.ok) {
  console.error(JSON.stringify({
    ok: false,
    client,
    stage: "add",
    error: added.stderr || added.stdout,
    hint: process.platform === "win32"
      ? "Claude Code on native Windows requires cmd /c around local stdio executables."
      : "Verify the claude CLI is installed and on PATH."
  }, null, 2));
  process.exit(1);
}
const verified = run("claude", ["mcp", "get", "adobe"]);
if (!verified.ok) {
  console.error(JSON.stringify({
    ok: false,
    changed: true,
    client,
    scope: claudeScope,
    stage: "verify",
    error: verified.stderr || verified.stdout || "Claude Code configuration was written but could not be read back.",
    hint: "Run claude mcp get adobe and claude mcp list to inspect scope precedence or connection status."
  }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  changed: true,
  client,
  scope: claudeScope,
  command: serverCommand,
  verification: "claude mcp get adobe",
  output: verified.stdout || added.stdout
}, null, 2));
