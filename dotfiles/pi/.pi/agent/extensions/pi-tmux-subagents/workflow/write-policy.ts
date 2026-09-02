import {
	captureRepoBoundarySnapshot,
	evaluateRepoBoundarySnapshot,
	type RepoBoundaryDefinition,
	type RepoBoundaryFileRule,
	type RepoState,
} from "../repo-postconditions.ts";
import { resolveWorkflowRoleWriteCapabilities } from "./schema.ts";
import type {
	NormalizedWorkflowDefinition,
	WorkflowDataValueMap,
	WorkflowDiagnostic,
	WorkflowFileConstraint,
	WorkflowResolvedWriteCapability,
} from "./types.ts";

function pushDiagnostic(
	diagnostics: WorkflowDiagnostic[],
	path: string,
	message: string,
): void {
	diagnostics.push({ path, message });
}

function isSafeFileConstraint(constraint: WorkflowFileConstraint): boolean {
	return constraint.under !== "." || constraint.basename !== undefined;
}

export interface WorkflowProtectedExactFile {
	readonly kind: "file";
	readonly slotId: string;
	readonly label: string;
	readonly exactPath: string;
}

export interface WorkflowProtectedConstrainedFile {
	readonly kind: "file";
	readonly slotId: string;
	readonly label: string;
	readonly constraint: WorkflowFileConstraint;
}

export type WorkflowProtectedFile =
	| WorkflowProtectedExactFile
	| WorkflowProtectedConstrainedFile;

export interface WorkflowRoleWritePolicy {
	readonly workflowId: string;
	readonly roleId: string;
	readonly roleLabel: string;
	readonly values: WorkflowDataValueMap;
	readonly resolvedWrites: readonly WorkflowResolvedWriteCapability[];
	readonly protectedFiles: readonly WorkflowProtectedFile[];
}

export interface WorkflowWritePolicyResolutionSuccess {
	readonly status: "ok";
	readonly policy: WorkflowRoleWritePolicy;
}

export interface WorkflowWritePolicyResolutionFailure {
	readonly status: "invalid";
	readonly diagnostics: readonly WorkflowDiagnostic[];
}

export type WorkflowWritePolicyResolutionResult =
	| WorkflowWritePolicyResolutionSuccess
	| WorkflowWritePolicyResolutionFailure;

export interface WorkflowWriteBoundarySnapshot extends WorkflowRoleWritePolicy {
	readonly repoRoot: string;
	readonly before: RepoState;
}

export interface WorkflowWriteBoundaryReport extends WorkflowRoleWritePolicy {
	readonly resolvedRules: RepoBoundaryDefinition;
	readonly allowedPaths: readonly string[];
	readonly unexpectedPaths: readonly string[];
	readonly violated: boolean;
	readonly manualReviewReason?: string;
}

export interface WorkflowWriteBoundaryOutcome {
	readonly details: Record<string, unknown>;
	readonly violationText?: string;
}

function repoBoundaryFileRuleForProtectedFile(rule: WorkflowProtectedFile): RepoBoundaryFileRule {
	return "exactPath" in rule
		? {
			kind: "file",
			slotId: rule.slotId,
			label: rule.label,
			exactPath: rule.exactPath,
		}
		: {
			kind: "file",
			slotId: rule.slotId,
			label: rule.label,
			constraint: rule.constraint,
		};
}

export function repoBoundaryDefinitionForWorkflowWritePolicy(
	policy: WorkflowRoleWritePolicy,
): RepoBoundaryDefinition {
	return {
		allowedRules: policy.resolvedWrites.map((rule) => {
			if (rule.kind === "worktree") {
				return {
					capability: "worktree" as const,
					kind: "worktree" as const,
				};
			}
			if ("exactPath" in rule) {
				return {
					capability: rule.capability,
					kind: "file" as const,
					slotId: rule.slotId,
					label: rule.label,
					exactPath: rule.exactPath,
				};
			}
			return {
				capability: rule.capability,
				kind: "file" as const,
				slotId: rule.slotId,
				label: rule.label,
				constraint: rule.constraint,
			};
		}),
		protectedRules: policy.protectedFiles.map((rule) => repoBoundaryFileRuleForProtectedFile(rule)),
	};
}

export function resolveWorkflowWritePolicy(
	definition: NormalizedWorkflowDefinition,
	roleId: string,
	values: WorkflowDataValueMap,
	options: { projectRoot?: string } = {},
): WorkflowWritePolicyResolutionResult {
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
	const resolved = resolveWorkflowRoleWriteCapabilities(definition, roleId, values, options);
	if (resolved.status === "invalid") return resolved;

	const hasWorktree = resolved.writes.some((rule) => rule.kind === "worktree");
	const diagnostics: WorkflowDiagnostic[] = [];
	const protectedFiles: WorkflowProtectedFile[] = [];
	for (const slotId of definition.dataOrder) {
		const slot = definition.data[slotId];
		if (!slot || slot.kind !== "file") continue;
		const exactPath = resolved.values[slotId];
		if (exactPath) {
			protectedFiles.push({
				kind: "file",
				slotId,
				label: slot.label,
				exactPath,
			});
			continue;
		}
		if (slot.constraint && isSafeFileConstraint(slot.constraint)) {
			protectedFiles.push({
				kind: "file",
				slotId,
				label: slot.label,
				constraint: slot.constraint,
			});
			continue;
		}
		if (hasWorktree) {
			pushDiagnostic(
				diagnostics,
				`${definition.manifestPath}#data.${slotId}`,
				`Workflow role ${roleId} cannot use worktree while file slot "${slotId}" lacks an exact value or safe repository-relative constraint for protection.`,
			);
		}
	}
	if (diagnostics.length > 0) return { status: "invalid", diagnostics };
	return {
		status: "ok",
		policy: {
			workflowId: definition.id,
			roleId: role.id,
			roleLabel: role.label,
			values: resolved.values,
			resolvedWrites: resolved.writes,
			protectedFiles,
		},
	};
}

export function captureWorkflowWriteBoundarySnapshot(
	policy: WorkflowRoleWritePolicy,
	startDir: string,
): WorkflowWriteBoundarySnapshot | undefined {
	const boundary = captureRepoBoundarySnapshot(
		startDir,
		repoBoundaryDefinitionForWorkflowWritePolicy(policy),
	);
	if (!boundary) return undefined;
	return {
		workflowId: policy.workflowId,
		roleId: policy.roleId,
		roleLabel: policy.roleLabel,
		values: policy.values,
		resolvedWrites: policy.resolvedWrites,
		protectedFiles: policy.protectedFiles,
		repoRoot: boundary.repoRoot,
		before: boundary.before,
	};
}

export function evaluateWorkflowWriteBoundarySnapshot(
	snapshot: WorkflowWriteBoundarySnapshot,
	after?: RepoState,
): WorkflowWriteBoundaryReport {
	const resolvedRules = repoBoundaryDefinitionForWorkflowWritePolicy(snapshot);
	const report = evaluateRepoBoundarySnapshot(
		{
			repoRoot: snapshot.repoRoot,
			before: snapshot.before,
			...resolvedRules,
		},
		after,
	);
	const result: WorkflowWriteBoundaryReport = {
		workflowId: snapshot.workflowId,
		roleId: snapshot.roleId,
		roleLabel: snapshot.roleLabel,
		values: snapshot.values,
		resolvedWrites: snapshot.resolvedWrites,
		protectedFiles: snapshot.protectedFiles,
		resolvedRules: {
			allowedRules: report.allowedRules,
			protectedRules: report.protectedRules,
		},
		allowedPaths: report.allowedPaths,
		unexpectedPaths: report.unexpectedPaths,
		violated: report.violated,
	};
	return report.manualReviewReason
		? { ...result, manualReviewReason: report.manualReviewReason }
		: result;
}

/**
 * Shared-service boundary outcome for asynchronous results and child pings.
 * The details are intentionally role-name agnostic and contain every field
 * needed to explain a manifest-driven write-policy decision.
 */
export function describeWorkflowWriteBoundaryReport(
	report: WorkflowWriteBoundaryReport,
): WorkflowWriteBoundaryOutcome {
	const workflowWriteBoundary = {
		workflowId: report.workflowId,
		roleId: report.roleId,
		roleLabel: report.roleLabel,
		resolvedRules: report.resolvedRules,
		allowedPaths: report.allowedPaths,
		unexpectedPaths: report.unexpectedPaths,
		violated: report.violated,
	};
	const details = {
		workflowWriteBoundary: report.manualReviewReason
			? {
				...workflowWriteBoundary,
				manualReviewReason: report.manualReviewReason,
			}
			: workflowWriteBoundary,
	};
	return report.violated
		? {
			details,
			violationText: formatWorkflowWriteBoundaryViolation(report),
		}
		: { details };
}

/**
 * Workflow-facing stop instruction for a violated manifest write policy.
 * Reports exact paths and preserves every repository change for review.
 */
export function formatWorkflowWriteBoundaryViolation(
	report: WorkflowWriteBoundaryReport,
): string {
	if (report.manualReviewReason) {
		return [
			`WORKFLOW WRITE POLICY VIOLATION — MANUAL REVIEW REQUIRED for workflow "${report.workflowId}" role ${report.roleLabel} (${report.roleId}).`,
			"",
			report.manualReviewReason,
			"",
			"Stop the workflow now. Tell the user that repository post-run capture failed and manual review is required.",
			"Every change is preserved exactly as it is. Do not revert, restore, delete, stage, or commit anything,",
			"and do not launch the next role.",
		].join("\n");
	}
	const paths = report.unexpectedPaths.length > 0
		? report.unexpectedPaths.map((path) => `- ${path}`).join("\n")
		: "- (none recorded)";
	return [
		`WORKFLOW WRITE POLICY VIOLATION — workflow "${report.workflowId}" role ${report.roleLabel} (${report.roleId}) changed repository paths outside its declared write capabilities.`,
		"",
		"Unexpected changed paths:",
		paths,
		"",
		"Stop the workflow now. Report these exact paths to the user and wait for their decision.",
		"Every change is preserved exactly as it is. Do not revert, restore, delete, stage, or commit anything,",
		"and do not launch the next role.",
	].join("\n");
}
