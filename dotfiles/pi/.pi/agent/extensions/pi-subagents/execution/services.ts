// Compatibility entry point. Re-export directly to preserve helper identities.
export { createSubagentExecutionServices } from "./composition.ts";
export { getDefaultSessionDirFor } from "./artifacts.ts";
export {
	buildSubagentToolAllowlist,
	parseSkillList,
	buildPiPromptArgs,
	parseLegacyModelSelection,
	resolveResumeLaunchBehavior,
	buildResumePiArgs,
} from "./prompts.ts";
export {
	formatElapsed,
	getShellReadyDelayMs,
	resolveUsageContextWindow,
	resolveUsageDetails,
	resolveResultPresentation,
	sendSubagentPing,
} from "./results.ts";
export type {
	LaunchContext,
	LaunchProfileInput,
	SubagentToolResult,
	SubagentResult,
	RunningSubagent,
	TeamLaunchSpec,
	SubagentLaunchParams,
	AgentDefaultsLike,
	SubagentPathResolution,
	LaunchBehavior,
	PiParentSelection,
	SubagentResumeParams,
	ResumeRecoveryContext,
	ResumeLifecycleContext,
	TaskRuntimeOptions,
	BackgroundWatchOptions,
	SubagentServiceDependencies,
} from "./types.ts";
