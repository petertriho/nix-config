import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkChildReceipt, checkLeadAdmission, preflightTeamChild, recordLeadStart,
  type ChildReceipt,
} from "../team-admission.ts";
import type { TaskDiskInputs } from "../task-disk-policy.ts";

function fixture(run: (context: {
  root: string;
  lead: TaskDiskInputs;
  child: TaskDiskInputs;
  config: string;
  store: string;
}) => void): void {
  const root = mkdtempSync(join(tmpdir(), "pi-team-admission-"));
  try {
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    const config = join(agentDir, "tasks-config.json");
    writeFileSync(config, '{"autoClearCompleted":"never"}');
    const store = join(root, "shared.json");
    writeFileSync(store, '{"nextId":1,"tasks":[]}');
    const lead: TaskDiskInputs = {
      cwd, agentDir, sessionId: "lead-session",
      sessionFile: join(root, "lead.jsonl"), piTasks: store,
    };
    const child: TaskDiskInputs = {
      ...lead, sessionId: "child-session", sessionFile: join(root, "child.jsonl"),
    };
    run({ root, lead, child, config, store });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("lead admission needs its own start receipt and holds after configuration drift", () => {
  fixture(({ lead, config }) => {
    assert.equal(checkLeadAdmission(lead).ok, false);
    const start = recordLeadStart(lead, { reason: "new", incarnation: "process-1" });
    assert.equal(start.ok, true);
    assert.equal(recordLeadStart(lead, { reason: "startup", incarnation: "process-2" }).ok, true);
    if (!start.ok) return;
    assert.equal(checkLeadAdmission(lead, start.value).ok, true);
    assert.equal(checkLeadAdmission({ ...lead, sessionId: "other" }, start.value).ok, false);
    writeFileSync(config, '{"autoClearCompleted":"never","taskScope":"project"}');
    assert.equal(checkLeadAdmission(lead, start.value).ok, false);
    const reload = recordLeadStart(lead, { reason: "reload", incarnation: "process-1" });
    assert.equal(reload.ok, true);
    if (reload.ok) assert.equal(checkLeadAdmission(lead, reload.value).ok, true);
    assert.equal(recordLeadStart(lead, { reason: "resume", incarnation: "process-1" }).ok, false);
  });
});

test("child preflight pins the lead file and rejects an all-completed list before launch", () => {
  fixture(({ lead, child, store }) => {
    const start = recordLeadStart(lead, { reason: "new", incarnation: "process-1" });
    if (!start.ok) throw new Error(start.reason);
    const admitted = checkLeadAdmission(lead, start.value);
    if (!admitted.ok) throw new Error(admitted.reason);
    assert.equal(preflightTeamChild(admitted.value, { ...child, piTasks: undefined }).ok, false);
    assert.equal(preflightTeamChild(admitted.value, child).ok, true);
    writeFileSync(store, JSON.stringify({
      nextId: 2, tasks: [{ id: "1", subject: "Done", description: "Keep", status: "completed" }],
    }));
    const allCompleted = checkLeadAdmission(lead, start.value);
    if (!allCompleted.ok) throw new Error(allCompleted.reason);
    const blocked = preflightTeamChild(allCompleted.value, child);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.match(blocked.reason, /all-completed/);
  });
});

test("child-specific handshake cannot be replaced by a lead receipt or a stale member epoch", () => {
  fixture(({ lead, child, config }) => {
    const start = recordLeadStart(lead, { reason: "new", incarnation: "process-1" });
    if (!start.ok) throw new Error(start.reason);
    const admitted = checkLeadAdmission(lead, start.value);
    if (!admitted.ok) throw new Error(admitted.reason);
    const preflight = preflightTeamChild(admitted.value, child);
    if (!preflight.ok) throw new Error(preflight.reason);
    const identity = { memberId: "alice", memberEpoch: 2 };
    const receipt: ChildReceipt = {
      ...identity, sessionId: child.sessionId!, cwd: child.cwd, agentDir: child.agentDir,
      piTasks: admitted.value.path, configFingerprint: preflight.value.configFingerprint,
    };
    assert.equal(checkChildReceipt(preflight.value, child, identity).ok, false);
    assert.equal(checkChildReceipt(preflight.value, child, identity, {
      ...receipt, memberEpoch: 1,
    }).ok, false);
    assert.equal(checkChildReceipt(preflight.value, child, identity, receipt).ok, true);
    writeFileSync(config, '{"autoClearCompleted":"never","changed":true}');
    assert.equal(checkChildReceipt(preflight.value, child, identity, receipt).ok, false);
  });
});
