import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	fingerprintStrings,
	hashText,
	normalizeLaunchProfileWorkflowMetadata,
	type LaunchProfile,
	type LaunchProfileResources,
	type PrimarySkillIdentity,
} from "../../workflow-provider/launch-profile.ts";
import { parseLegacyModelSelection, parseSkillList } from "./prompts.ts";
import type { LaunchProfileInput, SubagentServiceDependencies } from "./types.ts";

export function createProfileResourceServices(
	deps: Pick<SubagentServiceDependencies, "getAgentConfigDir">,
) {
	function findPrimarySkillPath(
		skillName: string,
		cwd?: string,
		agentDir?: string,
	): string | undefined {
		const candidates = [
			...(cwd
				? [
					join(cwd, ".pi", "skills", skillName, "SKILL.md"),
					join(cwd, ".agents", "skills", skillName, "SKILL.md"),
				]
				: []),
			join(process.cwd(), ".pi", "skills", skillName, "SKILL.md"),
			join(process.cwd(), ".agents", "skills", skillName, "SKILL.md"),
			...(agentDir ? [join(agentDir, "skills", skillName, "SKILL.md")] : []),
			join(deps.getAgentConfigDir(), "skills", skillName, "SKILL.md"),
			join(homedir(), ".agents", "skills", skillName, "SKILL.md"),
		];
		return candidates.find((path) => existsSync(path));
	}

	function resolvePrimarySkill(
		effectiveSkills: string | undefined,
		cwd?: string,
		agentDir?: string,
	): PrimarySkillIdentity | undefined {
		const primary = parseSkillList(effectiveSkills)[0];
		if (!primary) return undefined;
		const path = findPrimarySkillPath(primary, cwd, agentDir);
		if (!path) return undefined;
		try {
			return { name: primary, path, hash: hashText(readFileSync(path, "utf8")) };
		} catch {
			return undefined;
		}
	}

	function collectResourceFingerprints(
		pi: ExtensionAPI | undefined,
		effectiveSkills: string | undefined,
	): LaunchProfileResources {
		const tools = pi?.getActiveTools?.() ?? [];
		const namedSkills = parseSkillList(effectiveSkills);
		const commandSkills =
			pi?.getCommands?.().filter((command) => command.source === "skill").map((command) => command.name) ?? [];
		const visibleSkills = [...new Set([...namedSkills, ...commandSkills])];
		return {
			tools: fingerprintStrings(tools),
			visibleSkills: fingerprintStrings(visibleSkills),
			updatedAt: new Date().toISOString(),
		};
	}

	function buildLaunchProfile(input: LaunchProfileInput): LaunchProfile {
		const model = parseLegacyModelSelection(input.modelArgument);
		const primarySkill = resolvePrimarySkill(input.effectiveSkills, input.cwd, input.agentDir);
		const createdAt = new Date().toISOString();
		const workflow = input.workflow
			? normalizeLaunchProfileWorkflowMetadata(input.workflow)
			: undefined;
		return {
			version: 1,
			stable: {
				...(input.agentName ? { agentName: input.agentName } : {}),
				displayName: input.displayName,
				roleBody: input.roleBody,
				roleBodyHash: hashText(input.roleBody),
				systemPromptMode: input.systemPromptMode,
				cwd: input.cwd,
				agentDir: input.agentDir,
				controls: input.controls,
				...(primarySkill ? { primarySkill } : {}),
				originalSessionPath: input.originalSessionPath,
				createdAt,
			},
			runtime: {
				...(model ? { originalModel: model, lastModel: model } : {}),
				resumeCount: 0,
			},
			resources: input.resources,
			...(workflow ? { workflow } : {}),
		};
	}

	return { resolvePrimarySkill, collectResourceFingerprints, buildLaunchProfile };
}
