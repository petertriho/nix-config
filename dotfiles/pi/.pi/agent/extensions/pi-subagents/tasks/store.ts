export type TaskRunPhase = "starting" | "running" | "stopping" | "settled";

export interface TaskRunTerminal {
	status: "completed" | "failed" | "aborted" | "stopped";
	result?: string;
	error?: string;
}

export interface TaskRunHandle {
	id: string;
	surface: string;
	sessionFile: string;
	abortController?: AbortController;
}

export interface TaskRunState {
	id: string;
	requestedType: string;
	resolvedAgent: string;
	description: string;
	phase: TaskRunPhase;
	stopRequested: boolean;
	consumed: boolean;
	terminal?: TaskRunTerminal;
	handle?: TaskRunHandle;
}

/** Lifecycle payload emitted on settlement — one per run, never two. */
export type TaskLifecycleEvent =
	| {
			kind: "completed";
			id: string;
			type: string;
			description: string;
			result?: string;
	  }
	| {
			kind: "failed";
			id: string;
			type: string;
			description: string;
			status: "failed" | "aborted" | "stopped";
			error?: string;
			result?: string;
	  };

export const DEFAULT_SETTLED_RETENTION = 64;

/**
 * Adapter-owned task-run records, kept separate from the extension's general
 * `runningSubagents` map. Every terminal path funnels through `finalize`,
 * which emits at most one lifecycle event per run; settled records are
 * retained (bounded, FIFO) so `consume` and repeated-stop validation still
 * work after the pane is gone.
 */
export class TaskRunStore {
	private readonly active = new Map<string, TaskRunState>();
	private readonly settled = new Map<string, TaskRunState>();
	private readonly onLifecycle: (event: TaskLifecycleEvent) => void;
	private readonly maxSettled: number;

	constructor(
		onLifecycle: (event: TaskLifecycleEvent) => void,
		maxSettled: number = DEFAULT_SETTLED_RETENTION,
	) {
		this.onLifecycle = onLifecycle;
		this.maxSettled = maxSettled;
	}

	add(record: TaskRunState): void {
		this.active.set(record.id, record);
	}

	getActive(id: string): TaskRunState | undefined {
		return this.active.get(id);
	}

	getSettled(id: string): TaskRunState | undefined {
		return this.settled.get(id);
	}

	has(id: string): boolean {
		return this.active.has(id) || this.settled.has(id);
	}

	isSettled(id: string): boolean {
		return this.settled.has(id);
	}

	activeIds(): string[] {
		return [...this.active.keys()];
	}

	settledCount(): number {
		return this.settled.size;
	}

	/**
	 * Idempotent terminal transition. Returns the emitted event exactly once
	 * per run; later calls for the same id (stop/watch/sidecar/shutdown
	 * races) are no-ops.
	 */
	finalize(id: string, terminal: TaskRunTerminal): TaskLifecycleEvent | undefined {
		const record = this.active.get(id);
		if (!record) return undefined;
		this.active.delete(id);
		record.terminal = terminal;
		record.phase = "settled";
		this.settled.set(id, record);
		while (this.settled.size > this.maxSettled) {
			const oldest = this.settled.keys().next().value;
			if (oldest === undefined) break;
			this.settled.delete(oldest);
		}

		if (terminal.status === "completed") {
			const event: TaskLifecycleEvent = {
				kind: "completed",
				id,
				type: record.requestedType,
				description: record.description,
				...(terminal.result == null ? {} : { result: terminal.result }),
			};
			this.onLifecycle(event);
			return event;
		}
		const event: TaskLifecycleEvent = {
			kind: "failed",
			id,
			type: record.requestedType,
			description: record.description,
			status: terminal.status,
			...(terminal.error == null ? {} : { error: terminal.error }),
			...(terminal.result == null ? {} : { result: terminal.result }),
		};
		this.onLifecycle(event);
		return event;
	}

	/** Drop every record (session shutdown). Emits nothing. */
	clear(): void {
		this.active.clear();
		this.settled.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Watch-outcome classification
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskResultLike {
	exitCode: number;
	summary?: string;
	responded?: boolean;
	error?: string;
	errorMessage?: string;
	ping?: { name: string; message: string };
	/** Set by the hard turn-limit path (PI_SUBAGENT_MAX_TURNS exhaustion). */
	turnLimit?: boolean;
}

export type TaskWatchOutcome =
	| { kind: "completed"; result: string }
	| { kind: "failed"; error: string; result?: string }
	| { kind: "aborted"; error: string; result?: string };

/**
 * Translate a finished child watch into the terminal task outcome:
 *
 * - clean exit with a final assistant message → completed;
 * - `caller_ping` → failed (TaskExecute has no interactive resume channel);
 * - hard turn limit → aborted (pi-tasks reverts the task to pending);
 * - provider error / non-zero exit / no assistant output → failed.
 */
export function classifyTaskResult(result: TaskResultLike): TaskWatchOutcome {
	const partial =
		typeof result.summary === "string" && result.summary.trim() !== ""
			? result.summary
			: undefined;

	if (result.turnLimit) {
		return {
			kind: "aborted",
			error: result.errorMessage ?? "Task agent exceeded its turn limit and was aborted.",
			...(partial ? { result: partial } : {}),
		};
	}
	if (result.ping) {
		return {
			kind: "failed",
			error:
				`Task agent asked for interactive help (caller_ping): ${result.ping.message}. ` +
				`TaskExecute has no interactive channel for answering — adjust the task ` +
				`description or agent profile so the task is answerable autonomously.`,
			...(partial ? { result: partial } : {}),
		};
	}
	if (result.errorMessage) {
		return {
			kind: "failed",
			error: result.errorMessage,
			...(partial ? { result: partial } : {}),
		};
	}
	if (result.exitCode !== 0) {
		return {
			kind: "failed",
			error: result.errorMessage ?? `Task agent exited with code ${result.exitCode}.`,
			...(partial ? { result: partial } : {}),
		};
	}
	if (!result.responded) {
		return {
			kind: "failed",
			error: "Task agent exited without producing a final assistant message.",
		};
	}
	return { kind: "completed", result: result.summary ?? "" };
}
