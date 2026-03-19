import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const APP_NAME = "squeezit";
const PACKAGE_NAME = "squeezit";

function detectPackageManager() {
  const userAgent = (process.env.npm_config_user_agent ?? "").trim().toLowerCase();

  if (userAgent.startsWith("bun/")) {
    return "bun";
  }

  if (userAgent.startsWith("npm/")) {
    return "npm";
  }

  if (process.versions?.bun) {
    return "bun";
  }

  return null;
}

function resolveConfigDirectory() {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, APP_NAME);
  }

  return join(homedir(), ".config", APP_NAME);
}

async function main() {
  const packageManager = detectPackageManager();
  if (!packageManager) {
    return;
  }

  const directory = resolveConfigDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "config.json"),
    JSON.stringify(
      {
        packageManager,
        packageName: PACKAGE_NAME,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

main().catch(() => {
  // Best effort only: package installation should not fail if metadata cannot be persisted.
});
