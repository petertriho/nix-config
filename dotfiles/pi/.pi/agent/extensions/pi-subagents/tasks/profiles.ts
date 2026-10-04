import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type TaskAgentSource = "project" | "global" | "bundled";

export interface TaskAgentProfileDirs {
	project: string;
	global: string;
	bundled: string;
}

export interface TaskAgentProfile {
	fileName: string;
	source: TaskAgentSource;
	path: string;
	name: string;
	model?: string;
	tools?: string;
	autoExit?: boolean;
	interactive?: boolean;
	cli?: string;
}

export type TaskAgentResolution =
	| { ok: true; profile: TaskAgentProfile }
	| { ok: false; error: string };

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
	const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
	return match ? match[1].trim() : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
	return value == null ? undefined : value === "true";
}

/** Task frontmatter accepts empty values, unlike ordinary agent profiles. */
export function parseTaskAgentProfile(
	content: string,
	fileName: string,
	source: TaskAgentSource,
	path: string,
): TaskAgentProfile | null {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const frontmatter = match[1];
	return {
		fileName,
		source,
		path,
		name: getFrontmatterValue(frontmatter, "name") ?? fileName,
		model: getFrontmatterValue(frontmatter, "model"),
		tools: getFrontmatterValue(frontmatter, "tools"),
		autoExit: parseOptionalBoolean(getFrontmatterValue(frontmatter, "auto-exit")),
		interactive: parseOptionalBoolean(getFrontmatterValue(frontmatter, "interactive")),
		cli: getFrontmatterValue(frontmatter, "cli"),
	};
}

function listProfileDirs(dirs: TaskAgentProfileDirs): Array<{ dir: string; source: TaskAgentSource }> {
	return [
		{ dir: dirs.project, source: "project" },
		{ dir: dirs.global, source: "global" },
		{ dir: dirs.bundled, source: "bundled" },
	];
}

function readProfile(dir: string, fileName: string, source: TaskAgentSource): TaskAgentProfile | null {
	const path = join(dir, `${fileName}.md`);
	if (!existsSync(path)) return null;
	return parseTaskAgentProfile(readFileSync(path, "utf8"), fileName, source, path);
}

function listAvailableTaskAgents(dirs: TaskAgentProfileDirs): TaskAgentProfile[] {
	const seen = new Set<string>();
	const profiles: TaskAgentProfile[] = [];
	for (const { dir, source } of listProfileDirs(dirs)) {
		if (!existsSync(dir)) continue;
		for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
			const fileName = file.replace(/\.md$/, "");
			if (seen.has(fileName.toLowerCase())) continue;
			const profile = readProfile(dir, fileName, source);
			if (profile) {
				seen.add(fileName.toLowerCase());
				profiles.push(profile);
			}
		}
	}
	return profiles;
}

/**
 * Resolve a requested agent type against the effective project, global, and
 * bundled profile directories (same precedence as ordinary tmux agents):
 *
 * 1. An exact filename wins (project before global before bundled).
 * 2. Otherwise a single case-insensitive match is accepted.
 * 3. Multiple case-insensitive matches are rejected with the candidates.
 * 4. Unknown names are rejected with the available profile list — never a
 *    silent fallback to a generic agent.
 *
 * Profiles that are interactive, explicitly non-auto-exiting, or CLI-backed
 * are rejected: they cannot honor the autonomous task contract.
 */
export function resolveTaskAgentProfile(
	requested: string,
	dirs: TaskAgentProfileDirs,
): TaskAgentResolution {
	const name = requested.trim();
	if (!name) return { ok: false, error: "Task agent type is empty." };

	for (const { dir, source } of listProfileDirs(dirs)) {
		const exact = readProfile(dir, name, source);
		if (exact) return checkTaskProfileSafety(exact, name);
	}

	const candidates: TaskAgentProfile[] = [];
	for (const { dir, source } of listProfileDirs(dirs)) {
		if (!existsSync(dir)) continue;
		for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
			const fileName = file.replace(/\.md$/, "");
			if (fileName.toLowerCase() !== name.toLowerCase()) continue;
			const profile = readProfile(dir, fileName, source);
			if (profile) candidates.push(profile);
		}
	}
	if (candidates.length === 1) return checkTaskProfileSafety(candidates[0], name);
	if (candidates.length > 1) {
		const list = candidates.map((c) => `${c.source}:${c.fileName}`).join(", ");
		return {
			ok: false,
			error: `Ambiguous task agent type "${name}" — matches ${list}. Pass an exact profile name.`,
		};
	}

	const available = listAvailableTaskAgents(dirs)
		.map((p) => p.fileName)
		.sort()
		.join(", ");
	return {
		ok: false,
		error:
			`Unknown task agent type "${name}". Available agent profiles: ${available}. ` +
			`Add a project, global, or bundled profile instead of falling back to a generic agent.`,
	};
}

function checkTaskProfileSafety(profile: TaskAgentProfile, requested: string): TaskAgentResolution {
	if (profile.cli) {
		return {
			ok: false,
			error:
				`Task agent "${requested}" uses the ${profile.cli} CLI, which cannot honor the ` +
				`autonomous task lifecycle. Use a pi-backed autonomous profile.`,
		};
	}
	if (profile.interactive === true) {
		return {
			ok: false,
			error:
				`Task agent "${requested}" is interactive (interactive: true) and needs a user ` +
				`driving its pane. TaskExecute workers must run autonomously. ` +
				`Set interactive: false (or remove the flag) to make it usable for tasks.`,
		};
	}
	if (profile.autoExit === false) {
		return {
			ok: false,
			error:
				`Task agent "${requested}" opts out of auto-exit (auto-exit: false), so it would ` +
				`never report completion. Set auto-exit: true to make it usable for tasks.`,
		};
	}
	return { ok: true, profile };
}
