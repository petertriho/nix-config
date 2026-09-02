import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ModelSelection } from "../launch-profile.ts";
import {
	resolveModelPolicy,
	type ResolvedModelSelection,
} from "../model-picker.ts";
import {
	canonicalProjectRoot,
	editWorkflowPresetRoles,
	makeWorkflowModelPreset,
	readWorkflowModelPreset,
	validateWorkflowPresetRoles,
	writeWorkflowModelPreset,
	type WorkflowPresetRoles,
	type WorkflowRoleSelection,
} from "./presets.ts";
import type {
	NormalizedWorkflowDefinition,
	WorkflowRoleModelSelection,
	WorkflowRunAssignmentSource,
	WorkflowRunModelPolicy,
} from "./types.ts";

export interface WorkflowStartupState {
	readonly workflowId: string;
	readonly policy: WorkflowRunModelPolicy;
	readonly assignmentSource: WorkflowRunAssignmentSource;
	readonly projectRoot: string;
	/** Deliberate assignments confirmed at startup. Never changed by recovery. */
	readonly originalAssignments?: WorkflowPresetRoles;
	/**
	 * Current role defaults. Start equal to `originalAssignments`; a successful
	 * recovery override replaces one role's default for the remainder of the
	 * workflow. Partial because parent-per-role workflows gain entries only
	 * through recovery.
	 */
	readonly currentAssignments?: Readonly<Record<string, WorkflowRoleModelSelection>>;
	/** Latest active session path per workflow role (spawn or rollover). */
	readonly activeSessions?: Readonly<Record<string, string>>;
	readonly updatedAt: string;
}

export type WorkflowStartupResult =
	| { status: "started"; state: WorkflowStartupState }
	| { status: "cancelled"; reason: "user" | "no-ui" | string };

type StartupContext = Pick<
	ExtensionContext,
	"hasUI" | "ui" | "modelRegistry" | "model" | "thinkingLevel" | "scopedModels"
>;

function cloneAssignments(
	assignments: WorkflowPresetRoles | Readonly<Record<string, WorkflowRoleModelSelection>>,
): Record<string, WorkflowRoleModelSelection> {
	return structuredClone(assignments);
}

function formatSelection(selection: { provider: string; model: string; thinking?: string }) {
	return `${selection.provider}/${selection.model}:${selection.thinking ?? "off"}`;
}

function formatAssignments(
	definition: NormalizedWorkflowDefinition,
	roles: WorkflowPresetRoles,
): string {
	return definition.roles
		.map((role) => `${role.label} ${formatSelection(roles[role.id]!)}`)
		.join(" · ");
}

function byString(first: string, second: string) {
	return first.localeCompare(second);
}

function roleChoiceValues(
	definition: NormalizedWorkflowDefinition,
): Readonly<Record<string, string>> {
	return Object.fromEntries(
		definition.roles.map((role) => [
			role.id,
			`${role.label} (${role.id})`,
		]),
	);
}

async function selectRoleAssignments(
	ctx: StartupContext,
	definition: NormalizedWorkflowDefinition,
): Promise<WorkflowPresetRoles | undefined> {
	const current: Record<string, WorkflowRoleSelection> = {};
	for (const [index, role] of definition.roles.entries()) {
		let picked: Awaited<ReturnType<typeof resolveModelPolicy>>;
		try {
			picked = await resolveModelPolicy("pick", ctx, {
				mode: "spawn",
				contextTokens: undefined,
				picker: {
					title: `Model for ${role.label} (${index + 1} of ${definition.roles.length})`,
					subject: role.label,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/cancelled/i.test(message)) return undefined;
			throw error;
		}
		if (picked.source === "legacy" || !picked.model || !picked.selection) {
			throw new Error(`${role.label} model selection failed.`);
		}
		current[role.id] = {
			provider: picked.selection.provider,
			model: picked.selection.model,
			thinking: picked.selection.thinking ?? "off",
		};
	}
	return editWorkflowPresetRoles(definition, current, {});
}

async function confirmAssignments(
	ctx: StartupContext,
	definition: NormalizedWorkflowDefinition,
	roles: WorkflowPresetRoles,
): Promise<WorkflowPresetRoles | "edit" | undefined> {
	const start = "Start workflow and save these assignments";
	const edit = "Edit assignments";
	const cancel = "Cancel";
	while (true) {
		const choice = await ctx.ui.select(
			`Role assignments: ${formatAssignments(definition, roles)}`,
			[start, edit, cancel],
		);
		if (choice === start) return roles;
		if (choice === edit) return "edit";
		if (choice === cancel || choice === undefined) return undefined;
	}
}

async function editAssignments(
	ctx: StartupContext,
	definition: NormalizedWorkflowDefinition,
	roles: WorkflowPresetRoles,
): Promise<WorkflowPresetRoles | undefined> {
	const roleChoices = roleChoiceValues(definition);
	const roleIdByChoice = Object.fromEntries(
		Object.entries(roleChoices).map(([roleId, choice]) => [choice, roleId]),
	);
	const choices = [...definition.roleIds.map((roleId) => roleChoices[roleId]!), "Done", "Cancel"];
	const choice = await ctx.ui.select("Select a role to edit", choices);
	if (choice === undefined || choice === "Cancel") return undefined;
	if (choice === "Done") return roles;
	const roleId = roleIdByChoice[choice];
	if (!roleId) return undefined;

	const role = definition.roleById[roleId]!;
	let picked: Awaited<ReturnType<typeof resolveModelPolicy>>;
	try {
		picked = await resolveModelPolicy("pick", ctx, {
			mode: "spawn",
			picker: {
				title: `Model for ${role.label}`,
				subject: role.label,
				currentRef: formatSelection(roles[roleId]!),
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/cancelled/i.test(message)) return undefined;
		throw error;
	}
	if (picked.source === "legacy" || !picked.model || !picked.selection) {
		throw new Error(`${role.label} model selection failed.`);
	}
	return editWorkflowPresetRoles(definition, roles, {
		[roleId]: {
			provider: picked.selection.provider,
			model: picked.selection.model,
			thinking: picked.selection.thinking ?? "off",
		},
	});
}

async function editAssignmentsUntilConfirmed(
	ctx: StartupContext,
	definition: NormalizedWorkflowDefinition,
	roles: WorkflowPresetRoles,
	available: ReturnType<StartupContext["modelRegistry"]["getAvailable"]>,
): Promise<WorkflowPresetRoles | undefined> {
	let current = roles;
	while (true) {
		const edited = await editAssignments(ctx, definition, current);
		if (!edited) return undefined;
		current = edited;
		const errors = validateWorkflowPresetRoles(definition, current, available);
		if (errors.length > 0) {
			ctx.ui.notify(`Invalid role assignments:\n${errors.sort(byString).join("\n")}`, "error");
			continue;
		}
		const confirmed = await confirmAssignments(ctx, definition, current);
		if (confirmed === undefined) return undefined;
		if (confirmed === "edit") continue;
		return confirmed;
	}
}

function makeState(
	definition: NormalizedWorkflowDefinition,
	projectRoot: string,
	policy: WorkflowRunModelPolicy,
	assignmentSource: WorkflowRunAssignmentSource,
	roles?: WorkflowPresetRoles,
): WorkflowStartupState {
	return {
		workflowId: definition.id,
		policy,
		assignmentSource,
		projectRoot: canonicalProjectRoot(projectRoot),
		...(roles
			? {
				originalAssignments: roles,
				currentAssignments: cloneAssignments(roles),
			}
			: {}),
		updatedAt: new Date().toISOString(),
	};
}

export async function chooseWorkflowStartup(
	ctx: StartupContext,
	definition: NormalizedWorkflowDefinition,
	projectRoot: string,
	options: { agentDir?: string; now?: () => Date } = {},
): Promise<WorkflowStartupResult> {
	if (!ctx.hasUI) {
		return {
			status: "cancelled",
			reason: "Workflow model setup needs interactive UI.",
		};
	}

	const root = canonicalProjectRoot(projectRoot);
	const presetRead = readWorkflowModelPreset(definition, root, options.agentDir);
	if (presetRead.status === "invalid") ctx.ui.notify(presetRead.error, "warning");

	const parentChoice = "Use the current parent model for each role launch";
	const configureChoice = "Configure each role before starting";
	const reuseChoice = "Reuse the saved workflow preset";
	const editChoice = "Edit saved preset roles";
	const cancelChoice = "Cancel";

	const savedRoles = presetRead.status === "ok" ? presetRead.preset.roles : undefined;
	const menuChoices = savedRoles
		? [reuseChoice, editChoice, parentChoice, cancelChoice]
		: [parentChoice, configureChoice, cancelChoice];

	while (true) {
		const title = savedRoles
			? `Saved workflow preset: ${formatAssignments(definition, savedRoles)}`
			: "Select the workflow model policy";
		const choice = await ctx.ui.select(title, menuChoices);
		if (choice === undefined || choice === cancelChoice) {
			return { status: "cancelled", reason: "user" };
		}

		if (choice === parentChoice) {
			return {
				status: "started",
				state: makeState(definition, root, "parent-per-role", "parent"),
			};
		}

		if (choice === configureChoice) {
			const available = ctx.modelRegistry.getAvailable();
			const collected = await selectRoleAssignments(ctx, definition);
			if (!collected) return { status: "cancelled", reason: "user" };
			const errors = validateWorkflowPresetRoles(definition, collected, available);
			if (errors.length > 0) {
				ctx.ui.notify(`Invalid role assignments:\n${errors.sort(byString).join("\n")}`, "error");
				continue;
			}
			const confirmed = await confirmAssignments(ctx, definition, collected);
			if (confirmed === undefined) return { status: "cancelled", reason: "user" };
			if (confirmed === "edit") {
				const reconfirmed = await editAssignmentsUntilConfirmed(
					ctx,
					definition,
					collected,
					available,
				);
				if (!reconfirmed) return { status: "cancelled", reason: "user" };
				writeWorkflowModelPreset(
					makeWorkflowModelPreset(
						definition,
						root,
						reconfirmed,
						options.now?.() ?? new Date(),
					),
					options.agentDir,
				);
				return {
					status: "started",
					state: makeState(definition, root, "per-role", "configured", reconfirmed),
				};
			}
			writeWorkflowModelPreset(
				makeWorkflowModelPreset(definition, root, confirmed, options.now?.() ?? new Date()),
				options.agentDir,
			);
			return {
				status: "started",
				state: makeState(definition, root, "per-role", "configured", confirmed),
			};
		}

		if (choice === reuseChoice && savedRoles) {
			const errors = validateWorkflowPresetRoles(
				definition,
				savedRoles,
				ctx.modelRegistry.getAvailable(),
			);
			if (errors.length > 0) {
				ctx.ui.notify(
					`Saved preset has unavailable assignments. Edit them or choose parent mode.\n${errors.sort(byString).join("\n")}`,
					"error",
				);
				continue;
			}
			return {
				status: "started",
				state: makeState(definition, root, "per-role", "preset", savedRoles),
			};
		}

		if (choice === editChoice && savedRoles) {
			const confirmed = await editAssignmentsUntilConfirmed(
				ctx,
				definition,
				savedRoles,
				ctx.modelRegistry.getAvailable(),
			);
			if (!confirmed) return { status: "cancelled", reason: "user" };
			writeWorkflowModelPreset(
				makeWorkflowModelPreset(definition, root, confirmed, options.now?.() ?? new Date()),
				options.agentDir,
			);
			return {
				status: "started",
				state: makeState(definition, root, "per-role", "preset-edited", confirmed),
			};
		}
	}
}

export function updateWorkflowActiveSession(
	state: WorkflowStartupState | null,
	roleId: string,
	sessionPath: string,
): WorkflowStartupState | null {
	if (!state) return null;
	return {
		...state,
		activeSessions: { ...state.activeSessions, [roleId]: sessionPath },
		updatedAt: new Date().toISOString(),
	};
}

export function applyWorkflowRecoveryOverride(
	state: WorkflowStartupState | null,
	roleId: string,
	selection: ModelSelection,
): WorkflowStartupState | null {
	if (!state) return null;
	return {
		...state,
		currentAssignments: {
			...state.currentAssignments,
			[roleId]: {
				provider: selection.provider,
				model: selection.model,
				thinking: selection.thinking ?? "off",
			},
		},
		updatedAt: new Date().toISOString(),
	};
}

export async function resolveWorkflowRoleSelection(
	ctx: Parameters<typeof resolveModelPolicy>[1],
	definition: NormalizedWorkflowDefinition,
	state: WorkflowStartupState,
	roleId: string,
): Promise<ResolvedModelSelection> {
	const role = definition.roleById[roleId];
	if (!role) throw new Error(`Workflow ${definition.id} has no role "${roleId}".`);

	const currentDefault = state.currentAssignments?.[roleId];
	if (currentDefault?.provider && currentDefault?.model) {
		const resolution = await resolveModelPolicy(
			`${currentDefault.provider}/${currentDefault.model}:${currentDefault.thinking ?? "off"}`,
			ctx,
			{ mode: "spawn" },
		);
		if (resolution.source === "legacy") {
			throw new Error(`The ${role.label} assignment is unavailable.`);
		}
		return resolution;
	}

	if (state.policy === "parent-per-role") {
		const resolution = await resolveModelPolicy("parent", ctx, { mode: "spawn" });
		if (resolution.source === "legacy") throw new Error("The parent session has no active model.");
		return resolution;
	}

	throw new Error(`The workflow has no ${role.label} assignment.`);
}
