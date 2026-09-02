import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { Type, type Static } from "typebox";
import type {
	NormalizedWorkflowDefinition,
	WorkflowCommandDefinition,
	WorkflowDataSlot,
	WorkflowDataValueMap,
	WorkflowDefinitionLoadFailure,
	WorkflowDefinitionLoadResult,
	WorkflowDiagnostic,
	WorkflowFileConstraint,
	WorkflowPrivateSkill,
	WorkflowPrivateSkillFrontmatter,
	WorkflowResolvedWriteCapability,
	WorkflowRoleDefinition,
	WorkflowWriteCapability,
	WorkflowWriteResolutionResult,
} from "./types.ts";
import {
	WORKFLOW_DATA_IDENTIFIER_PATTERN,
	WORKFLOW_IDENTIFIER_PATTERN,
	WORKFLOW_MANIFEST_VERSION,
} from "./types.ts";

export const WorkflowCommandSchema = Type.Object(
	{
		name: Type.String({ minLength: 1 }),
		description: Type.String({ minLength: 1 }),
		argumentHint: Type.Optional(Type.String({ minLength: 1 })),
	},
	{ additionalProperties: false },
);

export const WorkflowFileConstraintSchema = Type.Object(
	{
		under: Type.String({ minLength: 1 }),
		basename: Type.Optional(Type.String({ minLength: 1 })),
	},
	{ additionalProperties: false },
);

export const WorkflowFileDataSlotSchema = Type.Object(
	{
		kind: Type.Literal("file"),
		label: Type.String({ minLength: 1 }),
		constraint: Type.Optional(WorkflowFileConstraintSchema),
	},
	{ additionalProperties: false },
);

export const WorkflowStringDataSlotSchema = Type.Object(
	{
		kind: Type.Literal("string"),
		label: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export const WorkflowDataSlotSchema = Type.Union([
	WorkflowFileDataSlotSchema,
	WorkflowStringDataSlotSchema,
]);

export const WorkflowRoleSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
		label: Type.String({ minLength: 1 }),
		agent: Type.String({ minLength: 1 }),
		reads: Type.Array(Type.String({ minLength: 1 })),
		writes: Type.Array(Type.String({ minLength: 1 })),
		handoff: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export const WorkflowManifestV1Schema = Type.Object(
	{
		version: Type.Literal(WORKFLOW_MANIFEST_VERSION),
		id: Type.String({ minLength: 1 }),
		command: WorkflowCommandSchema,
		skill: Type.String({ minLength: 1 }),
		data: Type.Record(Type.String({ minLength: 1 }), WorkflowDataSlotSchema),
		roles: Type.Array(WorkflowRoleSchema, { minItems: 1 }),
	},
	{ additionalProperties: false },
);

export const WorkflowPrivateSkillFrontmatterSchema = Type.Object(
	{
		name: Type.String({ minLength: 1 }),
		description: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: true },
);

type WorkflowManifestInput = Static<typeof WorkflowManifestV1Schema>;
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | JsonRecord;
interface JsonRecord {
	[key: string]: JsonValue;
}
type NormalizedManifestSuccess = {
	status: "ok";
	id: string;
	command: WorkflowCommandDefinition;
	skill: string;
	data: Readonly<Record<string, WorkflowDataSlot>>;
	dataOrder: readonly string[];
	roles: readonly WorkflowRoleDefinition[];
};
type ParsedWorkflowPrivateSkillFrontmatterSuccess = {
	status: "ok";
	frontmatter: WorkflowPrivateSkillFrontmatter;
	body: string;
};

function hasExactKeys(
	value: JsonRecord,
	required: readonly string[],
	optional: readonly string[] = [],
): boolean {
	const allowed = new Set([...required, ...optional]);
	return required.every((key) => Object.hasOwn(value, key))
		&& Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: JsonValue | undefined): value is JsonRecord {
	return Object(value) === value && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: JsonValue | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function hashText(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function pushDiagnostic(
	diagnostics: WorkflowDiagnostic[],
	path: string,
	message: string,
): WorkflowDefinitionLoadFailure {
	diagnostics.push({ path, message });
	return { status: "invalid", diagnostics };
}

function freezeDeep<T>(value: T): T {
	if (Object(value) !== value || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, JsonValue>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

function normalizeNonEmptyString(value: string): string {
	return value.trim();
}

function isContainedPath(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (!rel.split(sep).includes("..") && !isAbsolute(rel));
}

function canonicalizePath(path: string): string | null {
	let existingAncestor = resolve(path);
	const missingSegments: string[] = [];
	while (true) {
		try {
			lstatSync(existingAncestor);
			break;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT" && code !== "ENOTDIR") return null;
			const parent = dirname(existingAncestor);
			if (parent === existingAncestor) return null;
			missingSegments.unshift(basename(existingAncestor));
			existingAncestor = parent;
		}
	}
	try {
		return resolve(realpathSync(existingAncestor), ...missingSegments);
	} catch {
		return null;
	}
}

function normalizeRepositoryRelativePath(raw: string): string | null {
	const normalized = posix.normalize(raw.replace(/\\/g, "/"));
	if (posix.isAbsolute(normalized)) return null;
	if (normalized === ".." || normalized.startsWith("../")) return null;
	return normalized === "" ? null : normalized;
}

function normalizeConstraint(
	value: JsonValue | undefined,
	path: string,
	diagnostics: WorkflowDiagnostic[],
): WorkflowFileConstraint | null {
	if (!isRecord(value) || !hasExactKeys(value, ["under"], ["basename"])) {
		pushDiagnostic(diagnostics, path, "File constraint must contain `under` and optional `basename` only.");
		return null;
	}
	if (!isNonEmptyString(value.under)) {
		pushDiagnostic(diagnostics, `${path}.under`, "File constraint `under` must be a non-empty repository-relative path.");
		return null;
	}
	const under = normalizeRepositoryRelativePath(value.under);
	if (!under) {
		pushDiagnostic(diagnostics, `${path}.under`, "File constraint `under` must stay inside the repository.");
		return null;
	}
	let basenameValue: string | undefined;
	if (value.basename !== undefined) {
		if (!isNonEmptyString(value.basename)) {
			pushDiagnostic(diagnostics, `${path}.basename`, "File constraint `basename` must be a non-empty file name.");
			return null;
		}
		const trimmed = value.basename.trim();
		if (trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
			pushDiagnostic(diagnostics, `${path}.basename`, "File constraint `basename` must be a single file name.");
			return null;
		}
		basenameValue = trimmed;
	}
	return basenameValue ? { under, basename: basenameValue } : { under };
}

function isSafeFileConstraint(constraint: WorkflowFileConstraint): boolean {
	return constraint.under !== "." || constraint.basename !== undefined;
}

function matchesIdentifier(value: string, pattern: RegExp): boolean {
	return pattern.test(value);
}

function normalizeCommand(
	value: JsonValue | undefined,
	path: string,
	diagnostics: WorkflowDiagnostic[],
): WorkflowCommandDefinition | null {
	if (!isRecord(value) || !hasExactKeys(value, ["name", "description"], ["argumentHint"])) {
		pushDiagnostic(diagnostics, path, "Workflow command must contain `name`, `description`, and optional `argumentHint` only.");
		return null;
	}
	if (!isNonEmptyString(value.name)) {
		pushDiagnostic(diagnostics, `${path}.name`, "Workflow command name must be a non-empty string.");
		return null;
	}
	const name = normalizeNonEmptyString(value.name);
	if (!matchesIdentifier(name, WORKFLOW_IDENTIFIER_PATTERN)) {
		pushDiagnostic(diagnostics, `${path}.name`, "Workflow command name must match /^[a-z][a-z0-9-]*[a-z0-9]?$|^[a-z]$/.");
	}
	if (!isNonEmptyString(value.description)) {
		pushDiagnostic(diagnostics, `${path}.description`, "Workflow command description must be a non-empty string.");
		return null;
	}
	const description = normalizeNonEmptyString(value.description);
	if (value.argumentHint !== undefined && !isNonEmptyString(value.argumentHint)) {
		pushDiagnostic(diagnostics, `${path}.argumentHint`, "Workflow command argumentHint must be a non-empty string when present.");
		return null;
	}
	return value.argumentHint === undefined
		? { name, description }
		: { name, description, argumentHint: normalizeNonEmptyString(value.argumentHint) };
}

function normalizeDataSlots(
	value: JsonValue | undefined,
	path: string,
	diagnostics: WorkflowDiagnostic[],
): { data: Readonly<Record<string, WorkflowDataSlot>>; dataOrder: readonly string[] } | null {
	if (!isRecord(value)) {
		pushDiagnostic(diagnostics, path, "Workflow data must be an object keyed by data slot ID.");
		return null;
	}
	const dataOrder: string[] = [];
	const data = Object.create(null) as Record<string, WorkflowDataSlot>;
	for (const [id, rawSlot] of Object.entries(value)) {
		dataOrder.push(id);
		const slotPath = `${path}.${id}`;
		if (!matchesIdentifier(id, WORKFLOW_DATA_IDENTIFIER_PATTERN)) {
			pushDiagnostic(diagnostics, slotPath, "Workflow data IDs must start lowercase and use letters, digits, or hyphens.");
			continue;
		}
		if (!isRecord(rawSlot) || !isNonEmptyString(rawSlot.kind) || !isNonEmptyString(rawSlot.label)) {
			pushDiagnostic(diagnostics, slotPath, "Workflow data slots must contain non-empty `kind` and `label` fields.");
			continue;
		}
		const label = normalizeNonEmptyString(rawSlot.label);
		if (rawSlot.kind === "string") {
			if (!hasExactKeys(rawSlot, ["kind", "label"])) {
				pushDiagnostic(diagnostics, slotPath, "String data slots accept `kind` and `label` only.");
				continue;
			}
			data[id] = { id, kind: "string", label };
			continue;
		}
		if (rawSlot.kind !== "file") {
			pushDiagnostic(diagnostics, `${slotPath}.kind`, "Workflow data slot kind must be `file` or `string`.");
			continue;
		}
		if (!hasExactKeys(rawSlot, ["kind", "label"], ["constraint"])) {
			pushDiagnostic(diagnostics, slotPath, "File data slots accept `kind`, `label`, and optional `constraint` only.");
			continue;
		}
		const constraint = rawSlot.constraint === undefined
			? undefined
			: normalizeConstraint(rawSlot.constraint, `${slotPath}.constraint`, diagnostics);
		if (rawSlot.constraint !== undefined && !constraint) continue;
		data[id] = constraint
			? { id, kind: "file", label, constraint }
			: { id, kind: "file", label };
	}
	return { data, dataOrder };
}

function normalizeWrites(
	value: JsonValue | undefined,
	roleId: string,
	rolePath: string,
	diagnostics: WorkflowDiagnostic[],
): WorkflowWriteCapability[] | null {
	if (!Array.isArray(value)) {
		pushDiagnostic(diagnostics, `${rolePath}.writes`, `Workflow role ${roleId} must declare writes as an array.`);
		return null;
	}
	const writes: WorkflowWriteCapability[] = [];
	for (const [index, capability] of value.entries()) {
		const writePath = `${rolePath}.writes[${index}]`;
		if (!isNonEmptyString(capability)) {
			pushDiagnostic(diagnostics, writePath, `Workflow role ${roleId} write capabilities must be non-empty strings.`);
			continue;
		}
		const trimmed = normalizeNonEmptyString(capability);
		if (trimmed === "worktree" || trimmed.startsWith("file:")) {
			writes.push(trimmed as WorkflowWriteCapability);
			continue;
		}
		pushDiagnostic(diagnostics, writePath, `Workflow role ${roleId} write capability must be "worktree" or "file:<data-id>".`);
	}
	return writes;
}

function normalizeRoles(
	value: JsonValue | undefined,
	path: string,
	diagnostics: WorkflowDiagnostic[],
): readonly WorkflowRoleDefinition[] | null {
	if (!Array.isArray(value) || value.length === 0) {
		pushDiagnostic(diagnostics, path, "Workflow roles must be a non-empty array.");
		return null;
	}
	const seen = new Set<string>();
	const roles: WorkflowRoleDefinition[] = [];
	for (const [index, rawRole] of value.entries()) {
		const rolePath = `${path}[${index}]`;
		if (!isRecord(rawRole) || !hasExactKeys(rawRole, ["id", "label", "agent", "reads", "writes", "handoff"])) {
			pushDiagnostic(
				diagnostics,
				rolePath,
				"Workflow roles must contain `id`, `label`, `agent`, `reads`, `writes`, and `handoff` only.",
			);
			continue;
		}
		if (!isNonEmptyString(rawRole.id)) {
			pushDiagnostic(diagnostics, `${rolePath}.id`, "Workflow role ID must be a non-empty string.");
			continue;
		}
		const id = normalizeNonEmptyString(rawRole.id);
		if (!matchesIdentifier(id, WORKFLOW_IDENTIFIER_PATTERN)) {
			pushDiagnostic(diagnostics, `${rolePath}.id`, "Workflow role IDs must match the stable lowercase workflow identifier syntax.");
		}
		if (seen.has(id)) {
			pushDiagnostic(diagnostics, `${rolePath}.id`, `Duplicate workflow role ID "${id}".`);
			continue;
		}
		seen.add(id);
		if (!isNonEmptyString(rawRole.label)) {
			pushDiagnostic(diagnostics, `${rolePath}.label`, `Workflow role ${id} label must be a non-empty string.`);
			continue;
		}
		if (!isNonEmptyString(rawRole.agent)) {
			pushDiagnostic(diagnostics, `${rolePath}.agent`, `Workflow role ${id} agent must be a non-empty string.`);
			continue;
		}
		if (!Array.isArray(rawRole.reads) || !rawRole.reads.every(isNonEmptyString)) {
			pushDiagnostic(diagnostics, `${rolePath}.reads`, `Workflow role ${id} reads must be an array of data slot IDs.`);
			continue;
		}
		const writes = normalizeWrites(rawRole.writes, id, rolePath, diagnostics);
		if (!writes) continue;
		if (!isNonEmptyString(rawRole.handoff)) {
			pushDiagnostic(diagnostics, `${rolePath}.handoff`, `Workflow role ${id} handoff text must be a non-empty string.`);
			continue;
		}
		roles.push({
			id,
			label: normalizeNonEmptyString(rawRole.label),
			agent: normalizeNonEmptyString(rawRole.agent),
			reads: rawRole.reads.map(normalizeNonEmptyString),
			writes,
			handoff: normalizeNonEmptyString(rawRole.handoff),
		});
	}
	return roles;
}

function validateRoleReferences(
	data: Readonly<Record<string, WorkflowDataSlot>>,
	roles: readonly WorkflowRoleDefinition[],
	manifestPath: string,
	diagnostics: WorkflowDiagnostic[],
): void {
	for (const [roleIndex, role] of roles.entries()) {
		for (const [readIndex, dataId] of role.reads.entries()) {
			if (!Object.hasOwn(data, dataId)) {
				pushDiagnostic(
					diagnostics,
					`${manifestPath}#roles[${roleIndex}].reads[${readIndex}]`,
					`Workflow role ${role.id} reads unknown data slot "${dataId}".`,
				);
			}
		}
		for (const [writeIndex, capability] of role.writes.entries()) {
			if (capability === "worktree") continue;
			const dataId = capability.slice("file:".length);
			const slot = data[dataId];
			if (!slot) {
				pushDiagnostic(
					diagnostics,
					`${manifestPath}#roles[${roleIndex}].writes[${writeIndex}]`,
					`Workflow role ${role.id} writes unknown data slot "${dataId}".`,
				);
				continue;
			}
			if (slot.kind !== "file") {
				pushDiagnostic(
					diagnostics,
					`${manifestPath}#roles[${roleIndex}].writes[${writeIndex}]`,
					`Workflow role ${role.id} cannot write non-file data slot "${dataId}".`,
				);
			}
		}
	}
}

function parseWorkflowPrivateSkillFrontmatter(
	content: string,
	skillPath: string,
): ParsedWorkflowPrivateSkillFrontmatterSuccess | WorkflowDefinitionLoadFailure {
	const diagnostics: WorkflowDiagnostic[] = [];
	const match = content.match(/^---\n([\s\S]*?)\n---\n*/);
	if (!match) {
		return pushDiagnostic(
			diagnostics,
			`${skillPath}#frontmatter`,
			"Workflow private skill must begin with a frontmatter block containing at least name and description.",
		);
	}
	const fields = Object.create(null) as Record<string, string>;
	for (const [index, line] of match[1].split("\n").entries()) {
		if (line.trim().length === 0) continue;
		const pair = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
		if (!pair) {
			return pushDiagnostic(
				diagnostics,
				`${skillPath}#frontmatter:${index + 1}`,
				"Workflow private skill frontmatter must use simple `key: value` lines.",
			);
		}
		if (Object.hasOwn(fields, pair[1])) {
			return pushDiagnostic(
				diagnostics,
				`${skillPath}#frontmatter.${pair[1]}`,
				`Duplicate workflow private skill frontmatter field "${pair[1]}".`,
			);
		}
		fields[pair[1]] = pair[2].trim();
	}
	if (!isNonEmptyString(fields.name)) {
		return pushDiagnostic(
			diagnostics,
			`${skillPath}#frontmatter.name`,
			"Workflow private skill frontmatter must include a non-empty `name`.",
		);
	}
	if (!isNonEmptyString(fields.description)) {
		return pushDiagnostic(
			diagnostics,
			`${skillPath}#frontmatter.description`,
			"Workflow private skill frontmatter must include a non-empty `description`.",
		);
	}
	const additionalFields = Object.create(null) as Record<string, string>;
	for (const [key, value] of Object.entries(fields)) {
		if (key === "name" || key === "description") continue;
		additionalFields[key] = value;
	}
	const body = content.slice(match[0].length).trim();
	if (body.length === 0) {
		return pushDiagnostic(
			diagnostics,
			`${skillPath}#body`,
			"Workflow private skill body must not be empty.",
		);
	}
	return {
		status: "ok",
		frontmatter: {
			name: fields.name.trim(),
			description: fields.description.trim(),
			additionalFields,
		},
		body,
	};
}

function resolveSkillPath(
	packagePath: string,
	rawSkillPath: JsonValue | undefined,
	manifestPath: string,
	diagnostics: WorkflowDiagnostic[],
): string | null {
	const pointer = `${manifestPath}#skill`;
	if (!isNonEmptyString(rawSkillPath)) {
		pushDiagnostic(diagnostics, pointer, "Workflow skill path must be a non-empty relative path.");
		return null;
	}
	const skillPathText = rawSkillPath.trim();
	if (isAbsolute(skillPathText)) {
		pushDiagnostic(diagnostics, pointer, "Workflow skill path must stay inside the workflow package.");
		return null;
	}
	const normalizedRepoPath = normalizeRepositoryRelativePath(skillPathText);
	if (!normalizedRepoPath) {
		pushDiagnostic(diagnostics, pointer, "Workflow skill path must stay inside the workflow package.");
		return null;
	}
	const resolvedPath = resolve(packagePath, skillPathText);
	if (!isContainedPath(packagePath, resolvedPath)) {
		pushDiagnostic(diagnostics, pointer, "Workflow skill path must stay inside the workflow package.");
		return null;
	}
	if (!normalizedRepoPath.toLowerCase().endsWith(".md")) {
		pushDiagnostic(diagnostics, pointer, "Workflow skill path must point to a markdown file.");
		return null;
	}
	if (!existsSync(resolvedPath)) {
		pushDiagnostic(diagnostics, resolvedPath, "Workflow private skill file does not exist.");
		return null;
	}
	const canonicalPackagePath = realpathSync(packagePath);
	const canonicalSkillPath = realpathSync(resolvedPath);
	if (!isContainedPath(canonicalPackagePath, canonicalSkillPath)) {
		pushDiagnostic(diagnostics, pointer, "Workflow skill path must not resolve outside the workflow package.");
		return null;
	}
	return canonicalSkillPath;
}

function normalizeWorkflowManifest(
	manifest: JsonValue | undefined,
	packagePath: string,
	manifestPath: string,
): NormalizedManifestSuccess | WorkflowDefinitionLoadFailure {
	const diagnostics: WorkflowDiagnostic[] = [];
	if (!isRecord(manifest) || !hasExactKeys(manifest, ["version", "id", "command", "skill", "data", "roles"])) {
		return pushDiagnostic(
			diagnostics,
			manifestPath,
			"Workflow manifest must contain `version`, `id`, `command`, `skill`, `data`, and `roles` only.",
		);
	}
	if (manifest.version !== WORKFLOW_MANIFEST_VERSION) {
		return pushDiagnostic(
			diagnostics,
			`${manifestPath}#version`,
			`Unsupported workflow manifest version ${String(manifest.version)}.`,
		);
	}
	if (!isNonEmptyString(manifest.id)) {
		return pushDiagnostic(diagnostics, `${manifestPath}#id`, "Workflow ID must be a non-empty string.");
	}
	const id = normalizeNonEmptyString(manifest.id);
	if (!matchesIdentifier(id, WORKFLOW_IDENTIFIER_PATTERN)) {
		pushDiagnostic(
			diagnostics,
			`${manifestPath}#id`,
			"Workflow ID must match the stable lowercase workflow identifier syntax.",
		);
	}
	const command = normalizeCommand(manifest.command, `${manifestPath}#command`, diagnostics);
	const data = normalizeDataSlots(manifest.data, `${manifestPath}#data`, diagnostics);
	const roles = normalizeRoles(manifest.roles, `${manifestPath}#roles`, diagnostics);
	if (!command || !data || !roles) {
		return { status: "invalid", diagnostics };
	}
	validateRoleReferences(data.data, roles, manifestPath, diagnostics);
	const skillPath = resolveSkillPath(packagePath, manifest.skill, manifestPath, diagnostics);
	if (diagnostics.length > 0) return { status: "invalid", diagnostics };
	return {
		status: "ok",
		id,
		command,
		skill: skillPath!,
		data: data.data,
		dataOrder: data.dataOrder,
		roles,
	};
}

export function loadWorkflowDefinitionFromPackage(packagePath: string): WorkflowDefinitionLoadResult {
	const canonicalPackagePath = existsSync(packagePath) ? realpathSync(packagePath) : resolve(packagePath);
	const manifestPath = resolve(canonicalPackagePath, "workflow.json");
	if (!existsSync(manifestPath)) {
		return {
			status: "invalid",
			diagnostics: [{ path: manifestPath, message: "Workflow manifest file does not exist." }],
		};
	}
	let manifestText: string;
	try {
		manifestText = readFileSync(manifestPath, "utf8");
	} catch (error) {
		return {
			status: "invalid",
			diagnostics: [{
				path: manifestPath,
				message: `Unable to read workflow manifest: ${error instanceof Error ? error.message : String(error)}`,
			}],
		};
	}
	let parsedManifest: JsonValue;
	try {
		parsedManifest = JSON.parse(manifestText) as JsonValue;
	} catch (error) {
		return {
			status: "invalid",
			diagnostics: [{
				path: manifestPath,
				message: `Malformed workflow manifest JSON: ${error instanceof Error ? error.message : String(error)}`,
			}],
		};
	}
	const normalizedManifest = normalizeWorkflowManifest(parsedManifest, canonicalPackagePath, manifestPath);
	if (normalizedManifest.status === "invalid") return normalizedManifest;
	let skillText: string;
	try {
		skillText = readFileSync(normalizedManifest.skill, "utf8");
	} catch (error) {
		return {
			status: "invalid",
			diagnostics: [{
				path: normalizedManifest.skill,
				message: `Unable to read workflow private skill: ${error instanceof Error ? error.message : String(error)}`,
			}],
		};
	}
	const parsedSkill = parseWorkflowPrivateSkillFrontmatter(skillText, normalizedManifest.skill);
	if (parsedSkill.status === "invalid") return parsedSkill;

	const roleById = Object.create(null) as Record<string, WorkflowRoleDefinition>;
	for (const role of normalizedManifest.roles) roleById[role.id] = role;

	const definition: NormalizedWorkflowDefinition = {
		version: WORKFLOW_MANIFEST_VERSION,
		id: normalizedManifest.id,
		packagePath: canonicalPackagePath,
		manifestPath,
		manifestHash: hashText(manifestText),
		command: normalizedManifest.command,
		skillPath: normalizedManifest.skill,
		skill: {
			path: normalizedManifest.skill,
			hash: hashText(skillText),
			frontmatter: parsedSkill.frontmatter,
			body: parsedSkill.body,
		},
		data: normalizedManifest.data,
		dataOrder: normalizedManifest.dataOrder,
		roles: normalizedManifest.roles,
		roleIds: normalizedManifest.roles.map((role) => role.id),
		roleById,
	};
	return {
		status: "ok",
		definition: freezeDeep(definition),
	};
}

export function normalizeWorkflowDataValues(
	definition: NormalizedWorkflowDefinition,
	values: Readonly<Record<string, string | undefined>>,
	options: { projectRoot?: string } = {},
): WorkflowWriteResolutionResult {
	const diagnostics: WorkflowDiagnostic[] = [];
	const normalized = Object.create(null) as Record<string, string>;
	const lexicalProjectRoot = options.projectRoot ? resolve(options.projectRoot) : undefined;
	const canonicalProjectRoot = lexicalProjectRoot
		? canonicalizePath(lexicalProjectRoot)
		: undefined;
	for (const [dataId, rawValue] of Object.entries(values)) {
		const slot = definition.data[dataId];
		if (!slot) {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#data.${dataId}`,
				`Unknown workflow data slot "${dataId}".`,
			);
			continue;
		}
		if (!isNonEmptyString(rawValue)) {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#data.${dataId}`,
				`Workflow data slot "${dataId}" must receive a non-empty string value.`,
			);
			continue;
		}
		const value = rawValue.trim();
		if (slot.kind === "string") {
			normalized[dataId] = value;
			continue;
		}
		if (!isAbsolute(value)) {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#data.${dataId}`,
				`Workflow file slot "${dataId}" must use an absolute path value.`,
			);
			continue;
		}
		const lexicalPath = resolve(value);
		if (lexicalProjectRoot && !isContainedPath(lexicalProjectRoot, lexicalPath)) {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#data.${dataId}`,
				`Workflow file slot "${dataId}" path must stay inside the project root.`,
			);
			continue;
		}
		const canonicalPath = canonicalizePath(lexicalPath);
		if (
			!canonicalPath
			|| (
				lexicalProjectRoot
				&& (
					!canonicalProjectRoot
					|| !isContainedPath(canonicalProjectRoot, canonicalPath)
				)
			)
		) {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#data.${dataId}`,
				`Workflow file slot "${dataId}" path must stay inside the project root.`,
			);
			continue;
		}
		if (
			lexicalProjectRoot
			&& slot.constraint
			&& !matchesFileConstraint(lexicalPath, slot.constraint, lexicalProjectRoot)
		) {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#data.${dataId}`,
				`Workflow file slot "${dataId}" path must satisfy its declared repository constraint.`,
			);
			continue;
		}
		normalized[dataId] = canonicalPath;
	}
	if (diagnostics.length > 0) return { status: "invalid", diagnostics };
	return { status: "ok", values: freezeDeep(normalized), writes: [] };
}

export function matchesFileConstraint(
	filePath: string,
	constraint: WorkflowFileConstraint,
	projectRoot: string,
): boolean {
	const absoluteFile = resolve(filePath);
	const absoluteProjectRoot = resolve(projectRoot);
	if (!isContainedPath(absoluteProjectRoot, absoluteFile)) return false;
	const allowedRoot = resolve(absoluteProjectRoot, constraint.under);
	if (!isContainedPath(allowedRoot, absoluteFile)) return false;
	const canonicalFile = canonicalizePath(absoluteFile);
	const canonicalProjectRoot = canonicalizePath(absoluteProjectRoot);
	const canonicalAllowedRoot = canonicalizePath(allowedRoot);
	if (!canonicalFile || !canonicalProjectRoot || !canonicalAllowedRoot) return false;
	if (!isContainedPath(canonicalProjectRoot, canonicalAllowedRoot)) return false;
	if (!isContainedPath(canonicalProjectRoot, canonicalFile)) return false;
	if (!isContainedPath(canonicalAllowedRoot, canonicalFile)) return false;
	return constraint.basename === undefined || basename(canonicalFile) === constraint.basename;
}

export function resolveWorkflowRoleWriteCapabilities(
	definition: NormalizedWorkflowDefinition,
	roleId: string,
	values: WorkflowDataValueMap,
	options: { projectRoot?: string } = {},
): WorkflowWriteResolutionResult {
	const role = definition.roleById[roleId];
	if (!role) {
		return {
			status: "invalid",
			diagnostics: [{
				path: `${definition.manifestPath}#roles`,
				message: `Unknown workflow role "${roleId}".`,
			}],
		};
	}
	const normalizedValues = normalizeWorkflowDataValues(definition, values, options);
	if (normalizedValues.status === "invalid") return normalizedValues;

	const writes: WorkflowResolvedWriteCapability[] = [];
	const diagnostics: WorkflowDiagnostic[] = [];
	const roleIndex = definition.roles.findIndex((candidate) => candidate.id === roleId);
	for (const [writeIndex, capability] of role.writes.entries()) {
		if (capability === "worktree") {
			writes.push({ capability: "worktree", kind: "worktree" });
			continue;
		}
		const slotId = capability.slice("file:".length);
		const slot = definition.data[slotId];
		if (!slot || slot.kind !== "file") {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#roles[${roleIndex}].writes[${writeIndex}]`,
				`Workflow role ${roleId} cannot resolve non-file writable slot "${slotId}".`,
			);
			continue;
		}
		const exactPath = normalizedValues.values[slotId];
		if (exactPath) {
			writes.push({
				capability: capability as `file:${string}`,
				kind: "file",
				slotId,
				label: slot.label,
				exactPath,
			});
			continue;
		}
		if (slot.constraint && isSafeFileConstraint(slot.constraint)) {
			writes.push({
				capability: capability as `file:${string}`,
				kind: "file",
				slotId,
				label: slot.label,
				constraint: slot.constraint,
			});
			continue;
		}
		pushDiagnostic(
			diagnostics,
			`${definition.manifestPath}#roles[${roleIndex}].writes[${writeIndex}]`,
			`Workflow role ${roleId} cannot write slot "${slotId}" without an exact value or a safe repository-relative constraint.`,
		);
	}
	if (diagnostics.length > 0) return { status: "invalid", diagnostics };
	return {
		status: "ok",
		values: normalizedValues.values,
		writes: freezeDeep(writes),
	};
}

export function parseWorkflowPrivateSkill(
	content: string,
	skillPath: string,
): WorkflowPrivateSkill | WorkflowDefinitionLoadFailure {
	const parsed = parseWorkflowPrivateSkillFrontmatter(content, skillPath);
	if (parsed.status === "invalid") return parsed;
	return freezeDeep({
		path: skillPath,
		hash: hashText(content),
		frontmatter: parsed.frontmatter,
		body: parsed.body,
	});
}
