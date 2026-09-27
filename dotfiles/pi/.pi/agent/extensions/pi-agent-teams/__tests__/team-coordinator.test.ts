import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TeamCoordinator } from "../team-coordinator.ts";
import { createMemberMailbox, LEGACY_NATIVE_TASK_HOLD } from "../team-transport.ts";
import { resolveTaskDiskCandidate } from "../task-disk-policy.ts";

test("lead accepts only an authenticated matching child startup receipt and restores with a rotated epoch", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-coordinator-"));
  let team: TeamCoordinator | undefined;
  let restored: TeamCoordinator | undefined;
  try {
    const directory = join(root, "team");
    const cwd = join(root, "workspace");
    const agentDir = join(root, "agent");
    mkdirSync(cwd);
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
    const taskFile = join(root, "tasks.json");
    const child = {
      cwd, agentDir, sessionId: "child-1",
      sessionFile: join(root, "child.jsonl"), piTasks: taskFile,
    };
    writeFileSync(child.sessionFile, '{"type":"session","id":"child-1"}\n');
    const candidate = resolveTaskDiskCandidate(child);
    if (!candidate.ok) throw new Error(candidate.reason);
    team = await TeamCoordinator.open({
      directory, leadSessionId: "lead-1", teamName: "review", onNotice: async () => {},
    });
    const member = await team.addMember({ name: "Researcher", sessionId: "child-1" });
    const mailbox = createMemberMailbox({
      directory, teamId: team.teamId, leadSessionId: "lead-1",
      member: {
        memberId: member.memberId, sessionId: "child-1", token: member.token, epoch: member.epoch,
      },
    });
    await assert.rejects(
      () => team!.awaitStartup({
        memberId: member.memberId, memberEpoch: 2, child, candidate, timeoutMs: 5,
      }),
      /timed out/,
    );
    await mailbox.notice({
      kind: "startup", requestId: "handshake-1", body: JSON.stringify({
        memberId: member.memberId, memberEpoch: member.epoch,
        sessionId: "child-1", cwd, agentDir, piTasks: taskFile,
        configFingerprint: candidate.configFingerprint,
      }),
    });
    await team.awaitStartup({
      memberId: member.memberId, memberEpoch: member.epoch, child, candidate, timeoutMs: 1000,
    });
    const sent = await team.send("Researcher", "Review the patch");
    assert.equal(sent.kind, "message");
    team.close();
    restored = await TeamCoordinator.open({
      directory, leadSessionId: "lead-1", teamName: "review", onNotice: async () => {},
    });
    await assert.rejects(() => team!.transport.listMembers("main"), /lead ownership|epoch/);
    await assert.rejects(() => restored!.send("Researcher", "Stale"), /startup receipt is absent/);
    await assert.rejects(() => TeamCoordinator.open({
      directory, leadSessionId: "foreign", onNotice: async () => {},
    }), /foreign team/);
  } finally {
    team?.close();
    restored?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a restored lead clears only the previous native-change hold after a safe disk check", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-coordinator-baseline-"));
  let team: TeamCoordinator | undefined;
  let restored: TeamCoordinator | undefined;
  try {
    team = await TeamCoordinator.open({
      directory: join(root, "team"), leadSessionId: "lead",
      taskFingerprint: "old", onNotice: async () => {},
    });
    await team.transport.pauseTaskWrites(team.teamId, LEGACY_NATIVE_TASK_HOLD);
    team.close();
    restored = await TeamCoordinator.open({
      directory: join(root, "team"), leadSessionId: "lead", onNotice: async () => {},
    });
    await restored.requireTaskFingerprint("safe-new");
    assert.deepEqual(await restored.transport.getTaskState(restored.teamId), {
      fingerprint: "safe-new", pauseReason: undefined,
    });
    await restored.transport.pauseTaskWrites(restored.teamId, "Uncertain task commit");
    await assert.rejects(() => restored!.requireTaskFingerprint("another"), /paused/);
  } finally {
    team?.close();
    restored?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
