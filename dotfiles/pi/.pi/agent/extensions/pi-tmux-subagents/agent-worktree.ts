import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface OwnedWorktree {
  /** Original repository root, used only to release an unused checkout. */
  sourceRoot: string;
  path: string;
  cwd: string;
}

/**
 * Allocate a unique checkout, or refuse the launch. Never use the source
 * checkout as a fallback: a caller requested concurrent worktree isolation.
 */
export function allocateAgentWorktree(sourceCwd: string): OwnedWorktree {
  if (!isAbsolute(sourceCwd)) throw new Error("The working directory must be absolute.");
  let sourceRoot: string;
  try {
    sourceRoot = realpathSync(execFileSync(
      "git", ["-C", sourceCwd, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim());
  } catch {
    throw new Error("The requested working directory is not a git repository or worktree.");
  }
  const subdir = relative(sourceRoot, realpathSync(sourceCwd));
  if (subdir === ".." || subdir.startsWith(`..${sep}`) || isAbsolute(subdir)) {
    throw new Error("The requested working directory is outside its git repository.");
  }
  const path = mkdtempSync(join(tmpdir(), "pi-agent-worktree-"));
  try {
    execFileSync("git", ["-C", sourceRoot, "worktree", "add", "--detach", path, "HEAD"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // A failed git operation may have left files behind. Remove only the
    // empty temporary directory; never erase a nonempty partial checkout.
    if (existsSync(path) && readdirSync(path).length === 0) rmdirSync(path);
    throw new Error(`Could not allocate a git worktree: ${error instanceof Error ? error.message : String(error)}`);
  }
  const worktree = { sourceRoot, path, cwd: resolve(path, subdir) };
  if (!existsSync(worktree.cwd) || !statSync(worktree.cwd).isDirectory()) {
    releaseUnusedWorktree(worktree);
    throw new Error("The selected working directory is absent from the new worktree.");
  }
  return worktree;
}

/** Release only a clean, unused checkout after launch failed. Dirty state is retained. */
export function releaseUnusedWorktree(worktree: OwnedWorktree): void {
  try {
    const status = execFileSync("git", ["-C", worktree.path, "status", "--porcelain", "--untracked-files=all"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    if (status.trim()) return;
    execFileSync("git", ["-C", worktree.sourceRoot, "worktree", "remove", worktree.path], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // Preserve any checkout we cannot prove clean or fully release.
  }
}
