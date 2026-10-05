import { readAgentModelConfig } from "../profiles/agent-models.ts";
import {
	parseExplicitModelSelection,
	resolveConfiguredAgentModel,
	type ResolvedModelSelection,
} from "../profiles/model-picker.ts";
import type { TaskAgentProfile } from "./profiles.ts";

export interface TaskModelLike {
	id: string;
	name?: string;
	provider: string;
}

export interface TaskModelRegistryLike<T extends TaskModelLike = TaskModelLike> {
	getAvailable(): readonly T[];
}

function normalizeModelToken(value: string): string {
	return value.toLowerCase().replace(/\./g, "-");
}

function formatAvailableModels(available: readonly TaskModelLike[]): string {
	return available
		.map((m) => `  ${m.provider}/${m.id}`)
		.sort()
		.join("\n");
}

/**
 * Resolve a task model override using only authenticated (`getAvailable()`) models:
 *
 * 1. Exact `provider/modelId`.
 * 2. Fuzzy: case-insensitive, `.` and `-` equivalent in versions, substring on
 *    id/name/full reference, tolerant of an optional trailing date stamp.
 * 3. A `provider/modelId` whose provider does not serve it retries the bare
 *    id against every provider (the same model elsewhere beats no match).
 *
 * Returns the canonical model entry, or an error string listing the available
 * models — never a silent fallback to the parent model.
 */
export function resolveTaskModelOverride<T extends TaskModelLike>(
	input: string,
	registry: TaskModelRegistryLike<T>,
): T | string {
	const available = registry.getAvailable();
	const trimmed = input.trim();
	const query = normalizeModelToken(trimmed);

	const slashIdx = query.indexOf("/");
	if (slashIdx !== -1) {
		const exact = available.find(
			(m) => normalizeModelToken(`${m.provider}/${m.id}`) === query,
		);
		if (exact) return exact;
	}

	// 2. Scored fuzzy match — deterministic: highest score wins, ties break on
	// the canonical provider/model string so the same input always resolves
	// the same way.
	let best: T | undefined;
	let bestScore = 0;
	let bestKey = "";
	for (const m of available) {
		const id = normalizeModelToken(m.id);
		const name = normalizeModelToken(m.name ?? "");
		const full = normalizeModelToken(`${m.provider}/${m.id}`);

		let score = 0;
		if (id === query || full === query) {
			score = 100;
		} else if (id.includes(query) || full.includes(query)) {
			score = 60 + (query.length / id.length) * 30;
		} else if (name && name.includes(query)) {
			score = 40 + (query.length / name.length) * 20;
		} else if (
			query
				.split(/[\s\-/]+/)
				.filter(Boolean)
				.every(
					(part) =>
						/^\d{8}$/.test(part) ||
						id.includes(part) ||
						(name.length > 0 && name.includes(part)) ||
						m.provider.toLowerCase().includes(part),
				)
		) {
			score = 20;
		}

		const key = `${m.provider}/${m.id}`;
		if (score > bestScore || (score === bestScore && score > 0 && key < bestKey)) {
			bestScore = score;
			best = m;
			bestKey = key;
		}
	}
	if (best != null && bestScore >= 20) return best;

	const originalSlash = trimmed.indexOf("/");
	if (originalSlash !== -1 && originalSlash + 1 < trimmed.length) {
		const bare = resolveTaskModelOverride(trimmed.slice(originalSlash + 1), registry);
		if (typeof bare !== "string") return bare;
	}

	return `Model not found: "${input}".\n\nAvailable models:\n${formatAvailableModels(available)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model precedence for a task launch
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskModelContext<T extends TaskModelLike = TaskModelLike> {
	modelRegistry: TaskModelRegistryLike<T>;
	/** Parent session model (`ctx.model`), used only as the last resort. */
	parentModel?: T;
	/** Directory holding agent-models.json for configured per-agent defaults. */
	agentDir: string;
}

/**
 * Resolve the model for one task launch. Precedence:
 *
 *   1. the pi-tasks `model` override (fuzzy, authenticated only);
 *   2. the `agent-models.json` entry for the resolved profile;
 *   3. the profile frontmatter `model`;
 *   4. the parent session model.
 *
 * An explicit override that cannot resolve fails hard — never falls back.
 */
export function resolveTaskLaunchModel<T extends TaskModelLike>(input: {
	override?: string;
	profile: TaskAgentProfile;
	ctx: TaskModelContext<T>;
}): ResolvedModelSelection {
	if (input.override) {
		const resolved = resolveTaskModelOverride(input.override, input.ctx.modelRegistry);
		if (typeof resolved === "string") throw new Error(resolved);
		return toResolvedSelection(resolved, "explicit");
	}

	const config = readAgentModelConfig(input.ctx.agentDir);
	if (config.status === "invalid") {
		throw new Error(
			`${config.error} Fix or remove the file, or run /agent-models, before executing tasks.`,
		);
	}
	const configured =
		config.status === "ok" ? config.config.agents[input.profile.fileName] : undefined;
	if (configured) {
		// SAFETY: resolveConfiguredAgentModel only reads ctx.modelRegistry; the
		// other PickerContext fields (ui, hasUI, model, scopedModels) are unused
		// on this validated non-interactive path.
		const pickerCtx = { modelRegistry: input.ctx.modelRegistry } as unknown as Parameters<
			typeof resolveConfiguredAgentModel
		>[1];
		return resolveConfiguredAgentModel(configured, pickerCtx, input.profile.fileName);
	}

	if (input.profile.model) {
		// SAFETY: parseExplicitModelSelection only reads provider/id/name from
		// the available entries, which TaskModelLike guarantees.
		const available = input.ctx.modelRegistry.getAvailable() as unknown as Parameters<
			typeof parseExplicitModelSelection
		>[1];
		const parsed = parseExplicitModelSelection(input.profile.model, available);
		return {
			model: parsed.model,
			selection: {
				provider: parsed.model.provider,
				model: parsed.model.id,
				...(parsed.thinking ? { thinking: parsed.thinking } : {}),
			},
			argument: parsed.thinking
				? `${parsed.model.provider}/${parsed.model.id}:${parsed.thinking}`
				: `${parsed.model.provider}/${parsed.model.id}`,
			source: "agent",
		};
	}

	if (input.ctx.parentModel) {
		return toResolvedSelection(input.ctx.parentModel, "parent");
	}

	throw new Error(
		`No model for task agent "${input.profile.fileName}": no override, configured default, ` +
			`or profile model, and the parent session has no active model.`,
	);
}

function toResolvedSelection(
	model: TaskModelLike,
	source: ResolvedModelSelection["source"],
): ResolvedModelSelection {
	return {
		// SAFETY: task model entries come from ctx.modelRegistry.getAvailable(),
		// whose elements are Model<Api> instances; TaskModelLike is the
		// structural subset this module needs.
		model: model as ResolvedModelSelection["model"],
		selection: { provider: model.provider, model: model.id },
		argument: `${model.provider}/${model.id}`,
		source,
	};
}
