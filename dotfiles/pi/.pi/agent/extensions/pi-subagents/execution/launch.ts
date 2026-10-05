import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getSubagentActivityFile } from "../telemetry/activity.ts";
import {
	removeLaunchProfile,
	writeLaunchProfile,
	type LaunchProfile,
	type LaunchProfileWorkflowMetadata,
} from "./launch-profile.ts";
import type { ResolvedModelSelection } from "../profiles/model-picker.ts";
import { resolvePiModelSelection } from "../profiles/launch-policy.ts";
import { getNewEntries, seedSubagentSessionFile } from "../sessions/session.ts";
import { createStatusState } from "../telemetry/status.ts";
import { resolveTaskDiskCandidate } from "../tasks/disk-policy.ts";
import { shellEscape } from "../adapters/tmux.ts";
import { fileTimestamp, getArtifactDir, getDefaultSessionDirFor, toSafeFileName } from "./artifacts.ts";
import type { createProfileResourceServices } from "./profile-resources.ts";
import type { createLifecycleServices } from "./lifecycle.ts";
import { buildSubagentToolAllowlist } from "./prompts.ts";
import { buildPiCommand, type PiCommandArgument } from "./pi-command.ts";
import { getShellReadyDelayMs } from "./results.ts";
import type {
	LaunchContext,
	ResumeLifecycleContext,
	RunningSubagent,
	SubagentLaunchParams,
	SubagentServiceDependencies,
	TaskRuntimeOptions,
	TeamLaunchSpec,
} from "./types.ts";

export function createLaunchService(
	deps: SubagentServiceDependencies,
	profiles: Pick<ReturnType<typeof createProfileResourceServices>, "buildLaunchProfile" | "collectResourceFingerprints">,
	lifecycle: Pick<ReturnType<typeof createLifecycleServices>, "captureSessionOwnership">,
) {
	const { buildLaunchProfile, collectResourceFingerprints } = profiles;

	async function launchSubagent(
		rawParams: SubagentLaunchParams,
		ctx: LaunchContext,
		options?: {
			surface?: string;
			workflow?: LaunchProfileWorkflowMetadata;
			beforeLaunch?: ResumeLifecycleContext["beforeLaunch"];
			resolvedModel?: ResolvedModelSelection;
			rolloverFrom?: LaunchProfile;
			taskRuntime?: TaskRuntimeOptions;
			team?: TeamLaunchSpec;
			signal?: AbortSignal;
			isOwned?: () => boolean;
		},
	): Promise<RunningSubagent> {
		const ownsSession = lifecycle.captureSessionOwnership(ctx);
		const assertOwned = () => {
			if (options?.signal?.aborted) throw new Error("Subagent launch cancelled.");
			if (!ownsSession() || options?.isOwned?.() === false) {
				throw new Error("Subagent launch interrupted by navigation or shutdown.");
			}
		};
		assertOwned();
		const params = deps.normalizeSubagentParams(rawParams);
		const startTime = Date.now();
		const id = Math.random().toString(16).slice(2, 10);

		const rollover = options?.rolloverFrom;
		const taskRuntime = options?.taskRuntime;
		const team = options?.team;
		if (team && (rollover || taskRuntime || params.fork)) {
			throw new Error("A teammate cannot be a workflow task, rollover or fork");
		}
		if (taskRuntime) {
			if (rollover) throw new Error("Task launches cannot be rollovers.");
			const maxTurns = taskRuntime.maxTurns;
			if (
				maxTurns != null
				&& (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1)
			) {
				throw new Error(
					`Invalid task maxTurns ${String(maxTurns)}: pass a positive integer or omit it for unlimited.`,
				);
			}
		}
		const agentDefs = !rollover && params.agent ? deps.loadAgentDefaults(params.agent) : null;
		const configuredModel = options?.resolvedModel
			? options.resolvedModel.selection.model
			: params.model ?? agentDefs?.model;
		const effectiveTools = rollover ? undefined : params.tools ?? agentDefs?.tools;
		const effectiveSkills = rollover
			? rollover.stable.primarySkill?.name
			: params.skills ?? agentDefs?.skills;
		const effectiveInteractive = team ? true : rollover
			? rollover.stable.controls.interactive
			: taskRuntime
				? false
				: deps.resolveEffectiveInteractive(params, agentDefs);
		const autoExitForChild = team ? false : rollover
			? rollover.stable.controls.autoExit
			: taskRuntime
				? true
				: agentDefs?.autoExit;

		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) throw new Error("No session file");
		const parentLeafId = ctx.sessionManager.getLeafId?.();
		const sessionId = ctx.sessionManager.getSessionId();
		const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), sessionId);

		const resolvedPaths = deps.resolveSubagentPaths(params, agentDefs);
		// A child must not inherit an unrelated tmux pane's shell cwd.
		const effectiveCwd = resolvedPaths.effectiveCwd ?? ctx.cwd;
		const effectiveAgentDir = rollover ? rollover.stable.agentDir : resolvedPaths.effectiveAgentDir;
		const localAgentDir = rollover
			? (existsSync(rollover.stable.agentDir) ? rollover.stable.agentDir : null)
			: resolvedPaths.localAgentDir;
		const targetCwdForSession = effectiveCwd;
		options?.beforeLaunch?.(targetCwdForSession);
		const sessionDir = getDefaultSessionDirFor(targetCwdForSession, effectiveAgentDir);

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23) + "Z";
		const uuid = [
			id,
			Math.random().toString(16).slice(2, 10),
			Math.random().toString(16).slice(2, 10),
			Math.random().toString(16).slice(2, 6),
		].join("-");
		const subagentSessionFile = team?.childSessionFile ?? join(sessionDir, `${timestamp}_${uuid}.jsonl`);
		if (team && (dirname(subagentSessionFile) !== sessionDir || existsSync(subagentSessionFile))) {
			throw new Error("Teammate session path is not a fresh file in its resolved session directory");
		}

		const surfacePreCreated = options?.surface != null;
		assertOwned();
		const surface = options?.surface ?? deps.createSurface(params.name);
		try {
			if (!surfacePreCreated) {
				await new Promise<void>((resolve) => setTimeout(resolve, getShellReadyDelayMs()));
			}
			assertOwned();

			const launchBehavior = deps.resolveLaunchBehavior(params, agentDefs);

			if (launchBehavior.seededSessionMode) {
				seedSubagentSessionFile({
					mode: launchBehavior.seededSessionMode,
					parentSessionFile: sessionFile,
					parentLeafId,
					childSessionFile: subagentSessionFile,
					childCwd: targetCwdForSession,
				});
			} else if (team) {
				seedSubagentSessionFile({
					mode: "lineage-only",
					parentSessionFile: sessionFile,
					childSessionFile: subagentSessionFile,
					childCwd: targetCwdForSession,
					sessionId: team.childSessionId,
				});
			}

			const activityFile = getSubagentActivityFile(artifactDir, id);
			mkdirSync(dirname(activityFile), { recursive: true });
			const { inheritsConversationContext } = launchBehavior;

			const modeHint = autoExitForChild
				? "Complete your task autonomously."
				: "Complete your task. When finished, call the subagent_done tool. The user can interact with you at any time.";
			const summaryInstruction = autoExitForChild
				? "Your FINAL assistant message should summarize what you accomplished."
				: "Your FINAL assistant message (before calling subagent_done or before the user exits) should summarize what you accomplished.";
			const denySet = rollover
				? new Set(rollover.stable.controls.denyTools)
				: deps.resolveDenyTools(agentDefs);
			// Save the composed role body so resume uses the same instructions.
			const identity = rollover
				? (rollover.stable.roleBody || null)
				: [agentDefs?.body, params.systemPrompt].filter(Boolean).join("\n\n") || null;
			const systemPromptMode = rollover ? rollover.stable.systemPromptMode : agentDefs?.systemPromptMode;
			const systemPromptFileMode =
				systemPromptMode === "append" || systemPromptMode === "replace" ? systemPromptMode : undefined;
			const identityInSystemPrompt = systemPromptFileMode && identity;
			const roleBlock = identity && !identityInSystemPrompt ? `\n\n${identity}` : "";
			const fullTask = inheritsConversationContext
				? params.task
				: `${roleBlock}\n\n${modeHint}\n\n${params.task}\n\n${summaryInstruction}`.trim();

			const safeName = toSafeFileName(params.name || "subagent", "subagent");
			const launchScriptFile = join(artifactDir, "subagent-scripts", `${safeName}-${id}.sh`);
			const completionFile = `${launchScriptFile}.status`;
			const parentSelection = {
				model: ctx.model,
				thinkingLevel: ctx.thinkingLevel,
			};
			const piModel: ReturnType<typeof resolvePiModelSelection> = agentDefs?.cli === "claude"
				? {
					argument: options?.resolvedModel?.argument
						?? deps.resolvePiModelArgument(params, agentDefs, parentSelection),
				}
				: options?.resolvedModel
					? {
						argument: `${options.resolvedModel.selection.provider}/${options.resolvedModel.selection.model}`,
						selection: options.resolvedModel.selection,
					}
					: resolvePiModelSelection(params, agentDefs, parentSelection, ctx.modelRegistry);
			const piModelArgument = piModel.argument;
			const launchProfile = buildLaunchProfile({
				displayName: params.name,
				...(rollover
					? (rollover.stable.agentName ? { agentName: rollover.stable.agentName } : {})
					: params.agent
						? { agentName: params.agent }
						: {}),
				roleBody: identity ?? "",
				systemPromptMode: rollover ? rollover.stable.systemPromptMode : agentDefs?.systemPromptMode ?? "message",
				cwd: targetCwdForSession,
				agentDir: effectiveAgentDir,
				controls: rollover
					? {
						...rollover.stable.controls,
						sessionMode: launchBehavior.sessionMode,
					}
					: {
						...(agentDefs?.spawning === undefined ? {} : { spawning: agentDefs.spawning }),
						denyTools: [...denySet].sort((first, second) => first.localeCompare(second)),
						...(taskRuntime
							? { autoExit: true }
							: agentDefs?.autoExit === undefined
								? {}
								: { autoExit: agentDefs.autoExit }),
						interactive: effectiveInteractive,
						sessionMode: launchBehavior.sessionMode,
					},
				effectiveSkills,
				modelArgument: piModelArgument,
				originalSessionPath: subagentSessionFile,
				resources: collectResourceFingerprints(ctx.pi, effectiveSkills),
				...(options?.workflow ? { workflow: options.workflow } : {}),
			});
			if (piModel.selection) {
				launchProfile.runtime.originalModel = piModel.selection;
				launchProfile.runtime.lastModel = piModel.selection;
			}

			if (agentDefs?.cli === "claude") {
				const sentinelFile = `/tmp/pi-claude-${id}-done`;
				const pluginDir = join(deps.subagentsDir, "plugin");

				const cmdParts: string[] = [];
				cmdParts.push(`PI_CLAUDE_SENTINEL=${shellEscape(sentinelFile)}`);
				cmdParts.push(`PI_CLAUDE_PROMPT_HASH=${shellEscape(createHash("sha256").update(params.task).digest("hex"))}`);
				cmdParts.push("claude");
				cmdParts.push("--dangerously-skip-permissions");

				if (existsSync(pluginDir)) {
					cmdParts.push("--plugin-dir", shellEscape(pluginDir));
				}

				if (configuredModel) {
					cmdParts.push("--model", shellEscape(configuredModel));
				}

				if (identity) {
					cmdParts.push("--append-system-prompt", shellEscape(identity));
				}

				if (params.resumeSessionId) {
					cmdParts.push("--resume", shellEscape(params.resumeSessionId));
				}

				cmdParts.push(shellEscape(params.task));

				const cdPrefix = `cd ${shellEscape(effectiveCwd)} && `;
				const command = `${cdPrefix}${cmdParts.join(" ")}; printf '%s\\n' "$?" > ${shellEscape(completionFile)}`;

				writeLaunchProfile(subagentSessionFile, launchProfile);
				try {
					assertOwned();
					deps.sendLongCommand(surface, command, {
						scriptPath: launchScriptFile,
						scriptPreamble: [
							`# Claude Code subagent launch script for ${params.name}`,
							`# Generated: ${new Date().toISOString()}`,
							`# Surface: ${surface}`,
						].join("\n"),
					});
				} catch (error) {
					removeLaunchProfile(subagentSessionFile);
					throw error;
				}

				const running: RunningSubagent = {
					id,
					name: params.name,
					task: params.task,
					agent: params.agent,
					surface,
					startTime,
					sessionFile: subagentSessionFile,
					launchScriptFile,
					completionFile,
					cli: "claude",
					sentinelFile,
					interactive: effectiveInteractive,
					statusState: createStatusState({ source: "claude", startTimeMs: startTime }),
				};

				deps.runningSubagents.set(id, running);
				return running;
			}

			const parts: PiCommandArgument[] = ["pi"];
			parts.push("--session", shellEscape(subagentSessionFile));

			const subagentDonePath = join(deps.subagentsDir, "subagent-done.ts");
			parts.push("-e", shellEscape(subagentDonePath));
			if (team) parts.push("-e", shellEscape(join(deps.subagentsDir, "team-member.ts")));

			if (piModelArgument) {
				parts.push("--model", shellEscape(piModelArgument));
			}
			if (piModel.selection?.thinking) {
				parts.push("--thinking", shellEscape(piModel.selection.thinking));
			}

			if (identityInSystemPrompt && identity) {
				const flag = systemPromptMode === "replace" ? "--system-prompt" : "--append-system-prompt";
				const syspromptPath = join(artifactDir, `context/${safeName}-${id}-sysprompt-${fileTimestamp()}.md`);
				parts.push({ flag, path: syspromptPath, text: identity });
			}

			const toolAllowlist = buildSubagentToolAllowlist(effectiveTools);
			if (toolAllowlist) {
				parts.push("--tools", shellEscape(toolAllowlist));
			}

			const envParts: string[] = [];
			if (team) {
				envParts.push(`PI_TASKS=${shellEscape(team.taskFile)}`);
				envParts.push(`PI_TEAM_DIRECTORY=${shellEscape(team.directory)}`);
				envParts.push(`PI_TEAM_ID=${shellEscape(team.teamId)}`);
				envParts.push(`PI_TEAM_MEMBER_ID=${shellEscape(team.memberId)}`);
				envParts.push(`PI_TEAM_MEMBER_TOKEN=${shellEscape(team.memberToken)}`);
				envParts.push(`PI_TEAM_MEMBER_EPOCH=${team.memberEpoch}`);
				envParts.push(`PI_TEAM_CHILD_SESSION_ID=${shellEscape(team.childSessionId)}`);
				envParts.push(`PI_TEAM_LEAD_SESSION_ID=${shellEscape(team.leadSessionId)}`);
			}

			const childAgentName = rollover ? rollover.stable.agentName : params.agent;
			const extraEnvParts: string[] = [];
			if (taskRuntime?.maxTurns != null) {
				extraEnvParts.push(`PI_SUBAGENT_MAX_TURNS=${taskRuntime.maxTurns}`);
			}
			extraEnvParts.push(`PI_SUBAGENT_SURFACE=${shellEscape(surface)}`);
			const command = buildPiCommand({
				args: parts,
				cwd: effectiveCwd,
				completionFile,
				environment: {
					agentDir: localAgentDir,
					denyTools: [...denySet],
					name: params.name,
					agentName: childAgentName,
					sessionFile: subagentSessionFile,
					id,
					activityFile,
					autoExit: autoExitForChild,
				},
				environmentPrefix: envParts,
				environmentSuffix: extraEnvParts,
				prompt: launchBehavior.taskDelivery === "direct"
					? { taskDelivery: "direct", text: fullTask, effectiveSkills }
					: {
						taskDelivery: "artifact",
						artifactPath: join(artifactDir, `context/${safeName}-${id}-${fileTimestamp()}.md`),
						text: fullTask,
						effectiveSkills,
					},
			});
			writeLaunchProfile(subagentSessionFile, launchProfile);
			const executionStartLine = existsSync(subagentSessionFile)
				? getNewEntries(subagentSessionFile, 0).length : 0;
			const workflowSummaryStartLine = options?.workflow ? executionStartLine : undefined;
			try {
				if (team) {
					const lastCheck = resolveTaskDiskCandidate({
						cwd: targetCwdForSession, agentDir: effectiveAgentDir,
						sessionId: team.childSessionId, sessionFile: subagentSessionFile,
						piTasks: team.taskFile,
					});
					if (!lastCheck.ok || lastCheck.path !== team.taskFile ||
						lastCheck.storeFingerprint !== team.expectedStoreFingerprint ||
						lastCheck.configFingerprint !== team.expectedConfigFingerprint ||
						(lastCheck.tasks.length > 0 &&
							lastCheck.tasks.every((task) => task.status === "completed"))) {
						throw new Error("Teammate task candidate changed or became all-completed before process launch");
					}
				}
				assertOwned();
				deps.sendLongCommand(surface, command, {
					scriptPath: launchScriptFile,
					scriptPreamble: [
						`# Subagent launch script for ${params.name}`,
						`# Generated: ${new Date().toISOString()}`,
						`# Session: ${subagentSessionFile}`,
						`# Surface: ${surface}`,
					].join("\n"),
				});
			} catch (error) {
				removeLaunchProfile(subagentSessionFile);
				throw error;
			}

			const running: RunningSubagent = {
				id,
				name: params.name,
				task: params.task,
				agent: params.agent,
				surface,
				startTime,
				sessionFile: subagentSessionFile,
				launchScriptFile,
				completionFile,
				activityFile,
				interactive: effectiveInteractive,
				executionStartLine,
				...(workflowSummaryStartLine !== undefined ? { workflowSummaryStartLine } : {}),
				...(team ? { team: {
					teamId: team.teamId, memberId: team.memberId,
					epoch: team.memberEpoch, sessionId: team.childSessionId,
				} } : {}),
				statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
			};

			deps.runningSubagents.set(id, running);
			return running;
		} catch (error) {
			// Until registration succeeds, no watcher owns cleanup for this pane.
			if (!surfacePreCreated) {
				try {
					deps.closeSurface(surface);
				} catch {
					// Best-effort cleanup must not replace the original launch error.
				}
			}
			throw error;
		}
	}

	return launchSubagent;
}
