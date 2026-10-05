import { THINKING_LEVELS, type ModelSelection } from "./launch-profile.ts";
import { shellEscape } from "../adapters/tmux.ts";

const SUBAGENT_CONTROL_TOOLS = ["caller_ping", "subagent_done"] as const;

export function buildSubagentToolAllowlist(effectiveTools?: string): string | null {
	const requested = (effectiveTools ?? "")
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);

	if (requested.length === 0) return null;

	const allow = new Set(requested);
	for (const tool of SUBAGENT_CONTROL_TOOLS) {
		allow.add(tool);
	}

	return [...allow].join(",");
}

export function parseSkillList(skills: string | undefined): string[] {
	return (skills ?? "")
		.split(",")
		.map((skill) => skill.trim())
		.filter(Boolean);
}

export function buildPiPromptArgs(params: {
	effectiveSkills?: string;
	taskDelivery: "direct" | "artifact";
	taskArg: string;
	taskText: string;
}): string[] {
	const skills = parseSkillList(params.effectiveSkills);
	if (skills.length === 0) return [params.taskArg];

	const [first, ...rest] = skills;
	const extraSkillsNote =
		rest.length > 0
			? `Also read and follow these skills from your available skills list before you start: ${rest.join(", ")}.\n\n`
			: "";
	return [`/skill:${first} ${extraSkillsNote}${params.taskText}`];
}

export function parseLegacyModelSelection(argument: string | undefined): ModelSelection | undefined {
	if (!argument) return undefined;
	let reference = argument;
	let thinking: ModelSelection["thinking"];
	const colon = reference.lastIndexOf(":");
	if (colon > 0 && THINKING_LEVELS.includes(reference.slice(colon + 1) as never)) {
		thinking = reference.slice(colon + 1) as ModelSelection["thinking"];
		reference = reference.slice(0, colon);
	}
	const slash = reference.indexOf("/");
	if (slash <= 0 || slash === reference.length - 1) return undefined;
	const selection: ModelSelection = {
		provider: reference.slice(0, slash),
		model: reference.slice(slash + 1),
	};
	if (thinking) selection.thinking = thinking;
	return selection;
}

export function resolveResumeLaunchBehavior(
	params: { autoExit?: boolean },
): { autoExit: boolean; interactive: boolean } {
	const autoExit = params.autoExit ?? true;
	return { autoExit, interactive: !autoExit };
}

export function buildResumePiArgs(sessionPath: string, modelArgument?: string): string[] {
	return [
		"pi",
		"--session",
		shellEscape(sessionPath),
		...(modelArgument ? ["--model", shellEscape(modelArgument)] : []),
	];
}
