import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { shellEscape } from "../adapters/tmux.ts";
import { buildPiPromptArgs } from "./prompts.ts";

export type PiCommandArgument = string | {
	flag: "--system-prompt" | "--append-system-prompt";
	path: string;
	text: string;
};

type PiCommandPrompt = {
	text: string;
	effectiveSkills?: string;
} & (
	| { taskDelivery: "direct" }
	| { taskDelivery: "artifact"; artifactPath: string }
);

export interface PiCommandInput {
	// String arguments are already escaped by the launch or resume policy.
	args: readonly PiCommandArgument[];
	cwd: string;
	completionFile: string;
	environment: {
		agentDir?: string | null;
		denyTools: readonly string[];
		name: string;
		agentName?: string;
		sessionFile: string;
		id: string;
		activityFile: string;
		autoExit?: boolean;
	};
	environmentPrefix?: readonly string[];
	environmentSuffix?: readonly string[];
	prompt?: PiCommandPrompt;
}

function writeCommandArtifact(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text, "utf8");
}

export function buildPiCommand(input: PiCommandInput): string {
	const parts = input.args.flatMap((arg) => {
		if (typeof arg === "string") return [arg];
		writeCommandArtifact(arg.path, arg.text);
		return [arg.flag, shellEscape(arg.path)];
	});
	const prompt = input.prompt;
	if (prompt) {
		let taskArg = prompt.text;
		if (prompt.taskDelivery === "artifact") {
			writeCommandArtifact(prompt.artifactPath, prompt.text);
			taskArg = `@${prompt.artifactPath}`;
		}
		parts.push(...buildPiPromptArgs({
			effectiveSkills: prompt.effectiveSkills,
			taskDelivery: prompt.taskDelivery,
			taskArg,
			taskText: prompt.text,
		}).map(shellEscape));
	}

	const env = input.environment;
	const envParts = [...(input.environmentPrefix ?? [])];
	const agentDir = env.agentDir && existsSync(env.agentDir) ? env.agentDir : process.env.PI_CODING_AGENT_DIR;
	if (agentDir) envParts.push(`PI_CODING_AGENT_DIR=${shellEscape(agentDir)}`);
	if (env.denyTools.length > 0) envParts.push(`PI_DENY_TOOLS=${shellEscape(env.denyTools.join(","))}`);
	envParts.push(`PI_SUBAGENT_NAME=${shellEscape(env.name)}`);
	if (env.agentName) envParts.push(`PI_SUBAGENT_AGENT=${shellEscape(env.agentName)}`);
	envParts.push(`PI_SUBAGENT_SESSION=${shellEscape(env.sessionFile)}`);
	envParts.push(`PI_SUBAGENT_ID=${shellEscape(env.id)}`);
	envParts.push(`PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(env.activityFile)}`);
	if (env.autoExit) envParts.push("PI_SUBAGENT_AUTO_EXIT=1");
	envParts.push(...(input.environmentSuffix ?? []));

	return `cd ${shellEscape(input.cwd)} && ${envParts.join(" ")} ${parts.join(" ")}; printf '%s\\n' "$?" > ${shellEscape(input.completionFile)}`;
}
