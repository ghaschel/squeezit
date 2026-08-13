import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitRunner = (args: string[]) => Promise<string>;

const runGit: GitRunner = async (args) => {
  const { stdout } = await execFileAsync("git", args);
  return stdout;
};

export async function assertReleaseReady(
  git: GitRunner = runGit
): Promise<void> {
  const worktree = await git(["status", "--porcelain"]);
  if (worktree.trim()) {
    throw new Error("Release requires a clean worktree");
  }

  const branch = (await git(["branch", "--show-current"])).trim();
  if (branch !== "main") {
    throw new Error("Release must run from the local main branch");
  }

  const [head, originMain] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "origin/main"]),
  ]);

  if (head.trim() !== originMain.trim()) {
    throw new Error("Release requires HEAD to equal origin/main");
  }
}

if (import.meta.main) {
  await assertReleaseReady();
}
