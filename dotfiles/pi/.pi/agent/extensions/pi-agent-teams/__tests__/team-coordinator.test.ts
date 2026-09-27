import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TeamCoordinator, type CoordinatorNotice } from "../team-coordinator.ts";
import { createMemberMailbox, LEGACY_NATIVE_TASK_HOLD } from "../team-transport.ts";
import { resolveTaskDiskCandidate } from "../task-disk-policy.ts";
import { makeApprovalRequest } from "../team-approval.ts";

async function noticeFixture(
  t: TestContext,
  onNotice: (notice: CoordinatorNotice) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), "pi-coordinator-notices-"));
  let team: TeamCoordinator | undefined;
  t.after(() => {
    team?.close();
    rmSync(root, { recursive: true, force: true });
  });
  const directory = join(root, "team");
  const cwd = join(root, "workspace");
  const agentDir = join(root, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "tasks-config.json"), '{"autoClearCompleted":"never"}');
  const child = {
    cwd, agentDir, sessionId: "child",
    sessionFile: join(root, "child.jsonl"), piTasks: join(root, "tasks.json"),
  };
  writeFileSync(child.sessionFile, '{"type":"session","id":"child"}\n');
  const candidate = resolveTaskDiskCandidate(child);
  if (!candidate.ok) throw new Error(candidate.reason);
  team = await TeamCoordinator.open({ directory, leadSessionId: "lead", onNotice });
  // Drive polls explicitly so delivery counts and message ordering are deterministic.
  team.close();
  const member = await team.addMember({ name: "Current", sessionId: child.sessionId });
  const mailbox = createMemberMailbox({
    directory, teamId: team.teamId, leadSessionId: "lead",
    member: { ...member, sessionId: child.sessionId },
  });
  const receipt = {
    memberId: member.memberId, memberEpoch: member.epoch,
    sessionId: child.sessionId, cwd, agentDir, piTasks: child.piTasks,
    configFingerprint: candidate.configFingerprint,
  };
  const startup = { memberId: member.memberId, memberEpoch: member.epoch, child, candidate, timeoutMs: 1000 };
  return { directory, team, member, mailbox, receipt, startup };
}

for (const priorAttempts of [0, 5]) {
  test(`stopped-member notices cannot apply approvals or block startup after ${priorAttempts} attempts`, async (t) => {
    const delivered: CoordinatorNotice[] = [];
    const { directory, team, member, mailbox, receipt, startup } = await noticeFixture(t, async (notice) => {
      delivered.push(notice);
    });
    const stopped = await team.addMember({ name: "Stopped", sessionId: "stopped-child" });
    const oldMailbox = createMemberMailbox({
      directory, teamId: team.teamId, leadSessionId: "lead",
      member: { ...stopped, sessionId: "stopped-child" },
    });
    await oldMailbox.notice({
      kind: "startup", requestId: "old-startup",
      body: JSON.stringify({
        ...receipt, memberId: stopped.memberId, memberEpoch: stopped.epoch, sessionId: "stopped-child",
      }),
    });
    const request = makeApprovalRequest({
      toolName: "bash", toolCallId: "stopped-call", input: { command: "true" },
      memberId: stopped.memberId, memberEpoch: stopped.epoch,
      memberSessionId: "stopped-child", leadSessionId: "lead",
    });
    await oldMailbox.notice({
      kind: "approval_request", requestId: request.requestId, body: JSON.stringify(request),
    });
    // Also recover a mailbox already stuck at the old batch-wide retry limit.
    for (let attempt = 0; attempt < priorAttempts; attempt++) await team.transport.receiveNotices(team.teamId);
    await team.transport.stopMember({ teamId: team.teamId, memberId: stopped.memberId, epoch: stopped.epoch });
    const current = await mailbox.sendToLead({ requestId: "current", body: "Still working" });
    await mailbox.notice({ kind: "startup", requestId: "startup", body: JSON.stringify(receipt) });

    await team.awaitStartup(startup);
    assert.deepEqual(delivered.map(({ message }) => message.id), [current.id]);
    assert.equal(team.isAdmitted(stopped.memberId), false);
    assert.equal(team.isAdmitted(member.memberId), true);
    assert.deepEqual(await team.transport.receiveNotices(team.teamId), []);
    await team.drain();
    assert.equal(delivered.length, 1);
  });
}

test("failed notices do not block later notices or startup and have bounded, durable retries", async (t) => {
  const delivered: string[] = [];
  let failures = 0;
  const { directory, team, mailbox, receipt, startup } = await noticeFixture(t, async ({ message }) => {
    if (message.requestId === "failing") {
      failures++;
      throw new Error("Notice handler failed");
    }
    delivered.push(message.requestId);
  });
  const malformed = await mailbox.notice({ kind: "startup", requestId: "malformed", body: "not JSON" });
  const forged = await mailbox.notice({
    kind: "startup", requestId: "forged", body: JSON.stringify({ ...receipt, memberEpoch: receipt.memberEpoch + 1 }),
  });
  await team.drain();
  assert.equal(team.isAdmitted(receipt.memberId), false);
  const failing = await mailbox.notice({ kind: "result", requestId: "failing", body: "Retry this notice" });
  await mailbox.sendToLead({ requestId: "current", body: "Still working" });
  await mailbox.notice({ kind: "startup", requestId: "startup", body: JSON.stringify(receipt) });

  await team.awaitStartup(startup);
  assert.deepEqual(delivered, ["current"]);
  assert.equal(failures, 1);
  // Exhaust the retry budget, then prove subsequent traffic is still delivered.
  for (let attempt = 0; attempt < 6; attempt++) await team.drain();
  assert.equal(failures, 5);
  await mailbox.sendToLead({ requestId: "later", body: "New work" });
  await team.drain();
  assert.deepEqual(delivered, ["current", "later"]);
  assert.deepEqual(await team.transport.receiveNotices(team.teamId), []);

  const box = JSON.parse(readFileSync(join(directory, team.teamId, "mailboxes", "lead.json"), "utf8"));
  assert.deepEqual(box.deadLetters, [malformed.id, forged.id, failing.id]);
  assert.equal(box.messages.find((message: { id: string }) => message.id === failing.id).attempts, 5);
  assert.equal(box.acked.includes(failing.id), false);
  const restored = await TeamCoordinator.open({
    directory, leadSessionId: "lead", onNotice: async () => assert.fail("Dead notice replayed after reload"),
  });
  try {
    await restored.drain();
    assert.deepEqual(await restored.transport.receiveNotices(restored.teamId), []);
  } finally {
    restored.close();
  }
});

test("a transient notice failure is retried without replaying later successful notices", async (t) => {
  const attempts: string[] = [];
  const { team, mailbox } = await noticeFixture(t, async ({ message }) => {
    attempts.push(message.requestId);
    if (message.requestId === "retry" && attempts.length === 1) throw new Error("Temporary failure");
  });
  await mailbox.notice({ kind: "idle", requestId: "retry", body: "Waiting" });
  await mailbox.sendToLead({ requestId: "current", body: "Still working" });
  await team.drain();
  assert.deepEqual(attempts, ["retry", "current"]);
  await team.drain();
  assert.deepEqual(attempts, ["retry", "current", "retry"]);
  assert.deepEqual(await team.transport.receiveNotices(team.teamId), []);
});

test("a failed approval request is not retried after its member stops", async (t) => {
  let attempts = 0;
  const { team, member, mailbox } = await noticeFixture(t, async () => {
    attempts++;
    if (attempts === 1) throw new Error("Temporary approval handler failure");
    assert.fail("Stopped-member approval request reached the handler");
  });
  const request = makeApprovalRequest({
    toolName: "bash", toolCallId: "pending-call", input: { command: "true" },
    memberId: member.memberId, memberEpoch: member.epoch, memberSessionId: "child", leadSessionId: "lead",
  });
  await mailbox.notice({ kind: "approval_request", requestId: request.requestId, body: JSON.stringify(request) });
  await team.drain();
  assert.equal(attempts, 1);
  await team.transport.stopMember({ teamId: team.teamId, memberId: member.memberId, epoch: member.epoch });
  await team.drain();
  assert.equal(attempts, 1);
  assert.deepEqual(await team.transport.receiveNotices(team.teamId), []);
});

test("a failed notice acknowledgment does not block another member's startup", async (t) => {
  const { directory, team, mailbox, receipt, startup } = await noticeFixture(t, async () => {});
  const stopped = await team.addMember({ name: "Stopped", sessionId: "stopped-child" });
  const oldMailbox = createMemberMailbox({
    directory, teamId: team.teamId, leadSessionId: "lead",
    member: { ...stopped, sessionId: "stopped-child" },
  });
  const obsolete = await oldMailbox.notice({ kind: "idle", requestId: "old", body: "Waiting" });
  await team.transport.stopMember({ teamId: team.teamId, memberId: stopped.memberId, epoch: stopped.epoch });
  await mailbox.notice({ kind: "startup", requestId: "startup", body: JSON.stringify(receipt) });
  const ackNotice = team.transport.ackNotice;
  t.mock.method(team.transport, "ackNotice", async (input: Parameters<typeof ackNotice>[0]) => {
    if (input.messageId === obsolete.id) throw new Error("Temporary acknowledgment failure");
    await ackNotice(input);
  });

  await team.awaitStartup(startup);
  assert.deepEqual((await team.transport.receiveNotices(team.teamId)).map(({ id }) => id), [obsolete.id]);
  t.mock.restoreAll();
  await team.drain();
  assert.deepEqual(await team.transport.receiveNotices(team.teamId), []);
});

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
