import type {
	NormalizedWorkflowDefinition,
	WorkflowDataSlot,
	WorkflowRoleDefinition,
	WorkflowRunSnapshot,
} from "./types.ts";

export interface WorkflowReadableDataValue {
	readonly slotId: string;
	readonly label: string;
	readonly value: string;
}

export interface WorkflowRoleContinuationInput {
	readonly opening: string;
	readonly role: Pick<WorkflowRoleDefinition, "id" | "reads" | "handoff">;
	readonly dataSlots: Readonly<Record<string, WorkflowDataSlot>>;
	readonly data: Readonly<Record<string, string | undefined>>;
	readonly userMessage?: string;
	readonly dataHeading?: string;
}

const DEFAULT_DATA_HEADING = "Readable workflow data:";
const ROLLOVER_WARNING =
	"This is a fresh same-role rollover. Do not assume prior conversation history is present.";

function normalizeValue(value: string | undefined): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

export function resolveWorkflowRole(
	definition: NormalizedWorkflowDefinition,
	roleId: string,
): WorkflowRoleDefinition {
	const role = definition.roleById[roleId];
	if (!role) throw new Error(`Workflow ${definition.id} has no role "${roleId}".`);
	return role;
}

export function collectWorkflowReadableData(input: {
	readonly role: Pick<WorkflowRoleDefinition, "id" | "reads">;
	readonly dataSlots: Readonly<Record<string, WorkflowDataSlot>>;
	readonly data: Readonly<Record<string, string | undefined>>;
}): readonly WorkflowReadableDataValue[] {
	const readable: WorkflowReadableDataValue[] = [];
	for (const slotId of input.role.reads) {
		const slot = input.dataSlots[slotId];
		if (!slot) continue;
		const value = normalizeValue(input.data[slotId]);
		if (!value) continue;
		readable.push({
			slotId,
			label: slot.label,
			value,
		});
	}
	return readable;
}

export function collectWorkflowReadableDataForRole(
	definition: NormalizedWorkflowDefinition,
	roleId: string,
	data: Readonly<Record<string, string | undefined>>,
): readonly WorkflowReadableDataValue[] {
	return collectWorkflowReadableData({
		role: resolveWorkflowRole(definition, roleId),
		dataSlots: definition.data,
		data,
	});
}

export function formatWorkflowReadableData(
	values: readonly WorkflowReadableDataValue[],
): string[] {
	return values.map((entry) => `- ${entry.label}: ${entry.value}`);
}

export function buildWorkflowRoleContinuation(
	input: WorkflowRoleContinuationInput,
): string {
	const readable = collectWorkflowReadableData({
		role: input.role,
		dataSlots: input.dataSlots,
		data: input.data,
	});
	const latestInstruction = normalizeValue(input.userMessage);

	return [
		input.opening,
		input.role.handoff,
		...(readable.length > 0
			? ["", input.dataHeading ?? DEFAULT_DATA_HEADING, ...formatWorkflowReadableData(readable)]
			: []),
		...(latestInstruction ? ["", "Latest user instruction:", latestInstruction] : []),
	].join("\n");
}

export function buildWorkflowRolloverHandoff(input: {
	readonly role: Pick<WorkflowRoleDefinition, "id" | "reads" | "handoff">;
	readonly dataSlots: Readonly<Record<string, WorkflowDataSlot>>;
	readonly data: Readonly<Record<string, string | undefined>>;
	readonly userMessage?: string;
}): string {
	return buildWorkflowRoleContinuation({
		opening: ROLLOVER_WARNING,
		role: input.role,
		dataSlots: input.dataSlots,
		data: input.data,
		...(input.userMessage ? { userMessage: input.userMessage } : {}),
	});
}

export function buildWorkflowRolloverHandoffForRole(input: {
	readonly definition: NormalizedWorkflowDefinition;
	readonly roleId: string;
	readonly data: Readonly<Record<string, string | undefined>>;
	readonly userMessage?: string;
}): string {
	return buildWorkflowRolloverHandoff({
		role: resolveWorkflowRole(input.definition, input.roleId),
		dataSlots: input.definition.data,
		data: input.data,
		...(input.userMessage ? { userMessage: input.userMessage } : {}),
	});
}

export function buildWorkflowRolloverHandoffForRun(input: {
	readonly snapshot: WorkflowRunSnapshot;
	readonly roleId?: string;
	readonly userMessage?: string;
}): string {
	const roleId = input.roleId ?? input.snapshot.activeLaunch?.roleId;
	if (!roleId) {
		throw new Error(
			`Workflow run "${input.snapshot.runId}" has no active role for rollover handoff.`,
		);
	}
	return buildWorkflowRolloverHandoffForRole({
		definition: input.snapshot.definition,
		roleId,
		data: input.snapshot.data,
		...(input.userMessage ? { userMessage: input.userMessage } : {}),
	});
}
