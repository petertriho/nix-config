/**
 * Compile-time contract checks, included by npm run typecheck.
 * This function is never called: negative cases must not emit malformed events.
 */
import {
	requestWorkflowProvider,
	type WorkflowEventBus, type WorkflowOwner, type WorkflowProvider,
	type WorkflowLaunchRequest, type WorkflowMetadata, type WorkflowSavedRequest,
	type WorkflowRecoveryRequest, type WorkflowProviderRequestFor,
	type WorkflowProviderRequest, type WorkflowProviderOutcomes,
} from "../adapters/workflow-contract.ts";
import type {
	WorkflowLaunchRequest as ClientLaunchRequest,
	WorkflowMetadata as ClientMetadata,
	WorkflowSavedRequest as ClientSavedRequest,
	WorkflowRecoveryRequest as ClientRecoveryRequest,
} from "../adapters/workflow-client.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type CompatibleClientExports = [
	Assert<Equal<WorkflowLaunchRequest, ClientLaunchRequest>>,
	Assert<Equal<WorkflowMetadata, ClientMetadata>>,
	Assert<Equal<WorkflowSavedRequest, ClientSavedRequest>>,
	Assert<Equal<WorkflowRecoveryRequest, ClientRecoveryRequest>>,
];

function contractChecks(
	events: WorkflowEventBus, provider: WorkflowProvider, owner: WorkflowOwner,
	launch: WorkflowLaunchRequest, saved: WorkflowSavedRequest, recovery: WorkflowRecoveryRequest,
	request: WorkflowProviderRequestFor, ingress: WorkflowProviderRequest,
) {
	const envelope = { requestId: "request", providerId: provider.providerId, instanceId: provider.instanceId, owner };
	const validLaunch: WorkflowProviderRequestFor<"launch"> = { ...envelope, operation: "launch", payload: launch };
	const validRecovery: WorkflowProviderRequestFor<"recover"> = { ...envelope, operation: "recover", payload: recovery };
	const pathlessStop: WorkflowProviderRequestFor<"stop"> = { ...envelope, operation: "stop", payload: {} };
	const profiles: WorkflowProviderRequestFor<"profiles"> = { ...envelope, operation: "profiles", payload: { requiredAgents: ["writer"] } };
	// Existing consumers can still parameterize the ingress envelope by payload.
	const compatibleEnvelope: WorkflowProviderRequest<WorkflowLaunchRequest> = validLaunch;
	void [validLaunch, validRecovery, pathlessStop, profiles, compatibleEnvelope];

	if (request.operation === "recover") {
		const failure: string = request.payload.failure;
		const model: WorkflowRecoveryRequest["model"] = request.payload.model;
		void [failure, model];
	}
	if (request.operation === "profiles") {
		const requiredAgents: readonly string[] = request.payload.requiredAgents;
		void requiredAgents;
	}

	const launched: Promise<{ requestId: string; data: WorkflowProviderOutcomes["launch"] }> =
		requestWorkflowProvider(events, provider, "launch", owner, launch);
	const recovered: Promise<{ requestId: string; data: WorkflowProviderOutcomes["recover"] }> =
		requestWorkflowProvider(events, provider, "recover", owner, recovery);
	void [launched, recovered];
	requestWorkflowProvider(events, provider, "ping", owner, {});
	requestWorkflowProvider(events, provider, "profiles", owner, { requiredAgents: ["writer"] });
	requestWorkflowProvider(events, provider, "inspect", owner, saved);
	requestWorkflowProvider(events, provider, "resume", owner, saved);
	requestWorkflowProvider(events, provider, "update-metadata", owner, saved);
	requestWorkflowProvider(events, provider, "stop", owner, {});
	requestWorkflowProvider(events, provider, "stop", owner, { sessionPath: saved.sessionPath });

	// @ts-expect-error A saved-session request is not a launch request.
	requestWorkflowProvider(events, provider, "launch", owner, saved);
	// @ts-expect-error A fresh launch cannot be inspected as a saved session.
	requestWorkflowProvider(events, provider, "inspect", owner, launch);
	// @ts-expect-error Recovery requires both a failure and a replacement model.
	requestWorkflowProvider(events, provider, "recover", owner, saved);
	// @ts-expect-error A failure alone does not supply a required recovery model.
	requestWorkflowProvider(events, provider, "recover", owner, { ...saved, failure: "credits exhausted" });
	// @ts-expect-error Profiles require an agent list, not a stop payload.
	requestWorkflowProvider(events, provider, "profiles", owner, { sessionPath: saved.sessionPath });
	// @ts-expect-error Ping has no request fields.
	requestWorkflowProvider(events, provider, "ping", owner, { requiredAgents: ["writer"] });
	// @ts-expect-error An unknown ingress payload must not enter the typed boundary.
	requestWorkflowProvider(events, provider, "resume", owner, ingress.payload);
	// @ts-expect-error Explicit generic arguments cannot bypass request requirements.
	requestWorkflowProvider<"recover">(events, provider, "recover", owner, saved);

	// @ts-expect-error Discriminated envelopes reject a wrong operation/payload pair.
	const badEnvelope: WorkflowProviderRequestFor = { ...envelope, operation: "recover", payload: launch };
	// @ts-expect-error Operation subsets retain correlation instead of accepting a Cartesian product.
	const badSubset: WorkflowProviderRequestFor<"launch" | "recover"> = { ...envelope, operation: "recover", payload: launch };
	// @ts-expect-error Typed requests must narrow an operation, not specify an arbitrary payload container.
	const badGeneric: WorkflowProviderRequestFor<WorkflowLaunchRequest> = validLaunch;
	// @ts-expect-error A launch outcome cannot be mistaken for an owned-stop acknowledgement.
	const badOutcome: Promise<{ requestId: string; data: WorkflowProviderOutcomes["stop"] }> = launched;
	void [badEnvelope, badSubset, badGeneric, badOutcome];
}
