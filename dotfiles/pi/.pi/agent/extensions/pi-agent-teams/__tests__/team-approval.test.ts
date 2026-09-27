import assert from "node:assert/strict";
import test from "node:test";
import {
  answerApproval, callDigest, makeApprovalRequest, verifyApprovalRequest, verifyApprovalResponse,
} from "../team-approval.ts";

test("one actual-user decision binds the full call, member epoch and tool ID", () => {
  const request = makeApprovalRequest({
    toolCallId: "tool-1", toolName: "TaskUpdate", input: { taskId: "7", status: "completed" },
    memberId: "alice", memberEpoch: 2, memberSessionId: "child-1", leadSessionId: "lead-1",
  });
  assert.equal(verifyApprovalRequest(request), true);
  const answer = answerApproval(request, true);
  assert.equal(verifyApprovalResponse(request, answer), true);
  for (const changed of [
    { ...request, toolCallId: "tool-2" },
    { ...request, memberEpoch: 3 },
    { ...request, input: { taskId: "8", status: "completed" } },
  ]) {
    assert.equal(verifyApprovalRequest(changed), false);
    assert.equal(verifyApprovalResponse(changed, answer), false);
  }
  assert.equal(verifyApprovalResponse(request, { ...answer, approved: false }), false);
  assert.equal(verifyApprovalResponse(request, { ...answer, expiresAt: Date.now() - 1 }), false);
  assert.equal(callDigest({ ...request, input: { status: "completed", taskId: "7" } }), request.digest);
});
