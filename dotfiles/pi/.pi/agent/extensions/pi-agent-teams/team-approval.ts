import { createHash, randomUUID } from "node:crypto";

export interface ApprovalRequest {
  requestId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  memberId: string;
  memberEpoch: number;
  memberSessionId: string;
  leadSessionId: string;
  digest: string;
}

export interface ApprovalResponse {
  requestId: string;
  toolCallId: string;
  memberId: string;
  memberEpoch: number;
  leadSessionId: string;
  digest: string;
  approved: boolean;
  expiresAt: number;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Nonfinite approval input");
  return value;
}

export function canonicalCall(value: unknown): string {
  const json = JSON.stringify(stable(value));
  if (!json || Buffer.byteLength(json) > 65_536) throw new Error("Approval input is missing or too large");
  return json;
}

export function callDigest(call: {
  toolName: string; input: Record<string, unknown>; toolCallId: string;
  memberId: string; memberEpoch: number; memberSessionId: string; leadSessionId: string;
}): string {
  const { toolName, input, toolCallId, memberId, memberEpoch, memberSessionId, leadSessionId } = call;
  return createHash("sha256").update(canonicalCall({
    toolName, input, toolCallId, memberId, memberEpoch, memberSessionId, leadSessionId,
  })).digest("hex");
}

export function makeApprovalRequest(input: Omit<ApprovalRequest, "requestId" | "digest">): ApprovalRequest {
  if (!input.toolCallId || !input.toolName || !input.memberId || !input.leadSessionId ||
      !Number.isSafeInteger(input.memberEpoch) || input.memberEpoch < 1) {
    throw new Error("Incomplete approval identity");
  }
  const requestId = randomUUID();
  return { ...input, requestId, digest: callDigest(input) };
}

export function verifyApprovalRequest(request: ApprovalRequest): boolean {
  return Boolean(request.requestId && request.memberSessionId &&
    request.digest === callDigest(request));
}

export function answerApproval(request: ApprovalRequest, approved: boolean): ApprovalResponse {
  return {
    requestId: request.requestId, toolCallId: request.toolCallId,
    memberId: request.memberId, memberEpoch: request.memberEpoch,
    leadSessionId: request.leadSessionId, digest: request.digest,
    approved, expiresAt: Date.now() + 15_000,
  };
}

export function verifyApprovalResponse(request: ApprovalRequest, response: ApprovalResponse): boolean {
  return verifyApprovalRequest(request) &&
    response.requestId === request.requestId && response.toolCallId === request.toolCallId &&
    response.memberId === request.memberId && response.memberEpoch === request.memberEpoch &&
    response.leadSessionId === request.leadSessionId && response.digest === request.digest &&
    response.approved === true && response.expiresAt >= Date.now() &&
    response.expiresAt <= Date.now() + 15_000;
}
