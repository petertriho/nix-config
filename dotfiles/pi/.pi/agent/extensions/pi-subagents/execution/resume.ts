import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { classifyProviderFailure } from "../../workflow-provider/failure.ts";
import { getSubagentActivityFile } from "../telemetry/activity.ts";
import {
	buildRolloverHandoff,
	calculateContextFit,
	chooseResumeGateAction,
	estimateSavedSessionContext,
	linkRolloverLineage,
	toContextEstimateRecord,
	type ContextFit,
	type SavedContextEstimate,
} from "../sessions/context-fit.ts";
import {
	normalizeLaunchProfileWorkflowMetadata,
	readLaunchProfile,
	updateLaunchProfile,
	updateProfileAfterSuccessfulResponse,
	type LaunchProfile,
} from "../../workflow-provider/launch-profile.ts";
import { resolveModelPolicy, type ResolvedModelSelection } from "../../workflow-provider/model-picker.ts";
import {
	diffResourceFingerprints,
	primarySkillChanged,
	resolveResumeRestoration,
	resourceChangeNotice,
} from "../sessions/resume-restore.ts";
import { findLastAssistantMessage, getNewEntries } from "../sessions/session.ts";
import { createStatusState } from "../telemetry/status.ts";
import { shellEscape } from "../adapters/tmux.ts";
import { fileTimestamp, getArtifactDir, toSafeFileName } from "./artifacts.ts";
import type { createLaunchService } from "./launch.ts";
import type { createLifecycleServices } from "./lifecycle.ts";
import type { createProfileResourceServices } from "./profile-resources.ts";
import { buildResumePiArgs } from "./prompts.ts";
import { getShellReadyDelayMs, resolveResultPresentation, resolveUsageDetails } from "./results.ts";
import type {
	LaunchContext,
	ResumeLifecycleContext,
	ResumeRecoveryContext,
	RunningSubagent,
	SubagentResumeParams,
	SubagentServiceDependencies,
	SubagentToolResult,
} from "./types.ts";
import type { createWatchServices } from "./watch.ts";

export interface ResumeExecutionDependencies {
	resolvePrimarySkill: ReturnType<typeof createProfileResourceServices>["resolvePrimarySkill"];
	collectResourceFingerprints: ReturnType<typeof createProfileResourceServices>["collectResourceFingerprints"];
	launchSubagent: ReturnType<typeof createLaunchService>;
	watchInBackground: ReturnType<typeof createWatchServices>["watchInBackground"];
	captureSessionOwnership: ReturnType<typeof createLifecycleServices>["captureSessionOwnership"];
	cleanupFailedPostLaunch: ReturnType<typeof createLifecycleServices>["cleanupFailedPostLaunch"];
}

export function createResumeService(
	deps: SubagentServiceDependencies,
	services: ResumeExecutionDependencies,
) {
	const {
		resolvePrimarySkill,
		collectResourceFingerprints,
		launchSubagent,
		watchInBackground,
		captureSessionOwnership,
		cleanupFailedPostLaunch,
	} = services;

	async function executeSubagentResume(
		pi: ExtensionAPI,
		params: SubagentResumeParams,
		ctx: LaunchContext & Parameters<typeof resolveModelPolicy>[1],
		recovery?: ResumeRecoveryContext,
		lifecycle?: ResumeLifecycleContext,
	): Promise<SubagentToolResult> {
		const ownsSession = captureSessionOwnership(ctx);
		const isOwned = () => ownsSession() && lifecycle?.isOwned?.() !== false;
		const assertOwned = () => {
			if (!ownsSession()) {
				throw new Error("Subagent resume interrupted by session change or shutdown; saved files are preserved.");
			}
			if (lifecycle?.isOwned?.() === false) {
				throw new Error("Workflow resume interrupted by branch navigation; saved files are preserved.");
			}
		};
		const name = params.name ?? "Resume";
		const startTime = Date.now();
		const id = Math.random().toString(16).slice(2, 10);

		if (!existsSync(params.sessionPath)) {
			return {
				content: [
					{ type: "text", text: `Error: session file not found: ${params.sessionPath}` },
				],
				details: { error: "session not found" },
			};
		}

		let profileRead = readLaunchProfile(params.sessionPath);
		if (profileRead.status === "invalid") {
			return {
				content: [{ type: "text", text: `Error: ${profileRead.error}` }],
				details: { error: "invalid launch profile" },
			};
		}
		if (profileRead.status === "ok" && lifecycle?.workflowMetadata) {
			try {
				const workflow = normalizeLaunchProfileWorkflowMetadata(
					lifecycle.workflowMetadata,
				);
				const profile = updateLaunchProfile(params.sessionPath, (stored) => ({
					...stored,
					workflow,
				}));
				profileRead = { status: "ok", profile };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: could not update workflow metadata: ${message}` }],
					details: { error: "workflow metadata update failed", message },
				};
			}
		}

		const restoration = resolveResumeRestoration(
			profileRead.status === "ok" ? profileRead.profile : null,
			params,
		);
		const { autoExit, interactive } = restoration;
		const resumeWarnings: string[] = [];
		let freshForPrimarySkillChange = false;
		if (restoration.legacyWarning) {
			resumeWarnings.push(restoration.legacyWarning);
			await ctx.ui?.notify?.(restoration.legacyWarning, "warning");
		}

		const currentResources = collectResourceFingerprints(
			pi,
			profileRead.status === "ok" ? profileRead.profile.stable.primarySkill?.name : undefined,
		);
		if (profileRead.status === "ok") {
			const resourceChanges = diffResourceFingerprints(
				profileRead.profile.resources,
				currentResources,
			);
			const notice = resourceChangeNotice(resourceChanges);
			if (notice) {
				resumeWarnings.push(notice);
				await ctx.ui?.notify?.(`Resume uses current resources: ${notice}`, "info");
			}

			const currentPrimarySkill = restoration.agentDir
				? resolvePrimarySkill(
					profileRead.profile.stable.primarySkill?.name,
					restoration.cwd,
					restoration.agentDir,
				)
				: undefined;
			if (
				profileRead.profile.stable.primarySkill
				&& primarySkillChanged(profileRead.profile, currentPrimarySkill)
			) {
				const choice = await ctx.ui?.select?.(
					`The ${profileRead.profile.stable.primarySkill.name} skill definition changed since this session was launched.`,
					[
						"Resume with the older instructions",
						"Start a fresh same-role session with the latest skill",
						"Stop this resume",
					],
				);
				if (choice === "Start a fresh same-role session with the latest skill") {
					freshForPrimarySkillChange = true;
				} else if (choice !== "Resume with the older instructions") {
					return {
						content: [{
							type: "text",
							text: "Resume cancelled because the primary skill definition changed.",
						}],
						details: {
							error: "primary skill changed",
							skill: profileRead.profile.stable.primarySkill.name,
						},
					};
				}
			}
		}

		const profile = profileRead.status === "ok" ? profileRead.profile : null;

		let estimate: SavedContextEstimate | undefined;
		try {
			estimate = estimateSavedSessionContext(params.sessionPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			resumeWarnings.push(`Context estimate unavailable (${message}); rollover gate skipped.`);
		}

		let resolvedModel: ResolvedModelSelection | undefined;
		let fit: ContextFit | undefined;
		let rollover: { profile: LaunchProfile; selection: ResolvedModelSelection } | undefined;
		let modelPolicy = params.model;
		const resumeSubject = recovery?.pickerSubject ?? params.name ?? profile?.stable.displayName ?? "subagent";
		const lastModel = profile?.runtime.lastModel;
		const pickerPrompt = {
			title: recovery?.pickerTitle ?? `Resume model for ${resumeSubject}`,
			subject: resumeSubject,
			...(lastModel
				? {
					currentRef: `${lastModel.provider}/${lastModel.model}${lastModel.thinking ? `:${lastModel.thinking}` : ""}`,
				}
				: {}),
		};
		while (true) {
			try {
				const resolution = await resolveModelPolicy(modelPolicy, ctx, {
					mode: "resume",
					...(profile ? { profile } : {}),
					...(estimate ? { contextTokens: estimate.tokens } : {}),
					picker: pickerPrompt,
				});
				if (resolution.source === "legacy") {
					resolvedModel = undefined;
					fit = undefined;
				} else {
					resolvedModel = resolution;
					const contextWindow = resolution.model.contextWindow;
					fit =
						estimate && Number.isFinite(contextWindow) && contextWindow > 0
							? calculateContextFit(estimate.tokens, contextWindow)
							: undefined;
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
					details: { error: "model selection failed", message },
				};
			}

			if (freshForPrimarySkillChange) {
				if (!profile || !resolvedModel) {
					return {
						content: [{
							type: "text",
							text: "Error: a fresh latest-skill rollover needs a launch-profile sidecar and a selected model.",
						}],
						details: { error: "primary skill rollover unavailable" },
					};
				}
				rollover = { profile, selection: resolvedModel };
				break;
			}

			if (!fit?.requiresGate) break;

			let action: Awaited<ReturnType<typeof chooseResumeGateAction>>;
			try {
				action = await chooseResumeGateAction(ctx, fit);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
					details: { error: "context gate unavailable", message },
				};
			}
			if (action === "choose") {
				modelPolicy = "pick";
				continue;
			}
			if (action === "stop") {
				return {
					content: [{
						type: "text",
						text: "Resume cancelled at the context-fit gate. The saved session was not changed.",
					}],
					details: {
						error: "resume cancelled at context gate",
						contextRatio: fit.ratio,
						...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
					},
				};
			}
			if (action === "fresh") {
				if (!profile || !resolvedModel) {
					return {
						content: [{
							type: "text",
							text: "Error: a fresh same-role rollover needs a launch-profile sidecar and a selected model. Choose 'Resume the saved session anyway' or 'Choose another model'.",
						}],
						details: { error: "rollover unavailable without sidecar" },
					};
				}
				rollover = { profile, selection: resolvedModel };
			}
			break;
		}

		assertOwned();
		if (!deps.isTmuxAvailable()) {
			return deps.muxUnavailableResult();
		}

		const executionDetails = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
			...(lifecycle?.details ?? {}),
			...(recovery?.details ?? {}),
			...extra,
		});

		if (rollover) {
			const rolloverProfile = rollover.profile;
			const sourceWorkflow = lifecycle?.workflowMetadata ?? rolloverProfile.workflow;
			const baseWorkflow = sourceWorkflow
				? {
					...sourceWorkflow,
					currentDefault: rollover.selection.selection,
				}
				: undefined;
			const workflowMetadata = baseWorkflow && recovery?.transformWorkflowMetadata
				? recovery.transformWorkflowMetadata(baseWorkflow, rollover.selection)
				: baseWorkflow;
			const running = await launchSubagent(
				{
					name: params.name ?? rolloverProfile.stable.displayName,
					task: lifecycle?.rolloverMessage
						?? buildRolloverHandoff(rolloverProfile, params.message),
					systemPrompt: rolloverProfile.stable.roleBody || undefined,
					cwd: rolloverProfile.stable.cwd,
				},
				{ ...ctx, pi },
				{
					resolvedModel: rollover.selection,
					rolloverFrom: rolloverProfile,
					beforeLaunch: lifecycle?.beforeLaunch,
					...(workflowMetadata ? { workflow: workflowMetadata } : {}),
				},
			);

			let lineageWarnings: string[] = [];
			let watcherAbort: AbortController | undefined;
			try {
				watcherAbort = watchInBackground({
					isOwned,
					pi,
					ctx,
					running,
					pingAgent: rolloverProfile.stable.agentName,
					pingSessionPath: running.sessionFile,
					onPing: async ({ result }) => {
						await lifecycle?.onResult?.({
							result,
							replacement: true,
							originalSessionPath: params.sessionPath,
							sessionPath: running.sessionFile,
						});
					},
					onSuccess: async ({ result }) => {
						if (
							recovery
							&& result.exitCode === 0
							&& !result.errorMessage
							&& result.responded
						) {
							await recovery.onSuccessfulResponse?.(rollover.selection.selection);
						}
						await lifecycle?.onResult?.({
							result,
							replacement: true,
							originalSessionPath: params.sessionPath,
							sessionPath: running.sessionFile,
						});

						const usage = resolveUsageDetails(result, ctx);
						const base = resolveResultPresentation(
							{ ...result, ...(usage ? { usage } : {}) },
							running.name,
						);
						return {
							content: base,
							details: executionDetails({
								name: running.name,
								task: running.task,
								agent: rolloverProfile.stable.agentName,
								exitCode: result.exitCode,
								elapsed: result.elapsed,
								sessionFile: running.sessionFile,
								rollover: "fresh",
								originalSessionPath: params.sessionPath,
								...(usage ? { usage } : {}),
								...(result.errorMessage
									? {
										errorMessage: result.errorMessage,
										failureKind: classifyProviderFailure(result.errorMessage),
									}
									: {}),
							}),
						};
					},
					onError: async (message) => {
						await lifecycle?.onError?.({
							message,
							replacement: true,
							originalSessionPath: params.sessionPath,
							sessionPath: running.sessionFile,
						});
						return {
							content: `Rollover "${running.name}" error: ${message}`,
							details: executionDetails({
								name: running.name,
								error: message,
								rollover: "fresh",
								originalSessionPath: params.sessionPath,
							}),
						};
					},
				});

				await lifecycle?.onLaunched?.({
					running,
					selection: resolvedModel?.selection,
					userSelectedModel: resolvedModel?.source === "picker",
					replacement: true,
					originalSessionPath: params.sessionPath,
					sessionPath: running.sessionFile,
				});
				assertOwned();
				await deps.onRolloverLaunched?.({
					running,
					rolloverProfile,
					params,
					...(recovery ? { recovery } : {}),
				});
				assertOwned();

				lineageWarnings = linkRolloverLineage(params.sessionPath, running.sessionFile);
				if (lineageWarnings.length > 0) {
					await ctx.ui?.notify?.(
						`Rollover lineage incomplete: ${lineageWarnings.join("; ")}`,
						"warning",
					);
				}
			} catch (error) {
				cleanupFailedPostLaunch(running, watcherAbort);
				throw error;
			}

			return {
				content: [{
					type: "text",
					text:
						`Fresh same-role session "${running.name}" launched in place of the saved conversation. `
						+ "It does not inherit the old conversation; it continues from the role snapshot and handoff artifacts.\n\n"
						+ `Replacement session: ${running.sessionFile}\n`
						+ `Replaced session: ${params.sessionPath}`,
				}],
				details: executionDetails({
					id: running.id,
					name: running.name,
					status: "started",
					rollover: "fresh",
					originalSessionPath: params.sessionPath,
					replacementSessionPath: running.sessionFile,
					sessionFile: running.sessionFile,
					launchScriptFile: running.launchScriptFile,
					...(lineageWarnings.length > 0 ? { lineageWarnings } : {}),
					...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
				}),
			};
		}

		lifecycle?.beforeLaunch?.(restoration.cwd ?? ctx.cwd, params.sessionPath);
		const entryCountBefore = getNewEntries(params.sessionPath, 0).length;
		const surface = deps.createSurface(name);
		await new Promise<void>((resolve) => setTimeout(resolve, getShellReadyDelayMs()));

		const parts = buildResumePiArgs(params.sessionPath, resolvedModel?.argument);
		const subagentDonePath = join(deps.subagentsDir, "subagent-done.ts");
		parts.push("-e", shellEscape(subagentDonePath));

		const sessionId = ctx.sessionManager.getSessionId();
		const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), sessionId);
		const activityFile = getSubagentActivityFile(artifactDir, id);
		mkdirSync(dirname(activityFile), { recursive: true });

		const safeName = toSafeFileName(name, "resume");
		if (
			restoration.roleBody
			&& (restoration.systemPromptMode === "append" || restoration.systemPromptMode === "replace")
		) {
			const flag = restoration.systemPromptMode === "replace"
				? "--system-prompt"
				: "--append-system-prompt";
			const syspromptPath = join(
				artifactDir,
				"subagent-resume",
				`${safeName}-${id}-sysprompt-${fileTimestamp()}.md`,
			);
			mkdirSync(dirname(syspromptPath), { recursive: true });
			writeFileSync(syspromptPath, restoration.roleBody, "utf8");
			parts.push(flag, shellEscape(syspromptPath));
		}

		let resumeMsgFile: string | undefined;
		if (params.message) {
			resumeMsgFile = join(artifactDir, "subagent-resume", `${safeName}-${id}-${fileTimestamp()}.md`);
			mkdirSync(dirname(resumeMsgFile), { recursive: true });
			writeFileSync(resumeMsgFile, params.message, "utf8");
			parts.push(shellEscape(`@${resumeMsgFile}`));
		}

		const resumeEnvParts: string[] = [];
		if (restoration.agentDir && existsSync(restoration.agentDir)) {
			resumeEnvParts.push(`PI_CODING_AGENT_DIR=${shellEscape(restoration.agentDir)}`);
		} else if (process.env.PI_CODING_AGENT_DIR) {
			resumeEnvParts.push(`PI_CODING_AGENT_DIR=${shellEscape(process.env.PI_CODING_AGENT_DIR)}`);
		}
		if (restoration.denyTools.length > 0) {
			resumeEnvParts.push(`PI_DENY_TOOLS=${shellEscape(restoration.denyTools.join(","))}`);
		}
		resumeEnvParts.push(`PI_SUBAGENT_NAME=${shellEscape(name)}`);
		if (restoration.agentName) {
			resumeEnvParts.push(`PI_SUBAGENT_AGENT=${shellEscape(restoration.agentName)}`);
		}
		resumeEnvParts.push(`PI_SUBAGENT_SESSION=${shellEscape(params.sessionPath)}`);
		resumeEnvParts.push(`PI_SUBAGENT_ID=${shellEscape(id)}`);
		resumeEnvParts.push(`PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(activityFile)}`);
		if (autoExit) {
			resumeEnvParts.push("PI_SUBAGENT_AUTO_EXIT=1");
		}
		const resumeEnvPrefix = resumeEnvParts.join(" ") + " ";

		const resumeCommand = parts.join(" ");
		const cdPrefix = restoration.cwd ? `cd ${shellEscape(restoration.cwd)} && ` : "";
		const command = `${cdPrefix}${resumeEnvPrefix}${resumeCommand}; echo '__SUBAGENT_DONE_'$?'__'`;
		const launchScriptFile = join(artifactDir, "subagent-scripts", `${safeName}-resume-${id}-${Date.now()}.sh`);
		deps.sendLongCommand(surface, command, {
			scriptPath: launchScriptFile,
			scriptPreamble: [
				`# Subagent resume script for ${name}`,
				`# Generated: ${new Date().toISOString()}`,
				`# Session: ${params.sessionPath}`,
				`# Surface: ${surface}`,
				...(resumeMsgFile ? [`# Resume message file: ${resumeMsgFile}`] : []),
			].join("\n"),
		});

		const running: RunningSubagent = {
			id,
			name,
			task: params.message ?? "resumed session",
			surface,
			startTime,
			sessionFile: params.sessionPath,
			launchScriptFile,
			activityFile,
			interactive,
			...(lifecycle?.workflowMetadata ? { workflowSummaryStartLine: entryCountBefore } : {}),
			statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
		};
		deps.runningSubagents.set(id, running);
		let watcherAbort: AbortController | undefined;
		try {
			watcherAbort = watchInBackground({
				isOwned,
				pi,
				ctx,
				running,
				pingSessionPath: params.sessionPath,
				onPing: async ({ result }) => {
					await lifecycle?.onResult?.({
						result,
						replacement: false,
						originalSessionPath: params.sessionPath,
						sessionPath: params.sessionPath,
					});
				},
				onSuccess: async ({ result }) => {
					const newEntries = getNewEntries(params.sessionPath, entryCountBefore);
					const assistantResponse = findLastAssistantMessage(newEntries);
					if (
						profileRead.status === "ok"
						&& result.exitCode === 0
						&& !result.errorMessage
						&& assistantResponse !== null
					) {
						try {
							updateLaunchProfile(params.sessionPath, (stored) =>
								updateProfileAfterSuccessfulResponse(stored, {
									...(resolvedModel?.selection ? { selection: resolvedModel.selection } : {}),
									resources: currentResources,
									...(fit ? { contextEstimate: toContextEstimateRecord(fit) } : {}),
									...(recovery ? { previousFailure: recovery.failure } : {}),
								}));
						} catch {
							// A profile write failure must not hide the completed response.
						}
						if (recovery && resolvedModel?.selection) {
							await recovery.onSuccessfulResponse?.(resolvedModel.selection);
						}
					}
					await lifecycle?.onResult?.({
						result,
						replacement: false,
						originalSessionPath: params.sessionPath,
						sessionPath: params.sessionPath,
					});
					const summary =
						assistantResponse ??
						(result.errorMessage
							? `Subagent error: ${result.errorMessage}`
							: result.exitCode === 0
								? "Resumed session exited without new output"
								: `Resumed session exited with code ${result.exitCode}`);
					const usage = resolveUsageDetails(result, ctx);
					const presentation = resolveResultPresentation(
						{ ...result, summary, sessionFile: params.sessionPath, ...(usage ? { usage } : {}) },
						name,
					);

					return {
						content: presentation,
						details: executionDetails({
							name,
							task: params.message ?? "resumed session",
							exitCode: result.exitCode,
							elapsed: result.elapsed,
							sessionFile: params.sessionPath,
							...(result.errorMessage
								? {
									errorMessage: result.errorMessage,
									failureKind: classifyProviderFailure(result.errorMessage),
								}
								: {}),
							...(usage ? { usage } : {}),
						}),
					};
				},
				onError: async (message) => {
					await lifecycle?.onError?.({
						message,
						replacement: false,
						originalSessionPath: params.sessionPath,
						sessionPath: params.sessionPath,
					});
					return {
						content: `Resume error: ${message}`,
						details: executionDetails({ name, error: message }),
					};
				},
			});

			await lifecycle?.onLaunched?.({
				running,
				selection: resolvedModel?.selection,
				userSelectedModel: resolvedModel?.source === "picker",
				replacement: false,
				originalSessionPath: params.sessionPath,
				sessionPath: params.sessionPath,
			});
			assertOwned();
		} catch (error) {
			cleanupFailedPostLaunch(running, watcherAbort);
			throw error;
		}

		return {
			content: [{ type: "text", text: `Session "${name}" resumed.` }],
			details: executionDetails({
				id,
				name,
				sessionPath: params.sessionPath,
				launchScriptFile,
				status: "started",
				...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
			}),
		};
	}

	return executeSubagentResume;
}
