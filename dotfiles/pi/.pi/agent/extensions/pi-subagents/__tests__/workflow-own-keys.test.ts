import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import registerWorkflowFixture, {
	coordinatorFixture, MODEL, savedRun, until, withParent,
} from "./helpers/workflow.ts";
import {
	WORKFLOW_PROVIDER_CAPABILITIES, WORKFLOW_PROVIDER_DISCOVER_CHANNEL,
	WORKFLOW_PROVIDER_REQUEST_CHANNEL, WORKFLOW_PROVIDER_DELIVERY_CHANNEL,
} from "../adapters/workflow-contract.ts";
import { loadWorkflowDefinitionFromPackage } from "../workflow/schema.ts";
import { createWorkflowRunState, getActiveWorkflowRun, startWorkflowRun } from "../workflow/state.ts";

test("registered workflow tools spawn, resume, and recover a constructor role with empty assignment maps in parent mode", async () => {
	await withParent(async (root) => {
		savedRun(root);
		const packagePath = join(root, "agent", "workflows", "docs-review");
		const manifestPath = join(packagePath, "workflow.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		manifest.roles[0].id = "constructor";
		writeFileSync(manifestPath, JSON.stringify(manifest));
		const loaded = loadWorkflowDefinitionFromPackage(packagePath);
		assert.equal(loaded.status, "ok");
		const snapshot = getActiveWorkflowRun(startWorkflowRun(createWorkflowRunState(), {
			runId: "run-constructor", source: "global", definition: loaded.definition,
			projectRoot: root, policy: "parent-per-role", assignmentSource: "parent",
			originalAssignments: {}, currentAssignments: {},
		}).state)!;
		const f = coordinatorFixture(root);
		const requests: any[] = [];
		const selection = { provider: MODEL.provider, model: MODEL.id, thinking: "off" };
		const detach = [
			f.events.on(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, (request: any) => {
				f.events.emit(`${WORKFLOW_PROVIDER_DISCOVER_CHANNEL}:reply:${request.requestId}`, {
					requestId: request.requestId, providerId: "pi-agent-teams", instanceId: "one",
					version: 1, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
				});
			}),
			f.events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (request: any) => {
				requests.push(request);
				const payload = request.payload;
				const agentId = payload.agentId ?? payload.expected?.agentId ?? "scribe";
				const data = request.operation === "ping" ? { alive: true }
					: request.operation === "profiles" ? { profiles: payload.requiredAgents.map((agentId: string) => ({
						agentId, path: `/profiles/${agentId}.md`, hash: "hash",
					})) }
					: request.operation === "stop" ? { stopped: true }
					: {
						accepted: true, sessionPath: payload.sessionPath ?? join(root, "role.jsonl"),
						profile: { agentId, path: `/profiles/${agentId}.md`, hash: "hash" },
						model: payload.model ?? selection, context: { tokens: 0, source: "test" }, metadataConfirmed: true,
					};
				f.events.emit(`pi-workflows:provider:reply:${request.requestId}`, { ...request, ok: true, data });
			}),
		];
		f.restore(snapshot);
		registerWorkflowFixture(f.pi as any);
		try {
			await f.emit("session_start");
			await f.emit("before_agent_start");
			const result = await f.tool("workflow_spawn", {
				runId: snapshot.runId, role: "constructor", task: "Write the draft.",
			});
			assert.notEqual(result.isError, true, JSON.stringify(result));
			assert.equal(result.details.status, "started");
			const request = requests.find((request) => request.operation === "launch");
			assert.ok(request);
			assert.equal(Object.hasOwn(request.payload.workflow, "originalDefault"), false);
			assert.equal(request.payload.workflow.assignmentSource, "parent");
			assert.deepEqual(request.payload.workflow.currentDefault, selection);
			const finish = async (started: any) => {
				f.events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
					...started, kind: "result", result: {
						sessionPath: join(root, "role.jsonl"), status: "completed", message: "done",
						stopRequired: false, successfulResponse: true,
					},
				});
				await until(() => f.entries.at(-1)?.data.activeLaunch?.status === "completed");
			};
			await finish(request);
			for (const operation of ["resume", "recover"]) {
				const resumed = await f.tool(`workflow_${operation}`, {
					runId: snapshot.runId, role: "constructor", failure: "Quota exhausted.",
				});
				assert.notEqual(resumed.isError, true, JSON.stringify(resumed));
				assert.equal(resumed.details.status, "started");
				const started = requests.find((request) => request.operation === operation);
				assert.ok(started);
				assert.equal(started.payload.sessionPath, join(root, "role.jsonl"));
				assert.equal(Object.hasOwn(started.payload.workflow, "originalDefault"), false);
				assert.deepEqual(started.payload.workflow.currentDefault, selection);
				assert.equal(started.payload.workflow.assignmentSource, operation === "recover" ? "recovery" : "parent");
				await finish(started);
			}
		} finally {
			await f.emit("session_shutdown");
			detach.forEach((off) => off());
		}
	});
});
