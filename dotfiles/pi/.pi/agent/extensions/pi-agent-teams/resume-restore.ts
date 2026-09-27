import type { LaunchProfile, LaunchProfileResources } from "./launch-profile.ts";

export interface ResourceFingerprintChange {
	field: "tools" | "visibleSkills";
	beforeHash: string;
	afterHash: string;
	beforeCount: number;
	afterCount: number;
}

export interface ResumeRestoration {
	source: "sidecar" | "legacy";
	cwd?: string;
	agentDir?: string;
	agentName?: string;
	roleBody?: string;
	systemPromptMode?: "append" | "replace" | "message";
	denyTools: string[];
	autoExit: boolean;
	interactive: boolean;
	legacyWarning?: string;
}

export function resolveResumeRestoration(
	profile: LaunchProfile | null,
	params: { autoExit?: boolean },
): ResumeRestoration {
	if (!profile) {
		return {
			source: "legacy",
			denyTools: [],
			autoExit: params.autoExit ?? true,
			interactive: params.autoExit === undefined ? false : !params.autoExit,
			legacyWarning:
				"No launch profile sidecar exists for this session. Resuming with current cwd, model behavior, tools, and skills at reduced fidelity.",
		};
	}

	const autoExit = params.autoExit === undefined
		? (profile.stable.controls.autoExit ?? true)
		: params.autoExit;
	const interactive = params.autoExit === undefined
		? profile.stable.controls.interactive
		: !params.autoExit;

	return {
		source: "sidecar",
		cwd: profile.stable.cwd,
		agentDir: profile.stable.agentDir,
		...(profile.stable.agentName ? { agentName: profile.stable.agentName } : {}),
		roleBody: profile.stable.roleBody,
		systemPromptMode: profile.stable.systemPromptMode,
		denyTools: [...profile.stable.controls.denyTools],
		autoExit,
		interactive,
	};
}

export function diffResourceFingerprints(
	before: LaunchProfileResources,
	after: LaunchProfileResources,
): ResourceFingerprintChange[] {
	const changes: ResourceFingerprintChange[] = [];
	for (const field of ["tools", "visibleSkills"] as const) {
		if (before[field].hash !== after[field].hash) {
			changes.push({
				field,
				beforeHash: before[field].hash,
				afterHash: after[field].hash,
				beforeCount: before[field].count,
				afterCount: after[field].count,
			});
		}
	}
	return changes;
}

export function primarySkillChanged(
	profile: LaunchProfile,
	current: { name: string; hash: string } | undefined,
): boolean {
	const previous = profile.stable.primarySkill;
	if (!previous) return false;
	if (!current) return true;
	return current.name !== previous.name || current.hash !== previous.hash;
}

export function resourceChangeNotice(changes: readonly ResourceFingerprintChange[]): string | undefined {
	if (changes.length === 0) return undefined;
	return changes
		.map((change) => `${change.field} changed (${change.beforeCount} -> ${change.afterCount}); continuing with current resources`)
		.join("; ");
}
