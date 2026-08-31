import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
	LaunchProfileWorkflowMetadata,
	ModelSelection,
	WorkflowPhase,
} from "./launch-profile.ts";
import {
	resolveModelPolicy,
	type ResolvedModelSelection,
} from "./model-picker.ts";
import {
	type WorkflowPresetRoles,
	type WorkflowRoleKey,
	WORKFLOW_ROLE_KEYS,
	canonicalProjectRoot,
	editWorkflowPresetRoles,
	makeWorkflowModelPreset,
	readWorkflowModelPreset,
	validateWorkflowPresetRoles,
	writeWorkflowModelPreset,
} from "./workflow-preset.ts";

export interface WorkflowRuntimeState {
	policy: "parent-per-phase" | "per-role";
	assignmentSource: "parent" | "configured" | "preset" | "preset-edited";
	projectRoot: string;
	/** Deliberate assignments confirmed at startup. Never changed by recovery. */
	roleAssignments?: WorkflowPresetRoles;
	/**
	 * Current role defaults. Start equal to `roleAssignments`; a successful
	 * recovery override replaces one role's default for the remainder of the
	 * workflow. Partial because parent-per-phase workflows gain entries only
	 * through recovery.
	 */
	currentAssignments?: Partial<WorkflowPresetRoles>;
	/** Latest active session path per workflow phase (spawn or rollover). */
	activeSessions?: Partial<Record<WorkflowPhase, string>>;
	updatedAt: string;
}

export type WorkflowStartupResult =
	| { status: "started"; state: WorkflowRuntimeState }
	| { status: "cancelled"; reason: "user" | "no-ui" | string };

export const WORKFLOW_ROLE_LABELS: Record<WorkflowRoleKey, string> = {
	planner: "Planner",
	taskWriter: "Task writer",
	executor: "Executor",
	reviewer: "Reviewer",
};

const AGENT_TO_PHASE: Record<string, WorkflowPhase> = {
	planner: "planner",
	"task-writer": "task-writer",
	executor: "executor",
	reviewer: "reviewer",
};

const PHASE_TO_ROLE: Record<WorkflowPhase, WorkflowRoleKey> = {
	planner: "planner",
	"task-writer": "taskWriter",
	executor: "executor",
	reviewer: "reviewer",
};

/**
 * Record the latest active session path for a workflow phase (fresh spawn or
 * rollover replacement). Pure: returns a new state and never mutates.
 */
export function updateWorkflowActiveSession(
	state: WorkflowRuntimeState | null,
	phase: WorkflowPhase,
	sessionPath: string,
): WorkflowRuntimeState | null {
	if (!state) return null;
	return {
		...state,
		activeSessions: { ...state.activeSessions, [phase]: sessionPath },
		updatedAt: new Date().toISOString(),
	};
}

/**
 * Replace one role's current workflow default after a successful recovery
 * override. The deliberate `roleAssignments` stay untouched for audit, and
 * the saved project preset is never modified from recovery.
 */
export function applyWorkflowRecoveryOverride(
	state: WorkflowRuntimeState | null,
	phase: WorkflowPhase,
	selection: ModelSelection,
): WorkflowRuntimeState | null {
	if (!state) return null;
	return {
		...state,
		currentAssignments: {
			...state.currentAssignments,
			[PHASE_TO_ROLE[phase]]: {
				provider: selection.provider,
				model: selection.model,
				thinking: selection.thinking ?? "off",
			},
		},
		updatedAt: new Date().toISOString(),
	};
}

type StartupContext = Pick<
	ExtensionContext,
	"hasUI" | "ui" | "modelRegistry" | "model" | "thinkingLevel" | "scopedModels"
>;

function formatSelection(selection: { provider: string; model: string; thinking: string }) {
	return `${selection.provider}/${selection.model}:${selection.thinking}`;
}

function formatRoles(roles: WorkflowPresetRoles): string {
	return WORKFLOW_ROLE_KEYS
		.map((role) => `${WORKFLOW_ROLE_LABELS[role]} ${formatSelection(roles[role])}`)
		.join(" · ");
}

function byString(first: string, second: string) {
	return first.localeCompare(second);
}

async function selectRoleAssignments(
	ctx: StartupContext,
	roles: WorkflowPresetRoles,
): Promise<WorkflowPresetRoles | undefined> {
	const next = editWorkflowPresetRoles(roles, {});
	for (const [index, role] of WORKFLOW_ROLE_KEYS.entries()) {
		const label = WORKFLOW_ROLE_LABELS[role];
		let picked: Awaited<ReturnType<typeof resolveModelPolicy>>;
		try {
			picked = await resolveModelPolicy("pick", ctx, {
				mode: "spawn",
				contextTokens: undefined,
				picker: {
					title: `Model for ${label} (${index + 1} of ${WORKFLOW_ROLE_KEYS.length})`,
					subject: label,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/cancelled/i.test(message)) return undefined;
			throw error;
		}
		if (picked.source === "legacy" || !picked.model || !picked.selection) {
			throw new Error(`${WORKFLOW_ROLE_LABELS[role]} model selection failed.`);
		}
		next[role] = {
			provider: picked.selection.provider,
			model: picked.selection.model,
			thinking: picked.selection.thinking ?? "off",
		};
	}
	return next;
}

async function confirmAssignments(
	ctx: StartupContext,
	roles: WorkflowPresetRoles,
): Promise<WorkflowPresetRoles | "edit" | undefined> {
	const start = "Start workflow and save these assignments";
	const edit = "Edit assignments";
	const cancel = "Cancel";
	while (true) {
		const choice = await ctx.ui.select(
			`Role assignments: ${formatRoles(roles)}`,
			[start, edit, cancel],
		);
		if (choice === start) return roles;
		if (choice === edit) return "edit";
		if (choice === undefined) return undefined;
	}
}

async function editAssignments(
	ctx: StartupContext,
	roles: WorkflowPresetRoles,
): Promise<WorkflowPresetRoles | undefined> {
	const choices = [
		...WORKFLOW_ROLE_KEYS.map((role) => WORKFLOW_ROLE_LABELS[role]),
		"Done",
		"Cancel",
	];
	const choice = await ctx.ui.select("Select a role to edit", choices);
	if (choice === undefined || choice === "Cancel") return undefined;
	if (choice === "Done") return roles;
	const role = WORKFLOW_ROLE_KEYS.find((key) => WORKFLOW_ROLE_LABELS[key] === choice);
	if (!role) return undefined;
	const label = WORKFLOW_ROLE_LABELS[role];
	let picked: Awaited<ReturnType<typeof resolveModelPolicy>>;
	try {
		picked = await resolveModelPolicy("pick", ctx, {
			mode: "spawn",
			picker: {
				title: `Model for ${label}`,
				subject: label,
				currentRef: formatSelection(roles[role]),
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/cancelled/i.test(message)) return undefined;
		throw error;
	}
	if (picked.source === "legacy" || !picked.model || !picked.selection) {
		throw new Error(`${WORKFLOW_ROLE_LABELS[role]} model selection failed.`);
	}
	return editWorkflowPresetRoles(roles, {
		[role]: {
			provider: picked.selection.provider,
			model: picked.selection.model,
			thinking: picked.selection.thinking ?? "off",
		},
	});
}

async function editAssignmentsUntilConfirmed(
	ctx: StartupContext,
	roles: WorkflowPresetRoles,
	available: ReturnType<StartupContext["modelRegistry"]["getAvailable"]>,
): Promise<WorkflowPresetRoles | undefined> {
	let current = roles;
	while (true) {
		const edited = await editAssignments(ctx, current);
		if (!edited) return undefined;
		current = edited;
		const errors = validateWorkflowPresetRoles(current, available);
		if (errors.length > 0) {
			ctx.ui.notify(`Invalid role assignments:\n${errors.sort(byString).join("\n")}`, "error");
			continue;
		}
		const confirmed = await confirmAssignments(ctx, current);
		if (confirmed === undefined) return undefined;
		if (confirmed === "edit") continue;
		return confirmed;
	}
}

function makeState(
	projectRoot: string,
	policy: WorkflowRuntimeState["policy"],
	assignmentSource: WorkflowRuntimeState["assignmentSource"],
	roles?: WorkflowPresetRoles,
): WorkflowRuntimeState {
	return {
		policy,
		assignmentSource,
		projectRoot: canonicalProjectRoot(projectRoot),
		...(roles ? { roleAssignments: roles, currentAssignments: roles } : {}),
		updatedAt: new Date().toISOString(),
	};
}

export async function chooseWorkflowStartup(
	ctx: StartupContext,
	projectRoot: string,
	options: { agentDir?: string; now?: () => Date } = {},
): Promise<WorkflowStartupResult> {
	if (!ctx.hasUI) return { status: "cancelled", reason: "/pter model setup needs interactive UI." };

	const root = canonicalProjectRoot(projectRoot);
	const presetRead = readWorkflowModelPreset(root, options.agentDir);
	if (presetRead.status === "invalid") ctx.ui.notify(presetRead.error, "warning");

	const parentChoice = "Use the current parent model for each phase";
	const configureChoice = "Configure each role before planning";
	const reuseChoice = "Reuse the saved project preset";
	const editChoice = "Edit saved preset roles";
	const cancelChoice = "Cancel";

	const savedRoles = presetRead.status === "ok" ? presetRead.preset.roles : undefined;
	const menuChoices = savedRoles
		? [reuseChoice, editChoice, parentChoice, cancelChoice]
		: [parentChoice, configureChoice, cancelChoice];

	while (true) {
		const title = savedRoles
			? `Saved project preset: ${formatRoles(savedRoles)}`
			: "Select the workflow model policy";
		const choice = await ctx.ui.select(title, menuChoices);
		if (choice === undefined || choice === cancelChoice) {
			return { status: "cancelled", reason: "user" };
		}

		if (choice === parentChoice) {
			return { status: "started", state: makeState(root, "parent-per-phase", "parent") };
		}

		if (choice === configureChoice) {
			const available = ctx.modelRegistry.getAvailable();
			const baseline: WorkflowPresetRoles = savedRoles ?? {
				planner: { provider: "", model: "", thinking: "off" },
				taskWriter: { provider: "", model: "", thinking: "off" },
				executor: { provider: "", model: "", thinking: "off" },
				reviewer: { provider: "", model: "", thinking: "off" },
			};
			const collected = await selectRoleAssignments(ctx, baseline);
			if (!collected) return { status: "cancelled", reason: "user" };
			const errors = validateWorkflowPresetRoles(collected, available);
			if (errors.length > 0) {
				ctx.ui.notify(`Invalid role assignments:\n${errors.sort(byString).join("\n")}`, "error");
				continue;
			}
			const confirmed = await confirmAssignments(ctx, collected);
			if (confirmed === undefined) return { status: "cancelled", reason: "user" };
			if (confirmed === "edit") {
				const reconfirmed = await editAssignmentsUntilConfirmed(ctx, collected, available);
				if (!reconfirmed) return { status: "cancelled", reason: "user" };
				writeWorkflowModelPreset(
					makeWorkflowModelPreset(root, reconfirmed, options.now?.() ?? new Date()),
					options.agentDir,
				);
				return {
					status: "started",
					state: makeState(root, "per-role", "configured", reconfirmed),
				};
			}
			writeWorkflowModelPreset(
				makeWorkflowModelPreset(root, confirmed, options.now?.() ?? new Date()),
				options.agentDir,
			);
			return { status: "started", state: makeState(root, "per-role", "configured", confirmed) };
		}

		if (choice === reuseChoice && savedRoles) {
			const errors = validateWorkflowPresetRoles(savedRoles, ctx.modelRegistry.getAvailable());
			if (errors.length > 0) {
				ctx.ui.notify(
					`Saved preset has unavailable assignments. Edit them or choose parent mode.\n${errors.sort(byString).join("\n")}`,
					"error",
				);
				continue;
			}
			return { status: "started", state: makeState(root, "per-role", "preset", savedRoles) };
		}

		if (choice === editChoice && savedRoles) {
			const confirmed = await editAssignmentsUntilConfirmed(
				ctx,
				savedRoles,
				ctx.modelRegistry.getAvailable(),
			);
			if (!confirmed) return { status: "cancelled", reason: "user" };
			writeWorkflowModelPreset(
				makeWorkflowModelPreset(root, confirmed, options.now?.() ?? new Date()),
				options.agentDir,
			);
			return {
				status: "started",
				state: makeState(root, "per-role", "preset-edited", confirmed),
			};
		}
	}
}

export function workflowPhaseForAgent(agent: string | undefined): WorkflowPhase | undefined {
	return agent ? AGENT_TO_PHASE[agent] : undefined;
}

export async function resolveWorkflowPhaseSelection(
	ctx: Parameters<typeof resolveModelPolicy>[1],
	state: WorkflowRuntimeState,
	phase: WorkflowPhase,
): Promise<ResolvedModelSelection> {
	const role = PHASE_TO_ROLE[phase];
	const currentDefault = state.currentAssignments?.[role];
	if (currentDefault?.provider && currentDefault?.model) {
		// The role's current workflow default: its startup assignment, or a
		// successful recovery override for the remainder of the workflow.
		const resolution = await resolveModelPolicy(
			`${currentDefault.provider}/${currentDefault.model}:${currentDefault.thinking}`,
			ctx,
			{ mode: "spawn" },
		);
		if (resolution.source === "legacy") {
			throw new Error(`The ${WORKFLOW_ROLE_LABELS[role]} assignment is unavailable.`);
		}
		return resolution;
	}

	if (state.policy === "parent-per-phase") {
		const resolution = await resolveModelPolicy("parent", ctx, { mode: "spawn" });
		if (resolution.source === "legacy") throw new Error("The parent session has no active model.");
		return resolution;
	}

	throw new Error(`The workflow has no ${WORKFLOW_ROLE_LABELS[role]} assignment.`);
}

export function buildWorkflowMetadata(
	state: WorkflowRuntimeState,
	phase: WorkflowPhase,
	selection: ResolvedModelSelection,
): LaunchProfileWorkflowMetadata {
	return {
		phase,
		policy: state.policy,
		assignmentSource: state.assignmentSource,
		projectRoot: state.projectRoot,
		...(state.roleAssignments?.[PHASE_TO_ROLE[phase]]
			? { originalDefault: state.roleAssignments[PHASE_TO_ROLE[phase]] }
			: {}),
		currentDefault: selection.selection,
		artifacts: {},
	};
}
