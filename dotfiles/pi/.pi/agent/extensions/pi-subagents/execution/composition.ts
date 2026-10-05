import { createLaunchService } from "./launch.ts";
import { createLifecycleServices } from "./lifecycle.ts";
import { createProfileResourceServices } from "./profile-resources.ts";
import { createResumeService } from "./resume.ts";
import type { SubagentServiceDependencies } from "./types.ts";
import { createWatchServices } from "./watch.ts";

export function createSubagentExecutionServices(deps: SubagentServiceDependencies) {
	const { resolvePrimarySkill, collectResourceFingerprints, buildLaunchProfile } = createProfileResourceServices(deps);
	const lifecycle = createLifecycleServices(deps);
	const launchSubagent = createLaunchService(deps, { buildLaunchProfile, collectResourceFingerprints }, lifecycle);
	const { watchSubagent, watchInBackground } = createWatchServices(deps, lifecycle);
	const { stopSubagent } = lifecycle;
	const executeSubagentResume = createResumeService(deps, {
		resolvePrimarySkill,
		collectResourceFingerprints,
		launchSubagent,
		watchInBackground,
		captureSessionOwnership: lifecycle.captureSessionOwnership,
		reserveSavedSession: lifecycle.reserveSavedSession,
		cleanupFailedPostLaunch: lifecycle.cleanupFailedPostLaunch,
	});

	return {
		resolvePrimarySkill,
		collectResourceFingerprints,
		buildLaunchProfile,
		launchSubagent,
		watchSubagent,
		watchInBackground,
		stopSubagent,
		executeSubagentResume,
	};
}
