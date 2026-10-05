import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemberMailbox, createTeamTransport } from "../teams/transport.ts";

async function fixture(run: (f: {
	transport: ReturnType<typeof createTeamTransport>;
	child: ReturnType<typeof createMemberMailbox>;
	directory: string;
	alice: { memberId: string; name: string; sessionId: string; token: string; epoch: number };
}) => Promise<void>): Promise<void> {
	const directory = mkdtempSync(join(tmpdir(), "pi-mailbox-enqueue-"));
	const lead = { sessionId: "lead", epoch: "lead-epoch", token: "lead-secret" };
	const alice = { memberId: "alice", name: "Alice", sessionId: "alice-session", token: "alice-secret", epoch: 2 };
	try {
		const transport = createTeamTransport({ directory, lead });
		await transport.createTeam("main");
		await transport.addMember({ teamId: "main", member: alice });
		await transport.addMember({ teamId: "main", member: {
			memberId: "bob", name: "Bob", sessionId: "bob-session", token: "bob-secret", epoch: 3,
		} });
		const child = createMemberMailbox({ directory, teamId: "main", member: alice, leadSessionId: lead.sessionId });
		await run({ transport, child, directory, alice });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const routes = ["lead-member", "lead-response", "member-name", "member-lead", "notice", "member-id"] as const;
for (const route of routes) {
	test(`${route} preserves durable enqueue identity, shape, limits, and duplicate errors`, async () => {
		await fixture(async ({ transport, child, directory, alice }) => {
			const toLead = route === "member-lead" || route === "notice";
			const fromLead = route === "lead-response";
			const to = toLead ? "lead" : "bob";
			const path = join(directory, "main", "mailboxes", `${to}.json`);
			const send = (requestId: string, body: string) => {
				switch (route) {
					case "lead-member": return transport.send({ teamId: "main", from: alice, to, requestId, body });
					case "lead-response": return transport.sendFromLead({
						teamId: "main", to, requestId, body, kind: "approval_response",
					});
					case "member-name": return child.sendToMember({ recipient: "Bob", requestId, body });
					case "member-lead": return child.sendToLead({ requestId, body });
					case "notice": return child.notice({ kind: "result", requestId, body });
					case "member-id": return child.send({ to, requestId, body });
				}
			};
			const first = await send("same", "First");
			assert.match(first.id, /^[0-9a-f-]{36}$/);
			assert.deepEqual(first, {
				id: first.id, from: fromLead ? "lead" : "alice", to,
				requestId: "same", body: "First", sequence: 1, attempts: 0,
				...(route === "lead-response" ? { kind: "approval_response" } :
					route === "notice" ? { kind: "result" } :
						route === "member-name" || route === "member-lead" ? { kind: "message" } : {}),
				...(!toLead ? { recipientEpoch: 3 } : {}),
			});
			const key = `${fromLead ? "lead:lead-epoch" : "alice:2"}:same`;
			assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
				version: 1, nextSequence: 2, messages: [first], acked: [],
				seen: { [key]: { id: first.id, body: "First", to } },
			});
			const bytes = readFileSync(path, "utf8");
			assert.deepEqual(await send("same", "First"), first);
			assert.equal(readFileSync(path, "utf8"), bytes);
			await assert.rejects(() => send("same", "Changed"), {
				message: route === "notice" ? "Conflicting duplicate notice" : "Conflicting duplicate request",
			});
			assert.equal(readFileSync(path, "utf8"), bytes);
			const invalidMessage = route === "notice" ? "Invalid team notice" : "Invalid team message or request ID";
			for (const [requestId, body] of [["", "body"], ["empty", ""], ["large", "é".repeat(32_769)]]) {
				await assert.rejects(() => send(requestId, body), { message: invalidMessage });
				assert.equal(readFileSync(path, "utf8"), bytes);
			}
			const second = await send("boundary", "é".repeat(32_768));
			assert.equal(second.sequence, 2);
			assert.notEqual(second.id, first.id);
			const restored = JSON.parse(readFileSync(path, "utf8"));
			assert.equal(restored.nextSequence, 3);
			restored.messages = [];
			writeFileSync(path, `${JSON.stringify(restored)}\n`);
			await assert.rejects(() => send("same", "First"), {
				message: route === "notice" ? "Conflicting duplicate notice kind" :
					fromLead || toLead ? "Conflicting duplicate message kind" : "Deduplication history is incomplete",
			});
		});
	});
}

test("mailbox routes retain their distinct duplicate-kind policies", async () => {
	await fixture(async ({ transport, child, alice }) => {
		const absentKind = await transport.send({
			teamId: "main", from: alice, to: "bob", requestId: "absent", body: "Same",
		});
		assert.equal(Object.hasOwn(absentKind, "kind"), false);
		assert.deepEqual(await child.sendToMember({ recipient: "Bob", requestId: "absent", body: "Same" }), absentKind);
		const explicitKind = await child.sendToMember({ recipient: "Bob", requestId: "explicit", body: "Same" });
		assert.equal(explicitKind.kind, "message");
		assert.deepEqual(await child.send({ to: "bob", requestId: "explicit", body: "Same" }), explicitKind);

		const leadMessage = await transport.sendFromLead({
			teamId: "main", to: "bob", requestId: "lead-kind", body: "Same",
		});
		assert.equal(leadMessage.kind, "message");
		await assert.rejects(() => transport.sendFromLead({
			teamId: "main", to: "bob", requestId: "lead-kind", body: "Same", kind: "approval_response",
		}), { message: "Conflicting duplicate message kind" });
		await child.sendToLead({ requestId: "regular", body: "Same" });
		await assert.rejects(() => child.notice({ requestId: "regular", body: "Same", kind: "result" }),
			{ message: "Conflicting duplicate notice kind" });
		await child.notice({ requestId: "result", body: "Same", kind: "result" });
		await assert.rejects(() => child.sendToLead({ requestId: "result", body: "Same" }),
			{ message: "Conflicting duplicate message kind" });
		await assert.rejects(() => child.notice({ requestId: "result", body: "Same", kind: "error" }),
			{ message: "Conflicting duplicate notice kind" });
	});
});
