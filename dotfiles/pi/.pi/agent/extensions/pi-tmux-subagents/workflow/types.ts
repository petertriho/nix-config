import type { ModelSelection } from "../launch-profile.ts";

export const WORKFLOW_MANIFEST_VERSION = 1 as const;
export const WORKFLOW_RUN_SNAPSHOT_VERSION = 1 as const;

/**
 * Workflow, command, and role identifiers stay user-facing and stable, so v1
 * keeps them lowercase with optional digits and hyphen separators.
 */
export const WORKFLOW_IDENTIFIER_PATTERN = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Data slot identifiers follow the same lowercase start rule but permit later
 * camelCase segments for author-friendly scalar and artifact identifiers.
 */
export const WORKFLOW_DATA_IDENTIFIER_PATTERN = /^[a-z](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

export type WorkflowManifestVersion = typeof WORKFLOW_MANIFEST_VERSION;
export type WorkflowWriteCapability = "worktree" | `file:${string}`;
export type WorkflowDataValueMap = Partial<Record<string, string>>;
export type WorkflowRoleModelSelection = Readonly<ModelSelection>;
export type WorkflowSourceScope = "bundled" | "global" | "project";
export type WorkflowRunStatus = "active" | "completed" | "aborted";
export type WorkflowRunLaunchStatus =
	| "starting"
	| "running"
	| "completed"
	| "failed"
	| "interrupted";
export type WorkflowRunModelPolicy = "parent-per-role" | "per-role";
export type WorkflowRunAssignmentSource =
	| "parent"
	| "configured"
	| "preset"
	| "preset-edited";

export interface WorkflowDiagnostic {
	readonly path: string;
	readonly message: string;
}

export interface WorkflowCommandDefinition {
	readonly name: string;
	readonly description: string;
	readonly argumentHint?: string;
}

export interface WorkflowFileConstraint {
	readonly under: string;
	readonly basename?: string;
}

export interface WorkflowDataSlotBase {
	readonly id: string;
	readonly label: string;
}

export interface WorkflowFileDataSlot extends WorkflowDataSlotBase {
	readonly kind: "file";
	readonly constraint?: WorkflowFileConstraint;
}

export interface WorkflowStringDataSlot extends WorkflowDataSlotBase {
	readonly kind: "string";
}

export type WorkflowDataSlot = WorkflowFileDataSlot | WorkflowStringDataSlot;

export interface WorkflowRoleDefinition {
	readonly id: string;
	readonly label: string;
	readonly agent: string;
	readonly reads: readonly string[];
	readonly writes: readonly WorkflowWriteCapability[];
	readonly handoff: string;
}

export interface WorkflowPrivateSkillFrontmatter {
	readonly name: string;
	readonly description: string;
	readonly additionalFields: Readonly<Record<string, string>>;
}

export interface WorkflowPrivateSkill {
	readonly path: string;
	readonly hash: string;
	readonly frontmatter: WorkflowPrivateSkillFrontmatter;
	readonly body: string;
}

export interface NormalizedWorkflowDefinition {
	readonly version: WorkflowManifestVersion;
	readonly id: string;
	readonly packagePath: string;
	readonly manifestPath: string;
	readonly manifestHash: string;
	readonly command: WorkflowCommandDefinition;
	readonly skillPath: string;
	readonly skill: WorkflowPrivateSkill;
	readonly data: Readonly<Record<string, WorkflowDataSlot>>;
	readonly dataOrder: readonly string[];
	readonly roles: readonly WorkflowRoleDefinition[];
	readonly roleIds: readonly string[];
	readonly roleById: Readonly<Record<string, WorkflowRoleDefinition>>;
}

export interface WorkflowDefinitionLoadSuccess {
	readonly status: "ok";
	readonly definition: NormalizedWorkflowDefinition;
}

export interface WorkflowDefinitionLoadFailure {
	readonly status: "invalid";
	readonly diagnostics: readonly WorkflowDiagnostic[];
}

export type WorkflowDefinitionLoadResult =
	| WorkflowDefinitionLoadSuccess
	| WorkflowDefinitionLoadFailure;

export interface WorkflowRoleSessionSnapshot {
	readonly current?: string;
	readonly history: readonly string[];
}

export interface WorkflowRunActiveLaunch {
	readonly roleId: string;
	readonly sessionPath?: string;
	readonly status: WorkflowRunLaunchStatus;
}

export interface WorkflowRunSnapshot {
	readonly version: typeof WORKFLOW_RUN_SNAPSHOT_VERSION;
	readonly runId: string;
	readonly workflowId: string;
	readonly status: WorkflowRunStatus;
	readonly projectRoot: string;
	readonly packagePath: string;
	readonly source: WorkflowSourceScope;
	readonly definition: NormalizedWorkflowDefinition;
	readonly manifestHash: string;
	readonly skillHash: string;
	readonly policy: WorkflowRunModelPolicy;
	readonly assignmentSource: WorkflowRunAssignmentSource;
	readonly originalAssignments?: Readonly<Record<string, WorkflowRoleModelSelection>>;
	readonly currentAssignments?: Readonly<Record<string, WorkflowRoleModelSelection>>;
	readonly data: WorkflowDataValueMap;
	readonly roleSessions: Readonly<Record<string, WorkflowRoleSessionSnapshot>>;
	readonly activeLaunch?: WorkflowRunActiveLaunch;
	readonly startedAt: string;
	readonly updatedAt: string;
	readonly finishedAt?: string;
}

export interface WorkflowRunStatusSummary {
	readonly active: boolean;
	readonly interrupted: boolean;
	readonly runId?: string;
	readonly workflowId?: string;
	readonly status?: WorkflowRunStatus;
	readonly projectRoot?: string;
	readonly packagePath?: string;
	readonly source?: WorkflowSourceScope;
	readonly startedAt?: string;
	readonly updatedAt?: string;
	readonly finishedAt?: string;
	readonly currentRoleSessions: Readonly<Record<string, string>>;
	readonly activeLaunch?: {
		readonly roleId: string;
		readonly roleLabel?: string;
		readonly sessionPath?: string;
		readonly status: WorkflowRunLaunchStatus;
		readonly interrupted: boolean;
	};
}

export interface WorkflowResolvedWorktreeWrite {
	readonly capability: "worktree";
	readonly kind: "worktree";
}

export interface WorkflowResolvedExactFileWrite {
	readonly capability: `file:${string}`;
	readonly kind: "file";
	readonly slotId: string;
	readonly label: string;
	readonly exactPath: string;
}

export interface WorkflowResolvedConstrainedFileWrite {
	readonly capability: `file:${string}`;
	readonly kind: "file";
	readonly slotId: string;
	readonly label: string;
	readonly constraint: WorkflowFileConstraint;
}

export type WorkflowResolvedWriteCapability =
	| WorkflowResolvedWorktreeWrite
	| WorkflowResolvedExactFileWrite
	| WorkflowResolvedConstrainedFileWrite;

export interface WorkflowWriteResolutionSuccess {
	readonly status: "ok";
	readonly values: WorkflowDataValueMap;
	readonly writes: readonly WorkflowResolvedWriteCapability[];
}

export interface WorkflowWriteResolutionFailure {
	readonly status: "invalid";
	readonly diagnostics: readonly WorkflowDiagnostic[];
}

export type WorkflowWriteResolutionResult =
	| WorkflowWriteResolutionSuccess
	| WorkflowWriteResolutionFailure;
