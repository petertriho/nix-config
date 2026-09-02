import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	LAUNCH_PROFILE_WORKFLOW_VERSION,
	fingerprintStrings,
	hashText,
	normalizeLaunchProfileWorkflowMetadata,
	profilePathForSession,
	readLaunchProfile,
	removeLaunchProfile,
	type LaunchProfile,
	updateProfileAfterSuccessfulResponse,
	validateLaunchProfile,
	writeLaunchProfile,
} from "./launch-profile.ts";

function withTempDir(run: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-subagent-profile-"));
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function sampleProfile(sessionPath: string): LaunchProfile {
	return {
		version: 1,
		stable: {
			agentName: "worker",
			displayName: "Worker",
			roleBody: "Do the assigned slice.",
			roleBodyHash: hashText("Do the assigned slice."),
			systemPromptMode: "append",
			cwd: "/tmp/project",
			agentDir: "/tmp/agent",
			controls: {
				spawning: false,
				denyTools: ["subagent"],
				autoExit: true,
				interactive: false,
				sessionMode: "standalone",
			},
			primarySkill: {
				name: "implement",
				path: "/tmp/implement/SKILL.md",
				hash: hashText("implement skill"),
			},
			originalSessionPath: sessionPath,
			createdAt: "2026-08-27T12:00:00.000Z",
		},
		runtime: {
			originalModel: { provider: "anthropic", model: "claude", thinking: "high" },
			lastModel: { provider: "anthropic", model: "claude", thinking: "high" },
			resumeCount: 0,
		},
		resources: {
			tools: fingerprintStrings(["read", "bash"]),
			visibleSkills: fingerprintStrings(["implement", "planner"]),
			updatedAt: "2026-08-27T12:00:00.000Z",
		},
		workflow: {
			version: LAUNCH_PROFILE_WORKFLOW_VERSION,
			workflowId: "author-flow",
			runId: "workflow-run-123",
			roleId: "author",
			manifestHash: hashText("author-flow manifest"),
			skillHash: hashText("author-flow skill"),
			policy: "parent-per-role",
			assignmentSource: "configured",
			projectRoot: "/tmp/project",
			originalDefault: { provider: "anthropic", model: "claude", thinking: "high" },
			currentDefault: { provider: "anthropic", model: "claude", thinking: "high" },
			data: {
				draft: "/tmp/project/.artifacts/demo/DRAFT.md",
				baseRef: "abc123",
			},
		},
	};
}

test("launch profile round trips through a strict versioned sidecar", () => {
	withTempDir((dir) => {
		const sessionPath = join(dir, "session.jsonl");
		const profile = sampleProfile(sessionPath);
		const path = writeLaunchProfile(sessionPath, profile);
		assert.equal(path, profilePathForSession(sessionPath));
		assert.deepEqual(readLaunchProfile(sessionPath), { status: "ok", profile });
	});
});

test("launch profile rejects malformed data, unsupported versions, and secret fields", () => {
	withTempDir((dir) => {
		const sessionPath = join(dir, "session.jsonl");
		writeFileSync(profilePathForSession(sessionPath), "{broken");
		assert.equal(readLaunchProfile(sessionPath).status, "invalid");

		writeFileSync(profilePathForSession(sessionPath), JSON.stringify({ version: 99 }));
		const unsupported = readLaunchProfile(sessionPath);
		assert.equal(unsupported.status, "invalid");
		assert.match(unsupported.status === "invalid" ? unsupported.error : "", /Unsupported/);

		writeFileSync(profilePathForSession(sessionPath), JSON.stringify({
			...sampleProfile(sessionPath),
			workflow: {
				phase: "executor",
				policy: "per-role",
				assignmentSource: "configured",
				artifacts: { plan: "/tmp/project/.artifacts/demo/PLAN.md" },
			},
		}));
		const legacyWorkflow = readLaunchProfile(sessionPath);
		assert.equal(legacyWorkflow.status, "invalid");
		assert.match(
			legacyWorkflow.status === "invalid" ? legacyWorkflow.error : "",
			/retired \/pter phase\/artifact shape/i,
		);

		const withSecret = { ...sampleProfile(sessionPath), authToken: "secret" };
		assert.equal(validateLaunchProfile(withSecret), false);
		assert.throws(
			() => writeLaunchProfile(sessionPath, withSecret as LaunchProfile),
			/Refusing to serialize/,
		);
	});
});

test("launch profile remains valid without workflow metadata", () => {
	const profile = sampleProfile("/tmp/session.jsonl");
	delete profile.workflow;
	assert.equal(validateLaunchProfile(profile), true);
});

test("workflow metadata requires a non-empty project root", () => {
	withTempDir((dir) => {
		const sessionPath = join(dir, "missing-project-root.jsonl");
		const missing = sampleProfile(sessionPath);
		delete (missing.workflow as Partial<NonNullable<LaunchProfile["workflow"]>>).projectRoot;
		assert.equal(validateLaunchProfile(missing), false);
		writeFileSync(profilePathForSession(sessionPath), JSON.stringify(missing));
		const stored = readLaunchProfile(sessionPath);
		assert.equal(stored.status, "invalid");
		assert.match(
			stored.status === "invalid" ? stored.error : "",
			/projectRoot/,
		);
	});

	const empty = sampleProfile("/tmp/empty-project-root.jsonl");
	empty.workflow!.projectRoot = "   ";
	assert.equal(validateLaunchProfile(empty), false);
	assert.throws(
		() => normalizeLaunchProfileWorkflowMetadata(empty.workflow!),
		/non-empty projectRoot/,
	);

	const padded = sampleProfile("/tmp/padded-project-root.jsonl");
	padded.workflow!.projectRoot = "  /tmp/project  ";
	assert.equal(
		normalizeLaunchProfileWorkflowMetadata(padded.workflow!).projectRoot,
		"/tmp/project",
	);
});

test("launch profile writes atomically with restrictive permissions", () => {
	withTempDir((dir) => {
		const sessionPath = join(dir, "session.jsonl");
		const first = sampleProfile(sessionPath);
		writeLaunchProfile(sessionPath, first);

		const second = structuredClone(first);
		second.runtime.resumeCount = 2;
		writeLaunchProfile(sessionPath, second);

		const stored = JSON.parse(readFileSync(profilePathForSession(sessionPath), "utf8"));
		assert.equal(stored.runtime.resumeCount, 2);
		assert.equal(statSync(profilePathForSession(sessionPath)).mode & 0o777, 0o600);
		assert.deepEqual(
			readdirSync(dir).filter((name) => name.includes(".tmp-")),
			[],
		);
	});
});

test("launch profile removal cleans an incomplete launch sidecar", () => {
	withTempDir((dir) => {
		const sessionPath = join(dir, "session.jsonl");
		writeLaunchProfile(sessionPath, sampleProfile(sessionPath));
		removeLaunchProfile(sessionPath);
		assert.deepEqual(readLaunchProfile(sessionPath), { status: "missing" });
	});
});

test("successful updates preserve originalModel when lastModel changes", () => {
	const sessionPath = "/tmp/session.jsonl";
	const profile = sampleProfile(sessionPath);
	const updated = updateProfileAfterSuccessfulResponse(profile, {
		selection: { provider: "openai", model: "gpt-5.4", thinking: "medium" },
		resources: {
			tools: fingerprintStrings(["read", "bash", "edit"]),
			visibleSkills: fingerprintStrings(["implement"]),
			updatedAt: "2026-08-27T13:00:00.000Z",
		},
	});

	assert.deepEqual(updated.runtime.originalModel, {
		provider: "anthropic",
		model: "claude",
		thinking: "high",
	});
	assert.deepEqual(updated.runtime.lastModel, {
		provider: "openai",
		model: "gpt-5.4",
		thinking: "medium",
	});
	assert.equal(updated.runtime.resumeCount, 1);
	assert.deepEqual(updated.workflow?.currentDefault, updated.runtime.lastModel);
	assert.deepEqual(profile.runtime.lastModel, profile.runtime.originalModel);
});
