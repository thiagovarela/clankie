/**
 * lil service installer — manages systemd (Linux) and launchd (macOS) services.
 *
 * Commands:
 *   lil daemon install    — install and start the service
 *   lil daemon uninstall  — stop and remove the service
 *   lil daemon logs       — show service logs
 *
 * On Linux:  installs a systemd user service (~/.config/systemd/user/lil.service)
 * On macOS:  installs a launchd user agent (~/Library/LaunchAgents/ai.lil.daemon.plist)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { getLilDir } from "./config.ts";

const SERVICE_NAME = "lil";
const LAUNCHD_LABEL = "ai.lil.daemon";

// ─── Resolve the lil binary path ──────────────────────────────────────────────

function resolveLilBinary(): string {
  // If running from a compiled binary, use its path
  if (!process.argv[1]?.endsWith(".ts")) {
    return process.argv[0];
  }

  // Running from source — use bun + script path
  // Return the full command that systemd/launchd will use
  return process.argv[0]; // bun binary path
}

function resolveProgramArguments(): string[] {
  if (!process.argv[1]?.endsWith(".ts")) {
    // Compiled binary
    return [process.argv[0], "start", "--foreground"];
  }
  // Running from source with bun
  return [process.argv[0], process.argv[1], "start", "--foreground"];
}

// ─── Systemd (Linux) ──────────────────────────────────────────────────────────

function systemdUnitPath(): string {
  return join(homedir(), ".config", "systemd", "user", `${SERVICE_NAME}.service`);
}

function buildSystemdUnit(): string {
  const args = resolveProgramArguments();
  const execStart = args.map(systemdEscapeArg).join(" ");
  const workspace = join(getLilDir(), "workspace");
  const logDir = join(getLilDir(), "logs");

  return [
    "[Unit]",
    `Description=lil — personal AI assistant daemon`,
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    `ExecStart=${execStart}`,
    `WorkingDirectory=${workspace}`,
    "Restart=always",
    "RestartSec=5",
    "KillMode=process",
    `Environment=HOME=${homedir()}`,
    `Environment=PATH=${process.env.PATH}`,
    `StandardOutput=append:${join(logDir, "daemon.log")}`,
    `StandardError=append:${join(logDir, "daemon.log")}`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

function systemdEscapeArg(value: string): string {
  if (!/[\s"\\]/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function execSafe(cmd: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, stdout: stdout.trim(), stderr: "" };
  } catch (err: any) {
    return { ok: false, stdout: err.stdout?.trim() ?? "", stderr: err.stderr?.trim() ?? "" };
  }
}

async function installSystemd(): Promise<void> {
  // Check systemctl is available
  const check = execSafe("systemctl --user status");
  if (!check.ok) {
    const detail = `${check.stderr} ${check.stdout}`.toLowerCase();
    if (detail.includes("not found") || detail.includes("no such file")) {
      console.error("systemctl not found. systemd user services are required on Linux.");
      process.exit(1);
    }
  }

  const unitPath = systemdUnitPath();
  const logDir = join(getLilDir(), "logs");
  const workspace = join(getLilDir(), "workspace");

  // Ensure directories exist
  mkdirSync(dirname(unitPath), { recursive: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });

  // Write unit file
  const unit = buildSystemdUnit();
  writeFileSync(unitPath, unit, "utf-8");
  console.log(`Wrote systemd unit: ${unitPath}`);

  // Enable lingering so services run without an active login session
  const linger = execSafe("loginctl enable-linger");
  if (linger.ok) {
    console.log("Enabled user linger (service runs without active login).");
  }

  // Reload, enable, and start
  const reload = execSafe("systemctl --user daemon-reload");
  if (!reload.ok) {
    console.error(`daemon-reload failed: ${reload.stderr}`);
    process.exit(1);
  }

  const enable = execSafe(`systemctl --user enable ${SERVICE_NAME}.service`);
  if (!enable.ok) {
    console.error(`enable failed: ${enable.stderr}`);
    process.exit(1);
  }

  const restart = execSafe(`systemctl --user restart ${SERVICE_NAME}.service`);
  if (!restart.ok) {
    console.error(`restart failed: ${restart.stderr}`);
    process.exit(1);
  }

  console.log(`\n✓ Installed and started systemd service: ${SERVICE_NAME}.service`);
  console.log(`  Logs: journalctl --user -u ${SERVICE_NAME} -f`);
  console.log(`  Or:   ${join(logDir, "daemon.log")}`);
}

async function uninstallSystemd(): Promise<void> {
  const unitPath = systemdUnitPath();

  execSafe(`systemctl --user disable --now ${SERVICE_NAME}.service`);

  try {
    unlinkSync(unitPath);
    console.log(`Removed: ${unitPath}`);
  } catch {
    console.log(`Service file not found at ${unitPath}`);
  }

  execSafe("systemctl --user daemon-reload");
  console.log(`✓ Uninstalled systemd service.`);
}

function logsSystemd(): void {
  const logFile = join(getLilDir(), "logs", "daemon.log");
  console.log(`Log file: ${logFile}\n`);

  // Try journalctl first, fall back to log file
  const result = execSafe(`journalctl --user -u ${SERVICE_NAME} --no-pager -n 50`);
  if (result.ok && result.stdout) {
    console.log(result.stdout);
  } else if (existsSync(logFile)) {
    const content = readFileSync(logFile, "utf-8");
    const lines = content.split("\n");
    const last50 = lines.slice(-50).join("\n");
    console.log(last50);
  } else {
    console.log("No logs found.");
  }
}

function statusSystemd(): void {
  const result = execSafe(`systemctl --user status ${SERVICE_NAME}.service`);
  console.log(result.stdout || result.stderr || "Service not found.");
}

// ─── launchd (macOS) ──────────────────────────────────────────────────────────

function launchdPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function plistEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildLaunchdPlist(): string {
  const args = resolveProgramArguments();
  const logDir = join(getLilDir(), "logs");
  const workspace = join(getLilDir(), "workspace");

  const argsXml = args.map((a) => `      <string>${plistEscape(a)}</string>`).join("\n");

  // Build environment variables
  const envVars: Record<string, string> = {};
  if (process.env.PATH) envVars.PATH = process.env.PATH;
  if (process.env.HOME) envVars.HOME = process.env.HOME;

  const envXml = Object.entries(envVars)
    .map(
      ([k, v]) =>
        `      <key>${plistEscape(k)}</key>\n      <string>${plistEscape(v)}</string>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${plistEscape(LAUNCHD_LABEL)}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
    <key>WorkingDirectory</key>
    <string>${plistEscape(workspace)}</string>
    <key>StandardOutPath</key>
    <string>${plistEscape(join(logDir, "daemon.log"))}</string>
    <key>StandardErrorPath</key>
    <string>${plistEscape(join(logDir, "daemon.log"))}</string>
    <key>EnvironmentVariables</key>
    <dict>
${envXml}
    </dict>
  </dict>
</plist>
`;
}

async function installLaunchd(): Promise<void> {
  const plistPath = launchdPlistPath();
  const logDir = join(getLilDir(), "logs");
  const workspace = join(getLilDir(), "workspace");

  mkdirSync(dirname(plistPath), { recursive: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });

  // Unload existing if present
  if (existsSync(plistPath)) {
    execSafe(`launchctl unload "${plistPath}"`);
  }

  const plist = buildLaunchdPlist();
  writeFileSync(plistPath, plist, "utf-8");
  console.log(`Wrote plist: ${plistPath}`);

  const load = execSafe(`launchctl load "${plistPath}"`);
  if (!load.ok) {
    console.error(`launchctl load failed: ${load.stderr}`);
    process.exit(1);
  }

  console.log(`\n✓ Installed and started launchd agent: ${LAUNCHD_LABEL}`);
  console.log(`  Logs: tail -f ${join(logDir, "daemon.log")}`);
}

async function uninstallLaunchd(): Promise<void> {
  const plistPath = launchdPlistPath();

  if (existsSync(plistPath)) {
    execSafe(`launchctl unload "${plistPath}"`);
    unlinkSync(plistPath);
    console.log(`Removed: ${plistPath}`);
  } else {
    console.log(`Plist not found at ${plistPath}`);
  }

  console.log(`✓ Uninstalled launchd agent.`);
}

function logsLaunchd(): void {
  const logFile = join(getLilDir(), "logs", "daemon.log");
  console.log(`Log file: ${logFile}\n`);

  if (existsSync(logFile)) {
    const content = readFileSync(logFile, "utf-8");
    const lines = content.split("\n");
    const last50 = lines.slice(-50).join("\n");
    console.log(last50);
  } else {
    console.log("No logs found.");
  }
}

function statusLaunchd(): void {
  const result = execSafe(`launchctl list | grep ${LAUNCHD_LABEL}`);
  if (result.ok && result.stdout) {
    const parts = result.stdout.split(/\s+/);
    const pid = parts[0];
    const exitCode = parts[1];
    if (pid && pid !== "-") {
      console.log(`Daemon is running (pid ${pid}).`);
    } else {
      console.log(`Daemon is not running (last exit code: ${exitCode}).`);
    }
  } else {
    console.log("Daemon is not installed as a launchd agent.");
  }
}

// ─── Platform dispatch ────────────────────────────────────────────────────────

const isMac = platform() === "darwin";
const isLinux = platform() === "linux";

export async function installService(): Promise<void> {
  if (isMac) {
    await installLaunchd();
  } else if (isLinux) {
    await installSystemd();
  } else {
    console.error(`Service installation not supported on ${platform()}.`);
    console.log("Run 'lil start' manually instead.");
    process.exit(1);
  }
}

export async function uninstallService(): Promise<void> {
  if (isMac) {
    await uninstallLaunchd();
  } else if (isLinux) {
    await uninstallSystemd();
  } else {
    console.error(`Service management not supported on ${platform()}.`);
    process.exit(1);
  }
}

export function showServiceLogs(): void {
  if (isMac) {
    logsLaunchd();
  } else if (isLinux) {
    logsSystemd();
  } else {
    const logFile = join(getLilDir(), "logs", "daemon.log");
    if (existsSync(logFile)) {
      console.log(readFileSync(logFile, "utf-8"));
    } else {
      console.log("No logs found.");
    }
  }
}

export function showServiceStatus(): void {
  if (isMac) {
    statusLaunchd();
  } else if (isLinux) {
    statusSystemd();
  } else {
    console.log(`Service management not supported on ${platform()}.`);
    console.log("Use 'lil status' to check if the daemon is running via PID file.");
  }
}
