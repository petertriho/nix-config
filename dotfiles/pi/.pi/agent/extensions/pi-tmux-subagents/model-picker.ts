import {
	getSupportedThinkingLevels,
	type Api,
	type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	type LaunchProfile,
	type ModelSelection,
	THINKING_LEVELS,
	type SubagentThinkingLevel,
} from "./launch-profile.ts";

export type ModelPolicy = "parent" | "previous" | "pick" | string;
export type ModelSelectionSource =
	| "parent"
	| "previous"
	| "picker"
	| "explicit"
	| "agent"
	| "configured"
	| "legacy";

export interface ResolvedModelSelection {
	model: Model<Api>;
	selection: ModelSelection;
	argument: string;
	source: ModelSelectionSource;
}

export interface OmittedLegacySelection {
	model?: undefined;
	selection?: undefined;
	argument?: undefined;
	source: "legacy";
}

export type ModelPolicyResolution = ResolvedModelSelection | OmittedLegacySelection;

export interface PickerModelItem {
	model: Model<Api>;
	thinkingLevel?: SubagentThinkingLevel;
	scoped: boolean;
}

type PickerContext = Pick<
	ExtensionContext,
	"hasUI" | "ui" | "scopedModels" | "modelRegistry" | "model" | "thinkingLevel"
>;

function canonicalModel(model: Pick<Model<Api>, "provider" | "id">): string {
	return `${model.provider}/${model.id}`;
}

function asThinkingLevel(value: string | undefined): SubagentThinkingLevel | undefined {
	return value && THINKING_LEVELS.includes(value as SubagentThinkingLevel)
		? value as SubagentThinkingLevel
		: undefined;
}

function formatContextWindow(tokens: number): string {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}m`;
	}
	return `${Math.round(tokens / 1_000)}k`;
}

function formatSelection(model: Model<Api>, thinking?: SubagentThinkingLevel): string {
	const base = canonicalModel(model);
	return thinking ? `${base}:${thinking}` : base;
}

/** Strip a valid `:thinking` suffix so a currentRef can match a bare row. */
function normalizeCurrentRef(currentRef: string): string {
	const lastColon = currentRef.lastIndexOf(":");
	const suffix = lastColon >= 0 ? asThinkingLevel(currentRef.slice(lastColon + 1)) : undefined;
	return suffix ? currentRef.slice(0, lastColon) : currentRef;
}

function toSelection(model: Model<Api>, thinking?: SubagentThinkingLevel): ModelSelection {
	return {
		provider: model.provider,
		model: model.id,
		...(thinking ? { thinking } : {}),
	};
}

function ensureSupportedThinking(
	model: Model<Api>,
	thinking: SubagentThinkingLevel | undefined,
): SubagentThinkingLevel | undefined {
	if (!thinking) return undefined;
	const supported = getSupportedThinkingLevels(model);
	if (!supported.includes(thinking)) {
		throw new Error(
			`${canonicalModel(model)} does not support thinking level "${thinking}". `
			+ `Supported levels: ${supported.join(", ")}`,
		);
	}
	return thinking;
}

function findExactAvailableModel(
	reference: string,
	available: readonly Model<Api>[],
): Model<Api> | undefined {
	return available.find((model) => canonicalModel(model) === reference);
}

export function parseExplicitModelSelection(
	value: string,
	available: readonly Model<Api>[],
	fallbackThinking?: SubagentThinkingLevel,
): { model: Model<Api>; thinking?: SubagentThinkingLevel } {
	const trimmed = value.trim();
	const exact = findExactAvailableModel(trimmed, available);
	if (exact) {
		return {
			model: exact,
			thinking: ensureSupportedThinking(exact, fallbackThinking),
		};
	}

	const lastColon = trimmed.lastIndexOf(":");
	const suffix = lastColon >= 0 ? asThinkingLevel(trimmed.slice(lastColon + 1)) : undefined;
	const modelReference = suffix ? trimmed.slice(0, lastColon) : trimmed;
	const model = findExactAvailableModel(modelReference, available);
	if (!model) {
		throw new Error(
			`Model "${value}" is not authenticated and available. `
			+ "Pass an exact provider/model[:thinking] value or use model: \"pick\".",
		);
	}

	return {
		model,
		thinking: ensureSupportedThinking(model, suffix ?? fallbackThinking),
	};
}

/**
 * Resolve a per-agent default from `agent-models.json` through the validated
 * path (registry lookup + supported-thinking check). Unlike the legacy
 * frontmatter passthrough this records `source: "configured"` in launch
 * bookkeeping. Availability and thinking failures throw with the agent name
 * and configured value so spawn-time errors stay actionable.
 */
export function resolveConfiguredAgentModel(
	value: string,
	ctx: PickerContext,
	agentName: string,
): ResolvedModelSelection {
	const available = ctx.modelRegistry.getAvailable();
	let parsed: ReturnType<typeof parseExplicitModelSelection>;
	try {
		parsed = parseExplicitModelSelection(value, available);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Agent "${agentName}" has a configured default model "${value}" that cannot be used: ${reason}`,
		);
	}
	return {
		model: parsed.model,
		selection: toSelection(parsed.model, parsed.thinking),
		argument: formatSelection(parsed.model, parsed.thinking),
		source: "configured",
	};
}

export function buildPickerModelItems(ctx: PickerContext, showAll = false): PickerModelItem[] {
	const available = ctx.modelRegistry.getAvailable();
	const byCanonical = new Map(available.map((model) => [canonicalModel(model), model]));

	if (!showAll && ctx.scopedModels.length > 0) {
		return ctx.scopedModels.flatMap((entry) => {
			const model = byCanonical.get(canonicalModel(entry.model));
			return model
				? [{
					model,
					thinkingLevel: asThinkingLevel(entry.thinkingLevel),
					scoped: true,
				}]
				: [];
		});
	}

	const scopedByCanonical = new Map(
		ctx.scopedModels.map((entry) => [
			canonicalModel(entry.model),
			asThinkingLevel(entry.thinkingLevel),
		]),
	);
	return available
		.map((model) => ({
			model,
			thinkingLevel: scopedByCanonical.get(canonicalModel(model)),
			scoped: scopedByCanonical.has(canonicalModel(model)),
		}))
		.sort((a, b) => {
			if (a.scoped !== b.scoped) return a.scoped ? -1 : 1;
			return canonicalModel(a.model).localeCompare(canonicalModel(b.model));
		});
}

function modelLabel(item: PickerModelItem, contextTokens?: number, currentRef?: string): string {
	const ratio = contextTokens != null && item.model.contextWindow > 0
		? contextTokens / item.model.contextWindow
		: undefined;
	const ratioLabel = ratio == null
		? ""
		: ratio >= 0.65
			? ` · ${Math.round(ratio * 100)}% context · rollover warning`
			: ` · ${Math.round(ratio * 100)}% context`;
	const name = item.model.name && item.model.name !== item.model.id
		? ` · ${item.model.name}`
		: "";
	const current = currentRef && normalizeCurrentRef(currentRef) === canonicalModel(item.model)
		? " · current"
		: "";
	return `${canonicalModel(item.model)}${name} · ${formatContextWindow(item.model.contextWindow)}${ratioLabel}${current}`;
}

export async function pickModelSelection(
	ctx: PickerContext,
	options: {
		contextTokens?: number;
		title?: string;
		/** Agent/role being configured; names the thinking-level dialog. */
		subject?: string;
		/** Configured provider/model[:thinking] whose row gets `· current`. */
		currentRef?: string;
	},
): Promise<ResolvedModelSelection | undefined> {
	if (!ctx.hasUI) {
		throw new Error(
			'model: "pick" needs interactive UI. Pass an explicit provider/model[:thinking] value instead.',
		);
	}

	let showAll = ctx.scopedModels.length === 0;
	while (true) {
		const items = buildPickerModelItems(ctx, showAll);
		if (items.length === 0) {
			throw new Error("No authenticated models are available for subagent selection.");
		}

		const labels = items.map((item) => modelLabel(item, options.contextTokens, options.currentRef));
		const showAllLabel = "Show all authenticated models…";
		const choices = !showAll && ctx.modelRegistry.getAvailable().length > items.length
			? [...labels, showAllLabel]
			: labels;
		const selectedLabel = await ctx.ui.select(options.title ?? "Select subagent model", choices);
		if (selectedLabel === undefined) return undefined;
		if (selectedLabel === showAllLabel) {
			showAll = true;
			continue;
		}

		const selectedIndex = labels.indexOf(selectedLabel);
		const item = items[selectedIndex];
		if (!item) return undefined;

		const supported = getSupportedThinkingLevels(item.model) as SubagentThinkingLevel[];
		const thinkingChoice = await ctx.ui.select(
			options.subject
				? `Thinking for ${options.subject} — ${canonicalModel(item.model)}`
				: `Thinking level for ${canonicalModel(item.model)}`,
			supported,
		);
		if (thinkingChoice === undefined) return undefined;
		const thinking = ensureSupportedThinking(item.model, asThinkingLevel(thinkingChoice));
		if (!thinking) {
			throw new Error(`Invalid thinking selection "${thinkingChoice}"`);
		}

		return {
			model: item.model,
			selection: toSelection(item.model, thinking),
			argument: formatSelection(item.model, thinking),
			source: "picker",
		};
	}
}

function resolveStoredSelection(
	selection: ModelSelection | undefined,
	available: readonly Model<Api>[],
	source: "previous",
): ResolvedModelSelection {
	if (!selection) {
		throw new Error("The saved subagent launch profile has no previous model selection.");
	}
	const model = findExactAvailableModel(`${selection.provider}/${selection.model}`, available);
	if (!model) {
		throw new Error(
			`Previously used model ${selection.provider}/${selection.model} is not currently authenticated and available. `
			+ 'Use model: "pick" or pass an explicit replacement.',
		);
	}
	const thinking = ensureSupportedThinking(model, selection.thinking);
	return {
		model,
		selection: toSelection(model, thinking),
		argument: formatSelection(model, thinking),
		source,
	};
}

export async function resolveModelPolicy(
	policy: string | undefined,
	ctx: PickerContext,
	options: {
		mode: "spawn" | "resume";
		profile?: LaunchProfile;
		agentModel?: string;
		agentThinking?: string;
		contextTokens?: number;
		/** Subject-aware prompt for the "pick" branch's model dialogs. */
		picker?: { title?: string; subject?: string; currentRef?: string };
	},
): Promise<ModelPolicyResolution> {
	const available = ctx.modelRegistry.getAvailable();

	if (policy === "previous") {
		if (options.mode === "spawn") {
			throw new Error('model: "previous" is valid only when resuming a sidecar-backed session.');
		}
		return resolveStoredSelection(options.profile?.runtime.lastModel, available, "previous");
	}

	if (policy === "pick") {
		const picked = await pickModelSelection(ctx, {
			contextTokens: options.contextTokens,
			title: options.picker?.title
				?? (options.mode === "resume" ? "Select resume model" : "Select subagent model"),
			subject: options.picker?.subject,
			currentRef: options.picker?.currentRef,
		});
		if (!picked) throw new Error("Model selection cancelled.");
		return picked;
	}

	if (policy === "parent") {
		if (!ctx.model) throw new Error("The parent session has no active model.");
		const thinking = ensureSupportedThinking(ctx.model, asThinkingLevel(ctx.thinkingLevel));
		return {
			model: ctx.model,
			selection: toSelection(ctx.model, thinking),
			argument: formatSelection(ctx.model, thinking),
			source: "parent",
		};
	}

	if (policy) {
		const parsed = parseExplicitModelSelection(
			policy,
			available,
			asThinkingLevel(options.agentThinking),
		);
		return {
			model: parsed.model,
			selection: toSelection(parsed.model, parsed.thinking),
			argument: formatSelection(parsed.model, parsed.thinking),
			source: "explicit",
		};
	}

	if (options.mode === "resume") {
		if (options.profile) {
			return resolveStoredSelection(options.profile.runtime.lastModel, available, "previous");
		}
		return { source: "legacy" };
	}

	if (options.agentModel) {
		const parsed = parseExplicitModelSelection(
			options.agentModel,
			available,
			asThinkingLevel(options.agentThinking),
		);
		return {
			model: parsed.model,
			selection: toSelection(parsed.model, parsed.thinking),
			argument: formatSelection(parsed.model, parsed.thinking),
			source: "agent",
		};
	}

	if (!ctx.model) return { source: "legacy" };
	const thinking = ensureSupportedThinking(ctx.model, asThinkingLevel(ctx.thinkingLevel));
	return {
		model: ctx.model,
		selection: toSelection(ctx.model, thinking),
		argument: formatSelection(ctx.model, thinking),
		source: "parent",
	};
}
