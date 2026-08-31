import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fingerprintStrings,
	hashText,
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
			phase: "executor",
			policy: "per-role",
			assignmentSource: "configured",
			projectRoot: "/tmp/project",
			originalDefault: { provider: "anthropic", model: "claude", thinking: "high" },
			currentDefault: { provider: "anthropic", model: "claude", thinking: "high" },
			artifacts: {
				plan: "/tmp/project/.artifacts/demo/PLAN.md",
				tasks: "/tmp/project/.artifacts/demo/TASKS.md",
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

		const withSecret = { ...sampleProfile(sessionPath), authToken: "secret" };
		assert.equal(validateLaunchProfile(withSecret), false);
		assert.throws(
			() => writeLaunchProfile(sessionPath, withSecret as LaunchProfile),
			/Refusing to serialize/,
		);
	});
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
