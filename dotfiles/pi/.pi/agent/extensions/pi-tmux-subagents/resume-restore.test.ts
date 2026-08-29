import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprintStrings, readLaunchProfile, writeLaunchProfile } from "./launch-profile.ts";
import {
	diffResourceFingerprints,
	primarySkillChanged,
	resolveResumeRestoration,
	resourceChangeNotice,
} from "./resume-restore.ts";
import { __test__ as testApi } from "./index.ts";

function resources(names: string[] = []) {
	return {
		tools: fingerprintStrings(names),
		visibleSkills: fingerprintStrings([]),
		updatedAt: "2026-08-27T12:00:00.000Z",
	};
}

function sidecarProfile(root: string) {
	const profile = testApi.buildLaunchProfile({
		displayName: "Role",
		agentName: "planner",
		roleBody: "Stored role body",
		systemPromptMode: "append",
		cwd: join(root, "project"),
		agentDir: join(root, "agent"),
		controls: {
			spawning: false,
			denyTools: ["bash", "write"],
			autoExit: false,
			interactive: true,
			sessionMode: "standalone",
		},
		effectiveSkills: "planner",
		modelArgument: "anthropic/claude:off",
		originalSessionPath: join(root, "session.jsonl"),
		resources: resources(),
	});
	delete profile.stable.primarySkill;
	return profile;
}

test("resume restoration restores the sidecar role contract and controls", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-resume-restore-"));
	try {
		const sessionPath = join(root, "session.jsonl");
		writeLaunchProfile(sessionPath, sidecarProfile(root) as any);
		const read = readLaunchProfile(sessionPath);
		assert.equal(read.status, "ok");
		if (read.status !== "ok") return;

		const restored = resolveResumeRestoration(read.profile, {});
		assert.equal(restored.source, "sidecar");
		assert.equal(restored.cwd, join(root, "project"));
		assert.equal(restored.agentDir, join(root, "agent"));
		assert.equal(restored.agentName, "planner");
		assert.equal(restored.roleBody, "Stored role body");
		assert.equal(restored.systemPromptMode, "append");
		assert.deepEqual(restored.denyTools, ["bash", "write"]);
		assert.equal(restored.autoExit, false);
		assert.equal(restored.interactive, true);

		const explicit = resolveResumeRestoration(read.profile, { autoExit: true });
		assert.equal(explicit.autoExit, true);
		assert.equal(explicit.interactive, false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("legacy resume restoration reports one reduced-fidelity warning", () => {
	const restored = resolveResumeRestoration(null, {});
	assert.equal(restored.source, "legacy");
	assert.deepEqual(restored.denyTools, []);
	assert.equal(restored.autoExit, true);
	assert.equal(restored.interactive, false);
	assert.match(restored.legacyWarning ?? "", /reduced fidelity/);
	assert.equal(resolveResumeRestoration(null, { autoExit: false }).interactive, true);
});

test("resource fingerprint differences are reported without blocking a resume", () => {
	const before = resources(["read", "bash"]);
	const after = resources(["read", "edit", "write"]);
	const changes = diffResourceFingerprints(before, after);
	assert.equal(changes.length, 1);
	assert.equal(changes[0].field, "tools");
	assert.equal(changes[0].beforeCount, 2);
	assert.equal(changes[0].afterCount, 3);
	assert.match(resourceChangeNotice(changes)!, /tools changed \(2 -> 3\)/);
	assert.equal(resourceChangeNotice([]), undefined);
});

test("a changed or missing primary skill is detected, while new skills are not", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-resume-skill-"));
	try {
		const sessionPath = join(root, "session.jsonl");
		writeLaunchProfile(sessionPath, sidecarProfile(root) as any);
		const read = readLaunchProfile(sessionPath);
		assert.equal(read.status, "ok");
		if (read.status !== "ok") return;

		assert.equal(primarySkillChanged(read.profile, undefined), false);
		const changed = read.profile;
		changed.stable.primarySkill = { name: "planner", path: "old", hash: "old-hash" };
		assert.equal(primarySkillChanged(changed, { name: "planner", hash: "new-hash" }), true);
		assert.equal(primarySkillChanged(changed, undefined), true);
		assert.equal(
			primarySkillChanged(changed, { name: "other", hash: "old-hash" }),
			true,
		);
		assert.equal(
			primarySkillChanged(changed, { name: "planner", hash: "old-hash" }),
			false,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
