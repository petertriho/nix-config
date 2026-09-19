import { mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
	extractUserPrompt,
	type IndexProgress,
	type PromptItem,
	REFRESH_THROTTLE_MS,
} from "./model.ts";

const DEFAULT_BUSY_TIMEOUT_MS = 3_000;
const DEFAULT_WARNING_LIMIT = 5;

type SqlRow = Record<string, SQLOutputValue>;
type SessionListProgress = (loaded: number, total: number) => void;

export interface SessionListing {
	path: string;
	cwd: string;
	name?: string;
	modified: Date;
}

export interface SessionReader {
	getEntries(): readonly unknown[];
	getSessionName?(): string | undefined;
}

export interface LiveSession {
	sessionPath?: string;
	sessionName?: string;
	entries: readonly unknown[];
}

export interface IndexState {
	active: boolean;
	progress?: IndexProgress;
	warnings: readonly string[];
	productive: boolean;
}

export interface StoreDiagnostics {
	journalMode: string;
	foreignKeys: boolean;
	busyTimeoutMs: number;
	tables: string[];
	indexes: string[];
}

export interface StoreOptions {
	databasePath?: string;
	env?: NodeJS.ProcessEnv;
	homeDirectory?: string;
	now?: () => number;
	listSessions?: (
		cwd: string,
		onProgress?: SessionListProgress,
	) => Promise<SessionListing[]>;
	openSession?: (path: string) => SessionReader;
	yieldToEventLoop?: () => Promise<void>;
	warningLimit?: number;
	busyTimeoutMs?: number;
}

export interface ApplyMutation {
	cwd: string;
	currentDraft: string;
	replacementText: string;
	poppedStashId?: number;
}

export interface ApplyMutationResult {
	autoStashed: boolean;
	popped: boolean;
}

function rowString(row: SqlRow | undefined, key: string): string {
	const value = row?.[key];
	return typeof value === "string" ? value : "";
}

function rowNumber(row: SqlRow | undefined, key: string): number {
	const value = row?.[key];
	return typeof value === "number" ? value : Number(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function defaultYield(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

export function resolvePiHistoryDatabasePath(
	env: NodeJS.ProcessEnv = process.env,
	homeDirectory = homedir(),
): string {
	const stateHome =
		env.XDG_STATE_HOME?.trim() || join(homeDirectory, ".local", "state");
	return join(stateHome, "pi", "pi-history.sqlite");
}

export class PiHistoryStore {
	readonly databasePath: string;

	private readonly database: DatabaseSync;
	private readonly now: () => number;
	private readonly listSessions: (
		cwd: string,
		onProgress?: SessionListProgress,
	) => Promise<SessionListing[]>;
	private readonly openSession: (path: string) => SessionReader;
	private readonly yieldToEventLoop: () => Promise<void>;
	private readonly warningLimit: number;
	private readonly refreshedAt = new Map<string, number>();
	private readonly refreshes = new Map<string, Promise<void>>();
	private readonly states = new Map<string, IndexState>();
	private readonly listeners = new Map<
		string,
		Set<(state: IndexState) => void>
	>();
	private closing = false;
	private closePromise: Promise<void> | undefined;

	constructor(options: StoreOptions = {}) {
		this.databasePath =
			options.databasePath ??
			resolvePiHistoryDatabasePath(options.env, options.homeDirectory);
		if (this.databasePath !== ":memory:") {
			mkdirSync(dirname(this.databasePath), { recursive: true });
		}

		const busyTimeoutMs = Math.max(
			1,
			Math.min(
				30_000,
				Math.floor(options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS),
			),
		);
		this.database = new DatabaseSync(this.databasePath, {
			timeout: busyTimeoutMs,
			enableForeignKeyConstraints: true,
		});
		this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${busyTimeoutMs};

      CREATE TABLE IF NOT EXISTS stashes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        cwd TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history_prompts (
        session_path TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        text TEXT NOT NULL,
        cwd TEXT NOT NULL,
        session_name TEXT,
        prompt_ts INTEGER NOT NULL,
        has_images INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_path, entry_id)
      );

      CREATE TABLE IF NOT EXISTS session_index (
        session_path TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        modified_ms INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stashes_cwd_created
        ON stashes(cwd, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_history_cwd_timestamp
        ON history_prompts(cwd, prompt_ts DESC);
      CREATE INDEX IF NOT EXISTS idx_session_index_cwd
        ON session_index(cwd);
    `);

		this.now = options.now ?? Date.now;
		this.listSessions =
			options.listSessions ??
			(async (cwd, onProgress) =>
				await SessionManager.list(cwd, undefined, onProgress));
		this.openSession =
			options.openSession ?? ((path) => SessionManager.open(path));
		this.yieldToEventLoop = options.yieldToEventLoop ?? defaultYield;
		this.warningLimit = Math.max(
			0,
			Math.floor(options.warningLimit ?? DEFAULT_WARNING_LIMIT),
		);
	}

	isOpen(): boolean {
		return this.database.isOpen;
	}

	getDiagnostics(): StoreDiagnostics {
		this.ensureOpen();
		const journal = this.database.prepare("PRAGMA journal_mode").get() as
			| SqlRow
			| undefined;
		const foreignKeys = this.database.prepare("PRAGMA foreign_keys").get() as
			| SqlRow
			| undefined;
		const busyTimeout = this.database.prepare("PRAGMA busy_timeout").get() as
			| SqlRow
			| undefined;
		const tables = (
			this.database
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
				)
				.all() as SqlRow[]
		).map((row) => rowString(row, "name"));
		const indexes = (
			this.database
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
				)
				.all() as SqlRow[]
		).map((row) => rowString(row, "name"));
		return {
			journalMode: rowString(journal, "journal_mode").toLocaleLowerCase(),
			foreignKeys: rowNumber(foreignKeys, "foreign_keys") === 1,
			busyTimeoutMs: rowNumber(busyTimeout, "timeout"),
			tables,
			indexes,
		};
	}

	insertStash(text: string, cwd: string): number {
		this.ensureOpen();
		const result = this.database
			.prepare("INSERT INTO stashes (text, cwd, created_at) VALUES (?, ?, ?)")
			.run(text, cwd, this.now());
		return Number(result.lastInsertRowid);
	}

	listStashes(cwd: string): PromptItem[] {
		this.ensureOpen();
		const rows = this.database
			.prepare(
				"SELECT id, text, cwd, created_at FROM stashes WHERE cwd = ? ORDER BY created_at DESC, id DESC",
			)
			.all(cwd) as SqlRow[];
		return rows.map((row) => ({
			kind: "stash",
			id: rowNumber(row, "id"),
			text: rowString(row, "text"),
			cwd: rowString(row, "cwd"),
			timestamp: rowNumber(row, "created_at"),
		}));
	}

	deleteStash(id: number, cwd: string): boolean {
		this.ensureOpen();
		const result = this.database
			.prepare("DELETE FROM stashes WHERE id = ? AND cwd = ?")
			.run(id, cwd);
		return Number(result.changes) === 1;
	}

	mutateForApply(input: ApplyMutation): ApplyMutationResult {
		this.ensureOpen();
		const autoStashed =
			input.currentDraft.trim().length > 0 &&
			input.currentDraft !== input.replacementText;
		const popped = input.poppedStashId !== undefined;

		this.database.exec("BEGIN IMMEDIATE");
		try {
			if (autoStashed) {
				this.database
					.prepare(
						"INSERT INTO stashes (text, cwd, created_at) VALUES (?, ?, ?)",
					)
					.run(input.currentDraft, input.cwd, this.now());
			}
			if (input.poppedStashId !== undefined) {
				const result = this.database
					.prepare("DELETE FROM stashes WHERE id = ? AND cwd = ?")
					.run(input.poppedStashId, input.cwd);
				if (Number(result.changes) !== 1) {
					throw new Error(`Stash ${input.poppedStashId} was not found`);
				}
			}
			this.database.exec("COMMIT");
			return { autoStashed, popped };
		} catch (error) {
			if (this.database.isTransaction) this.database.exec("ROLLBACK");
			throw error;
		}
	}

	listHistory(cwd: string, live?: LiveSession): PromptItem[] {
		this.ensureOpen();
		const rows = this.database
			.prepare(
				`SELECT session_path, entry_id, text, cwd, session_name, prompt_ts, has_images
         FROM history_prompts
         WHERE cwd = ?
         ORDER BY prompt_ts DESC`,
			)
			.all(cwd) as SqlRow[];
		const merged = new Map<string, PromptItem>();
		for (const row of rows) {
			const item: PromptItem = {
				kind: "history",
				id: rowString(row, "entry_id"),
				text: rowString(row, "text"),
				cwd: rowString(row, "cwd"),
				timestamp: rowNumber(row, "prompt_ts"),
				sessionPath: rowString(row, "session_path"),
				...(rowString(row, "session_name")
					? { sessionName: rowString(row, "session_name") }
					: {}),
				hasImages: rowNumber(row, "has_images") === 1,
			};
			merged.set(this.promptIdentity(item), item);
		}

		if (live?.sessionPath) {
			for (const entry of live.entries) {
				const item = extractUserPrompt(entry, {
					cwd,
					sessionPath: live.sessionPath,
					sessionName: live.sessionName,
					fallbackTimestamp: this.now(),
				});
				if (item) merged.set(this.promptIdentity(item), item);
			}
		}
		return [...merged.values()].sort(
			(left, right) =>
				right.timestamp - left.timestamp ||
				String(right.id).localeCompare(String(left.id)),
		);
	}

	getIndexState(cwd: string): IndexState {
		return this.cloneState(
			this.states.get(cwd) ?? {
				active: false,
				warnings: [],
				productive: false,
			},
		);
	}

	subscribe(cwd: string, listener: (state: IndexState) => void): () => void {
		const listeners = this.listeners.get(cwd) ?? new Set();
		listeners.add(listener);
		this.listeners.set(cwd, listeners);
		listener(this.getIndexState(cwd));
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.listeners.delete(cwd);
		};
	}

	getRefreshPromise(cwd: string): Promise<void> | undefined {
		return this.refreshes.get(cwd);
	}

	refreshHistory(
		cwd: string,
		options: { force?: boolean } = {},
	): Promise<void> {
		this.ensureNotClosing();
		const active = this.refreshes.get(cwd);
		if (active) return active;
		if (
			!options.force &&
			this.now() - (this.refreshedAt.get(cwd) ?? Number.NEGATIVE_INFINITY) <
				REFRESH_THROTTLE_MS
		) {
			return Promise.resolve();
		}

		this.updateState(cwd, {
			active: true,
			progress: undefined,
			productive: false,
		});
		const refresh = this.performRefresh(cwd)
			.then((completed) => {
				if (completed) this.refreshedAt.set(cwd, this.now());
			})
			.finally(() => {
				this.refreshes.delete(cwd);
				this.updateState(cwd, {
					active: false,
					progress: undefined,
				});
			});
		this.refreshes.set(cwd, refresh);
		return refresh;
	}

	close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.closing = true;
		this.closePromise = (async () => {
			await Promise.allSettled([...this.refreshes.values()]);
			if (this.database.isOpen) this.database.close();
			this.listeners.clear();
			this.refreshes.clear();
		})();
		return this.closePromise;
	}

	private async performRefresh(cwd: string): Promise<boolean> {
		let sessions: SessionListing[];
		try {
			sessions = await this.listSessions(cwd, (loaded, total) => {
				this.updateState(cwd, {
					progress: { phase: "sessions", loaded, total },
				});
			});
		} catch (error) {
			this.addWarning(cwd, `Session listing failed: ${errorMessage(error)}`);
			return false;
		}

		for (let index = 0; index < sessions.length; index += 1) {
			const session = sessions[index];
			if (!session) continue;

			try {
				// SDK modified tracks message activity, not metadata-only edits.
				const modifiedMs = statSync(session.path).mtimeMs;
				const indexed = this.database
					.prepare(
						"SELECT modified_ms FROM session_index WHERE session_path = ? AND cwd = ?",
					)
					.get(session.path, cwd) as SqlRow | undefined;
				if (indexed && rowNumber(indexed, "modified_ms") === modifiedMs) {
					this.updateState(cwd, {
						progress: {
							phase: "prompts",
							loaded: index + 1,
							total: sessions.length,
						},
					});
					await this.yieldToEventLoop();
					continue;
				}

				const sessionReader = this.openSession(session.path);
				const entries = sessionReader.getEntries();
				const sessionName = sessionReader.getSessionName
					? sessionReader.getSessionName()
					: session.name;
				// SDK open may return an empty session if the file disappeared.
				if (statSync(session.path).mtimeMs !== modifiedMs) {
					throw new Error("Session file changed while being read");
				}
				const sessionCwd = session.cwd || cwd;
				this.database.exec("BEGIN IMMEDIATE");
				this.database
					.prepare("DELETE FROM history_prompts WHERE session_path = ?")
					.run(session.path);
				const insert = this.database.prepare(
					`INSERT INTO history_prompts
             (session_path, entry_id, text, cwd, session_name, prompt_ts, has_images)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
				);
				for (const entry of entries) {
					const item = extractUserPrompt(entry, {
						cwd: sessionCwd,
						sessionPath: session.path,
						sessionName,
						fallbackTimestamp: modifiedMs,
					});
					if (!item) continue;
					insert.run(
						session.path,
						String(item.id),
						item.text,
						sessionCwd,
						item.sessionName ?? null,
						item.timestamp,
						item.hasImages ? 1 : 0,
					);
				}
				this.database
					.prepare(
						`INSERT INTO session_index (session_path, cwd, modified_ms, indexed_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(session_path) DO UPDATE SET
               cwd = excluded.cwd,
               modified_ms = excluded.modified_ms,
               indexed_at = excluded.indexed_at`,
					)
					.run(session.path, cwd, modifiedMs, this.now());
				this.database.exec("COMMIT");
				this.updateState(cwd, { productive: true });
			} catch (error) {
				if (this.database.isTransaction) {
					try {
						this.database.exec("ROLLBACK");
					} catch {
						// The original session-specific error is the useful warning.
					}
				}
				this.addWarning(
					cwd,
					`Could not index ${session.path}: ${errorMessage(error)}`,
				);
			}

			this.updateState(cwd, {
				progress: {
					phase: "prompts",
					loaded: index + 1,
					total: sessions.length,
				},
			});
			await this.yieldToEventLoop();
		}
		return true;
	}

	private promptIdentity(item: PromptItem): string {
		return `${item.sessionPath ?? ""}\u0000${String(item.id)}`;
	}

	private addWarning(cwd: string, warning: string): void {
		const currentWarnings = this.states.get(cwd)?.warnings ?? [];
		const warnings =
			this.warningLimit === 0
				? []
				: [...currentWarnings, warning].slice(-this.warningLimit);
		this.updateState(cwd, { warnings });
	}

	private updateState(cwd: string, patch: Partial<IndexState>): void {
		const current = this.states.get(cwd) ?? {
			active: false,
			warnings: [],
			productive: false,
		};
		const next: IndexState = {
			...current,
			...patch,
			warnings: patch.warnings ?? current.warnings,
		};
		this.states.set(cwd, next);
		const snapshot = this.cloneState(next);
		for (const listener of this.listeners.get(cwd) ?? []) listener(snapshot);
	}

	private cloneState(state: IndexState): IndexState {
		return {
			...state,
			...(state.progress ? { progress: { ...state.progress } } : {}),
			warnings: [...state.warnings],
		};
	}

	private ensureOpen(): void {
		if (!this.database.isOpen) throw new Error("pi-history store is closed");
	}

	private ensureNotClosing(): void {
		this.ensureOpen();
		if (this.closing) throw new Error("pi-history store is closing");
	}
}
