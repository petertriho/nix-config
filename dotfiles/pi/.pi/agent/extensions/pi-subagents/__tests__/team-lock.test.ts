import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { reclaimDeadTeamLock } from "../teams/lock.ts";

const stalePid = 123456;
const stale = `${stalePid}:abandoned`;
const noProcess = () => Object.assign(new Error("No such process"), { code: "ESRCH" });

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "pi-team-lock-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(root, "state.lock");
}

test("reclamation accepts only a proven dead PID and removes its guard", (t) => {
  const path = fixture(t);
  t.mock.method(process, "kill", (pid: number, signal: number) => {
    assert.equal(pid, stalePid);
    assert.equal(signal, 0);
    throw noProcess();
  });
  for (const token of [stale, String(stalePid)]) {
    writeFileSync(path, token);
    assert.equal(reclaimDeadTeamLock(path), true);
    assert.equal(existsSync(path), false);
    assert.equal(existsSync(`${path}.reclaim`), false);
  }
});

test("live, inaccessible, malformed and incomplete locks are never reclaimed", (t) => {
  const path = fixture(t);
  const probe = t.mock.method(process, "kill", () => true);
  for (const token of ["", "garbage", "0", "-123", "123junk", "123:", "123:token\n", "99999999999999999999"]) {
    writeFileSync(path, token);
    assert.equal(reclaimDeadTeamLock(path), false);
    assert.equal(readFileSync(path, "utf8"), token);
    assert.equal(existsSync(`${path}.reclaim`), false);
  }
  assert.equal(probe.mock.callCount(), 0);
  writeFileSync(path, stale);
  assert.equal(reclaimDeadTeamLock(path), false, "a live owner is not stale");
  for (const code of ["EPERM", "EACCES", "EINVAL", undefined]) {
    probe.mock.mockImplementation(() => { throw Object.assign(new Error("Unknown liveness"), { code }); });
    assert.equal(reclaimDeadTeamLock(path), false);
    assert.equal(readFileSync(path, "utf8"), stale);
  }
});

test("an existing reclamation guard fails closed without probing or removing the lock", (t) => {
  const path = fixture(t);
  writeFileSync(path, stale);
  mkdirSync(`${path}.reclaim`);
  const probe = t.mock.method(process, "kill", () => { throw noProcess(); });
  assert.equal(reclaimDeadTeamLock(path), false);
  assert.equal(probe.mock.callCount(), 0);
  assert.equal(readFileSync(path, "utf8"), stale);
  assert.equal(existsSync(`${path}.reclaim`), true, "even an abandoned guard requires offline recovery");
});

test("reclamation preserves substituted inodes, changed tokens, and symlinks", (t) => {
  const path = fixture(t);
  writeFileSync(path, stale);
  const probe = t.mock.method(process, "kill", () => {
    renameSync(path, `${path}.old`);
    writeFileSync(path, stale);
    throw noProcess();
  });
  assert.equal(reclaimDeadTeamLock(path), false, "the same token on a new inode is not the observed lock");
  assert.equal(readFileSync(path, "utf8"), stale);
  probe.mock.mockImplementation(() => {
    writeFileSync(path, `${process.pid}:replacement`);
    throw noProcess();
  });
  assert.equal(reclaimDeadTeamLock(path), false, "an in-place token change also invalidates the observation");
  assert.equal(readFileSync(path, "utf8"), `${process.pid}:replacement`);
  const link = `${path}.link`;
  symlinkSync(path, link);
  assert.equal(reclaimDeadTeamLock(link), false);
  assert.equal(readFileSync(path, "utf8"), `${process.pid}:replacement`);
});
