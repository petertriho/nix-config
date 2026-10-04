import type { SubagentParamsType } from "../registration/schemas.ts";

export type FinishedOrdinaryAgent =
  | { backend: "pi"; id: string; sessionPath: string }
  | {
    backend: "claude";
    id: string;
    claudeSessionId: string;
    launch: Pick<SubagentParamsType, "agent" | "cwd" | "model" | "systemPrompt" | "interactive">;
  };

/** Internal callbacks for a saved ordinary-agent follow-up, not tool arguments. */
export interface OrdinaryFollowUp {
  followUpName?: string;
  followUpLifecycle?: { onResult(): void; onError(): void };
}

/** Per ExtensionAPI registration: never shared between parent sessions. */
export function createSessionState() {
  return {
    finishedOrdinary: new Map<string, FinishedOrdinaryAgent>(),
    followUpsInFlight: new Set<string>(),
    sessionEpoch: 0,
    sessionActive: true,
  };
}
export type SessionState = ReturnType<typeof createSessionState>;
