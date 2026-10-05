import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { shellEscape } from "../adapters/tmux.ts";
import { buildPiCommand } from "../execution/pi-command.ts";

function withTempDir(run: (root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pi-command-"));
	try {
		run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("Pi command assembly preserves quoted arguments, child controls and completion status", () => {
	withTempDir((root) => {
		const cwd = join(root, "work ' directory");
		const agentDir = join(root, "agent directory");
		mkdirSync(cwd);
		mkdirSync(agentDir);
		const output = join(root, "observed.json");
		const completionFile = join(root, "child.status");
		const observe = [
			"require('fs').writeFileSync(process.argv[1], JSON.stringify({",
			"cwd: process.cwd(), args: process.argv.slice(2),",
			"env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('PI_')))",
			"})); process.exit(7)",
		].join("");
		const command = buildPiCommand({
			args: ["node", "-e", shellEscape(observe), shellEscape(output), shellEscape("one ' argument")],
			cwd,
			completionFile,
			environment: {
				agentDir,
				denyTools: ["Agent", "TaskCreate"],
				name: "Researcher's child",
				agentName: "research",
				sessionFile: join(root, "session ' file.jsonl"),
				id: "child-id",
				activityFile: join(root, "activity.json"),
				autoExit: true,
			},
			environmentPrefix: [`PI_TEAM_MEMBER_TOKEN=${shellEscape("secret ' token")}`],
			environmentSuffix: ["PI_SUBAGENT_MAX_TURNS=3", `PI_SUBAGENT_SURFACE=${shellEscape("%9")}`],
		});
		execFileSync("sh", ["-c", command], { env: { PATH: process.env.PATH } });
		const observed = JSON.parse(readFileSync(output, "utf8"));
		assert.equal(observed.cwd, cwd);
		assert.deepEqual(observed.args, ["one ' argument"]);
		assert.deepEqual(observed.env, {
			PI_TEAM_MEMBER_TOKEN: "secret ' token",
			PI_CODING_AGENT_DIR: agentDir,
			PI_DENY_TOOLS: "Agent,TaskCreate",
			PI_SUBAGENT_NAME: "Researcher's child",
			PI_SUBAGENT_AGENT: "research",
			PI_SUBAGENT_SESSION: join(root, "session ' file.jsonl"),
			PI_SUBAGENT_ID: "child-id",
			PI_SUBAGENT_ACTIVITY_FILE: join(root, "activity.json"),
			PI_SUBAGENT_AUTO_EXIT: "1",
			PI_SUBAGENT_MAX_TURNS: "3",
			PI_SUBAGENT_SURFACE: "%9",
		});
		assert.equal(readFileSync(completionFile, "utf8"), "7\n");
	});
});

test("Pi command assembly writes role and task artifacts without changing prompt policy", () => {
	withTempDir((root) => {
		const rolePath = join(root, "context", "role.md");
		const taskPath = join(root, "context", "task.md");
		const input = {
			args: ["pi", { flag: "--append-system-prompt" as const, path: rolePath, text: "Saved role body" }],
			cwd: root,
			completionFile: join(root, "child.status"),
			environment: {
				denyTools: [],
				name: "child",
				sessionFile: join(root, "child.jsonl"),
				id: "child-id",
				activityFile: join(root, "activity.json"),
			},
		};
		const artifactCommand = buildPiCommand({
			...input,
			prompt: { taskDelivery: "artifact", artifactPath: taskPath, text: "Continue saved work" },
		});
		assert.equal(readFileSync(rolePath, "utf8"), "Saved role body");
		assert.equal(readFileSync(taskPath, "utf8"), "Continue saved work");
		assert.ok(artifactCommand.includes(`--append-system-prompt ${shellEscape(rolePath)}`));
		assert.ok(artifactCommand.includes(shellEscape(`@${taskPath}`)));
		assert.ok(!artifactCommand.includes("PI_DENY_TOOLS="));
		assert.ok(!artifactCommand.includes("PI_SUBAGENT_AUTO_EXIT="));
		assert.ok(!artifactCommand.includes("PI_SUBAGENT_AGENT="));

		const skillCommand = buildPiCommand({
			...input,
			prompt: {
				taskDelivery: "artifact",
				artifactPath: taskPath,
				text: "Start scoped work",
				effectiveSkills: "research,review",
			},
		});
		assert.equal(readFileSync(taskPath, "utf8"), "Start scoped work");
		assert.ok(skillCommand.includes(shellEscape(
			"/skill:research Also read and follow these skills from your available skills list before you start: review.\n\nStart scoped work",
		)));
		assert.ok(!skillCommand.includes(shellEscape(`@${taskPath}`)));

		const directCommand = buildPiCommand({
			...input,
			prompt: { taskDelivery: "direct", text: "A direct ' task" },
		});
		assert.ok(directCommand.includes(shellEscape("A direct ' task")));
	});
});

test("Pi command assembly keeps the inherited agent directory when the selected directory is missing", () => {
	withTempDir((root) => {
		const before = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = join(root, "inherited agent");
		try {
			const command = buildPiCommand({
				args: ["pi"],
				cwd: root,
				completionFile: join(root, "child.status"),
				environment: {
					agentDir: join(root, "missing"),
					denyTools: [],
					name: "child",
					sessionFile: join(root, "child.jsonl"),
					id: "child-id",
					activityFile: join(root, "activity.json"),
				},
			});
			assert.ok(command.includes(`PI_CODING_AGENT_DIR=${shellEscape(process.env.PI_CODING_AGENT_DIR)}`));
			assert.equal(existsSync(join(root, "missing")), false);
		} finally {
			if (before === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = before;
		}
	});
});
