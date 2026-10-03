import assert from "node:assert/strict";
import test from "node:test";
import { lstatSync, mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemberMailbox, createTeamTransport, LEGACY_NATIVE_TASK_HOLD } from "../team-transport.ts";

test("safe native task changes advance the ledger by compare-and-swap without clearing uncertain holds", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-rebaseline-"));
	try {
		const transport = createTeamTransport({
			directory, lead: { sessionId: "lead", epoch: "epoch", token: "secret" },
		});
		await transport.createTeam("main", "main", "before");
		await transport.recordObservedTaskChange({ teamId: "main", previous: "before", next: "after" });
		assert.deepEqual(await transport.getTaskState("main"), { fingerprint: "after", pauseReason: undefined });
		await assert.rejects(() => transport.recordObservedTaskChange({
			teamId: "main", previous: "before", next: "stale",
		}), /ledger changed/);
		await transport.pauseTaskWrites("main", LEGACY_NATIVE_TASK_HOLD);
		await transport.recordObservedTaskChange({ teamId: "main", previous: "after", next: "new" });
		assert.deepEqual(await transport.getTaskState("main"), { fingerprint: "new", pauseReason: undefined });
		await transport.pauseTaskWrites("main", "Committed result was not delivered");
		await assert.rejects(() => transport.recordObservedTaskChange({
			teamId: "main", previous: "new", next: "later",
		}), /unsafe hold/);
		assert.equal((await transport.getTaskState("main")).pauseReason, "Committed result was not delivered");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("a lead-owned team keeps authenticated member mailboxes ordered, deduplicated, and durable", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-transport-"));
	const teamId = "review-team";
	const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
	const alice = { memberId: "alice", sessionId: "alice-session", token: "alice-secret" };
	const bob = { memberId: "bob", sessionId: "bob-session", token: "bob-secret" };
	const charlie = { memberId: "charlie", sessionId: "charlie-session", token: "charlie-secret" };

	try {
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam(teamId);
		await transport.addMember({ teamId, member: alice });
		await transport.addMember({ teamId, member: bob });
		assert.deepEqual(
			(await transport.listMembers(teamId)).map((member) => member.memberId),
			["alice", "bob"],
		);

		const first = await transport.send({
			teamId, from: alice, to: bob.memberId, requestId: "request-1", body: "First",
		});
		const duplicate = await transport.send({
			teamId, from: alice, to: bob.memberId, requestId: "request-1", body: "First",
		});
		const second = await transport.send({
			teamId, from: alice, to: bob.memberId, requestId: "request-2", body: "Second",
		});
		assert.equal(duplicate.id, first.id);
		assert.notEqual(second.id, first.id);
		assert.deepEqual(await transport.receive({ teamId, member: alice }), []);
		await assert.rejects(async () => {
			await transport.receive({ teamId, member: { ...bob, token: "wrong-secret" } });
		}, /auth|credential|denied/i);
		assert.deepEqual(
			(await transport.receive({ teamId, member: bob })).map(({ id, body }) => ({ id, body })),
			[{ id: first.id, body: "First" }, { id: second.id, body: "Second" }],
		);

		await transport.ack({ teamId, member: bob, messageId: first.id });
		const restored = createTeamTransport({ directory, lead });
		assert.deepEqual(
			(await restored.receive({ teamId, member: bob })).map(({ id, body }) => ({ id, body })),
			[{ id: second.id, body: "Second" }],
		);
		await restored.ack({ teamId, member: bob, messageId: second.id });
		assert.deepEqual(await restored.receive({ teamId, member: bob }), []);

		for (const unauthorizedLead of [
			{ ...lead, epoch: "epoch-1" },
			{ ...lead, sessionId: "foreign-lead" },
		]) {
			await assert.rejects(async () => {
				const unauthorized = createTeamTransport({ directory, lead: unauthorizedLead });
				await unauthorized.addMember({ teamId, member: charlie });
			}, /owner|lead|epoch|auth|denied/i);
		}
		assert.deepEqual(
			(await restored.listMembers(teamId)).map((member) => member.memberId),
			["alice", "bob"],
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("team roster refuses symlink substitution and keeps its state private", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-private-"));
	try {
		const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("private-team");
		const teamDir = join(directory, "private-team");
		const roster = join(teamDir, "roster.json");
		assert.equal(lstatSync(teamDir).mode & 0o077, 0);
		assert.equal(lstatSync(roster).mode & 0o077, 0);
		const backup = join(directory, "other-roster.json");
		renameSync(roster, backup);
		symlinkSync(backup, roster);
		await assert.rejects(() => transport.listMembers("private-team"), /symlink|unsafe/i);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("a child uses its own member credential without possessing the lead token", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-member-"));
	try {
		const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
		const alice = { memberId: "alice", sessionId: "alice-session", token: "alice-secret", epoch: 2 };
		const bob = { memberId: "bob", sessionId: "bob-session", token: "bob-secret", epoch: 1 };
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("member-test");
		await transport.addMember({ teamId: "member-test", member: alice });
		await transport.addMember({ teamId: "member-test", member: bob });
		const sender = createMemberMailbox({ directory, teamId: "member-test", member: alice, leadSessionId: lead.sessionId });
		const receiver = createMemberMailbox({ directory, teamId: "member-test", member: bob, leadSessionId: lead.sessionId });
		const message = await sender.send({ to: "bob", requestId: "request-1", body: "Hello" });
		assert.deepEqual((await receiver.receive()).map((entry) => entry.id), [message.id]);
		await receiver.ack(message.id);
		assert.deepEqual(await receiver.receive(), []);
		const stale = createMemberMailbox({
			directory, teamId: "member-test", member: { ...alice, epoch: 1 }, leadSessionId: lead.sessionId,
		});
		await assert.rejects(() => stale.send({ to: "bob", requestId: "request-2", body: "Stale" }), /epoch|credential|denied/i);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("lead shutdown is durable and refuses later member traffic", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-shutdown-"));
	try {
		const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
		const alice = { memberId: "alice", sessionId: "alice-session", token: "alice-secret" };
		const bob = { memberId: "bob", sessionId: "bob-session", token: "bob-secret" };
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("closed");
		await transport.addMember({ teamId: "closed", member: alice });
		await transport.addMember({ teamId: "closed", member: bob });
		await transport.shutdown("closed");
		await transport.shutdown("closed");
		const child = createMemberMailbox({ directory, teamId: "closed", member: alice, leadSessionId: lead.sessionId });
		await assert.rejects(
			() => child.send({ to: "bob", requestId: "after-stop", body: "Should not deliver" }),
			/stopped|denied/i,
		);
		const restored = createTeamTransport({ directory, lead });
		assert.deepEqual((await restored.listMembers("closed")).map((member) => member.state), ["stopped", "stopped"]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("idle, result and error notices reach only the lead and survive acknowledgment", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-notices-"));
	try {
		const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
		const alice = { memberId: "alice", sessionId: "alice-session", token: "alice-secret" };
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("notices");
		await transport.addMember({ teamId: "notices", member: alice });
		const child = createMemberMailbox({ directory, teamId: "notices", member: alice, leadSessionId: lead.sessionId });
		const idle = await child.notice({ kind: "idle", requestId: "idle-1", body: "Waiting" });
		await child.notice({ kind: "result", requestId: "result-1", body: "Done" });
		await child.notice({ kind: "error", requestId: "error-1", body: "Failed" });
		assert.deepEqual((await transport.receiveNotices("notices")).map((entry) => entry.kind), ["idle", "result", "error"]);
		await transport.ackNotice({ teamId: "notices", messageId: idle.id });
		const restored = createTeamTransport({ directory, lead });
		assert.deepEqual((await restored.receiveNotices("notices")).map((entry) => entry.kind), ["result", "error"]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("restored member epoch does not replay unacknowledged messages from a previous process", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-epoch-"));
	try {
		const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
		const alice = { memberId: "alice", sessionId: "alice-session", token: "alice-secret" };
		const bob = { memberId: "bob", sessionId: "bob-session", token: "bob-secret" };
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("epochs");
		await transport.addMember({ teamId: "epochs", member: alice });
		await transport.addMember({ teamId: "epochs", member: bob });
		const sender = createMemberMailbox({ directory, teamId: "epochs", member: alice, leadSessionId: lead.sessionId });
		await sender.send({ to: "bob", requestId: "old", body: "Old" });
		const replacement = { memberId: "bob", sessionId: "bob-restarted", token: "new-secret", epoch: 2 };
		await transport.restoreMember({ teamId: "epochs", member: replacement });
		const restored = createMemberMailbox({
			directory, teamId: "epochs", member: replacement, leadSessionId: lead.sessionId,
		});
		assert.deepEqual(await restored.receive(), []);
		await assert.rejects(() => createMemberMailbox({
			directory, teamId: "epochs", member: bob, leadSessionId: lead.sessionId,
		}).receive(), /credential|epoch|denied/i);
		const fresh = await sender.send({ to: "bob", requestId: "new", body: "New" });
		assert.deepEqual((await restored.receive()).map((message) => message.id), [fresh.id]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("member names are unique and the lead can send durable messages to the current epoch", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-lead-send-"));
	try {
		const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
		const alice = { memberId: "alice-id", name: "Researcher", sessionId: "alice-session", token: "alice-secret" };
		const bob = { memberId: "bob-id", name: "Researcher", sessionId: "bob-session", token: "bob-secret" };
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("lead-send");
		await transport.addMember({ teamId: "lead-send", member: alice });
		await assert.rejects(
			() => transport.addMember({ teamId: "lead-send", member: bob }),
			/name|already exists/i,
		);
		const recipient = createMemberMailbox({
			directory, teamId: "lead-send", member: alice, leadSessionId: lead.sessionId,
		});
		const first = await transport.sendFromLead({
			teamId: "lead-send", to: alice.memberId, requestId: "lead-1", body: "Start review",
		});
		const duplicate = await transport.sendFromLead({
			teamId: "lead-send", to: alice.memberId, requestId: "lead-1", body: "Start review",
		});
		assert.equal(first.id, duplicate.id);
		assert.deepEqual((await recipient.receive()).map(({ id, from }) => ({ id, from })),
			[{ id: first.id, from: "lead" }]);
		await recipient.ack(first.id);
		const replacement = {
			...alice, sessionId: "alice-restarted", token: "new-secret", epoch: 2,
		};
		await transport.restoreMember({ teamId: "lead-send", member: replacement });
		assert.deepEqual(await createMemberMailbox({
			directory, teamId: "lead-send", member: replacement, leadSessionId: lead.sessionId,
		}).receive(), []);
		const next = await transport.sendFromLead({
			teamId: "lead-send", to: alice.memberId, requestId: "lead-2", body: "Continue review",
		});
		assert.equal(next.recipientEpoch, 2);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("a member can send a regular message to its own lead without the lead token", async () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-team-lead-inbox-"));
	try {
		const lead = { sessionId: "lead-session", epoch: "epoch-2", token: "lead-secret" };
		const member = { memberId: "alice", sessionId: "alice-session", token: "alice-secret" };
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("lead-inbox");
		await transport.addMember({ teamId: "lead-inbox", member });
		const sender = createMemberMailbox({
			directory, teamId: "lead-inbox", member, leadSessionId: lead.sessionId,
		});
		const sent = await sender.sendToLead({ requestId: "message-1", body: "Found a bug" });
		assert.equal(sent.to, "lead");
		assert.equal(sent.kind, "message");
		assert.deepEqual((await transport.receiveNotices("lead-inbox")).map((entry) => entry.id), [sent.id]);
		await transport.ackNotice({ teamId: "lead-inbox", messageId: sent.id });
		assert.deepEqual(await transport.receiveNotices("lead-inbox"), []);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
