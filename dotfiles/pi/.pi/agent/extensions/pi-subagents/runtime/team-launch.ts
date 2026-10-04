import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { checkLeadAdmission, preflightTeamChild } from "../teams/admission.ts";
import { getDefaultSessionDirFor, resolveResultPresentation, type AgentDefaultsLike, type RunningSubagent, type TeamLaunchSpec } from "../execution/services.ts";
import { isTmuxAvailable } from "../adapters/tmux.ts";
import type { AgentCall } from "../registration/schemas.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { ExecutionRuntime } from "./execution.ts";
import { muxUnavailableResult } from "./execution.ts";
import { activeAgentResult } from "./tool-results.ts";
import type { TeamRuntime } from "./teams.ts";

export function createTeamLauncher(pi: ExtensionAPI, discovery: AgentDiscovery, execution: ExecutionRuntime, team: TeamRuntime) {
  const { getAgentConfigDir, resolveSubagentPaths } = discovery;
  const { subagentExecution, launchSubagent } = execution;
  const { openCoordinator, capturedPiTasks } = team;
  return async function launchTeamAgent(
    params: AgentCall,
    defaults: AgentDefaultsLike,
    agentName: string,
    ctx: ExtensionContext,
    signal?: AbortSignal
  ) {
    const fail = (message: string) => ({
      isError: true,
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      details: { error: message },
    });
    const admission = checkLeadAdmission({
      cwd: ctx.cwd,
      agentDir: getAgentConfigDir(),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
      piTasks: capturedPiTasks,
    }, team.leadReceipt);
    if (!admission.ok) {
      return fail(`Team admission blocked: ${admission.reason}. Configure autoClearCompleted: "never" and reload if needed; ordinary unnamed or explicitly noninteractive delegation remains available.`);
    }
    const name = params.name!.trim();
    const resolved = resolveSubagentPaths({
      name, task: params.prompt, agent: agentName, cwd: params.cwd,
    }, defaults);
    const childCwd = resolved.effectiveCwd ?? ctx.cwd;
    const childSessionId = randomUUID();
    const childSessionFile = join(
      getDefaultSessionDirFor(childCwd, resolved.effectiveAgentDir),
      `${childSessionId}.jsonl`,
    );
    const childInput = {
      cwd: childCwd, agentDir: resolved.effectiveAgentDir,
      sessionId: childSessionId, sessionFile: childSessionFile,
      piTasks: admission.value.path,
    };
    const preflight = preflightTeamChild(admission.value, childInput);
    if (!preflight.ok) return fail(`Teammate startup blocked: ${preflight.reason}`);
    if (params.run_in_background === false) {
      return fail("An interactive teammate stays available for messages; use a background Agent call.");
    }
    if (!isTmuxAvailable()) return activeAgentResult(muxUnavailableResult());
    const opened = await openCoordinator(ctx, params.team_name?.trim(), admission.value.storeFingerprint);
    await opened.requireTaskFingerprint(admission.value.storeFingerprint);
    const member = await opened.addMember({ name, sessionId: childSessionId });
    const spec: TeamLaunchSpec = {
      directory: opened.directory, teamId: opened.teamId,
      memberId: member.memberId, memberToken: member.token, memberEpoch: member.epoch,
      childSessionId, childSessionFile, leadSessionId: ctx.sessionManager.getSessionId(),
      taskFile: admission.value.path,
      expectedStoreFingerprint: preflight.value.storeFingerprint,
      expectedConfigFingerprint: preflight.value.configFingerprint,
    };
    let running: RunningSubagent | undefined;
    try {
      running = await launchSubagent({
        name, task: params.prompt, agent: agentName, cwd: params.cwd,
        model: params.model, systemPrompt: params.systemPrompt,
        skills: params.skills, tools: params.tools, interactive: true,
      }, { ...ctx, pi }, { team: spec });
      await opened.transport.updateMemberRuntime({
        teamId: opened.teamId, memberId: member.memberId,
        surface: running.surface, sessionFile: running.sessionFile,
      });
      await opened.awaitStartup({
        memberId: member.memberId, memberEpoch: member.epoch,
        candidate: preflight.value,
        child: { ...childInput, sessionFile: running.sessionFile },
        signal, timeoutMs: 20_000,
      });
      subagentExecution.watchInBackground({
        pi, ctx, running,
        onSuccess: async ({ result }) => {
          try { await opened.transport.stopMember({
            teamId: opened.teamId, memberId: member.memberId, epoch: member.epoch,
          }); } catch { /* a reloaded lead may own the roster now */ }
          return {
            content: resolveResultPresentation(result, name),
            details: { id: running!.id, name, team: opened.teamId, exitCode: result.exitCode },
          };
        },
        onError: async (message) => ({
          content: `Teammate "${name}" failed: ${message}`,
          details: { id: running!.id, name, error: message },
        }),
      });
      return {
        content: [{ type: "text" as const, text: `Teammate "${name}" started in team "${params.team_name ?? "main"}".` }],
        details: { id: running.id, name, memberId: member.memberId, team: opened.teamId, status: "started" },
      };
    } catch (error) {
      if (running) {
        try { subagentExecution.stopSubagent(running); } catch { /* retain an unclosed pane for diagnosis */ }
      }
      try { await opened.transport.stopMember({
        teamId: opened.teamId, memberId: member.memberId, epoch: member.epoch,
      }); } catch { /* report the original startup failure */ }
      return fail(`Teammate startup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
export type TeamLauncher = ReturnType<typeof createTeamLauncher>;
