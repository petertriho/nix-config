import {
  closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, rmdirSync, unlinkSync,
} from "node:fs";

function readLock(path: string): { dev: bigint; ino: bigint; token: string } {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile()) throw new Error("Unsafe team lock file");
    return { dev: stat.dev, ino: stat.ino, token: readFileSync(fd, "utf8") };
  } finally {
    closeSync(fd);
  }
}

/**
 * Serialize stale observations AND unlink, not just the final identity check.
 * All team reclaimers must use this guard; a check followed by unlink alone
 * lets a delayed reclaimer delete a newer owner's lock.
 *
 * Never reclaim the guard itself. A crash here requires manual recovery with
 * all writers stopped; recursive stale-lock recovery would recreate the race.
 * Native writers still use the same PID lock, but do not honor this guard.
 */
export function reclaimDeadTeamLock(path: string): boolean {
  const guard = `${path}.reclaim`;
  try {
    mkdirSync(guard, { mode: 0o700 });
  } catch {
    return false;
  }
  try {
    const observed = readLock(path);
    // Native pi-tasks locks can contain just a PID; team locks add a token.
    const match = /^([1-9]\d*)(?::[^\s:]+)?$/.exec(observed.token);
    const pid = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      // EPERM and every ambiguous failure mean "possibly still running".
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
    }
    const current = readLock(path);
    if (current.dev !== observed.dev || current.ino !== observed.ino ||
        current.token !== observed.token) return false;
    unlinkSync(path);
    return true;
  } catch {
    // Missing, incomplete, unreadable, or substituted locks are not evidence
    // of a dead owner. Retry acquisition without removing anything.
    return false;
  } finally {
    rmdirSync(guard);
  }
}
