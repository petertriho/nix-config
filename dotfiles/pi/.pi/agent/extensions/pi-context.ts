import type {
	BuildSystemPromptOptions, ContextUsage, ExtensionAPI, SessionEntry,
	SessionProjection, ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { calculateContextTokens, formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, ScrollView, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export interface ContextRow {
	group: "System prompt" | "Context files" | "Skills" | "Tools" | "Conversation";
	label: string;
	preview: string;
	estimate: string;
	nested?: boolean;
}
export interface ContextSnapshot {
	rows: ContextRow[];
	usage: { tokens: number | null; window: number | null; percent: number | null; provenance: string };
	error?: string;
}
export interface SnapshotInput {
	prompt: string;
	options: BuildSystemPromptOptions;
	activeTools: string[];
	allTools: ToolInfo[];
	projection: SessionProjection;
	branch: SessionEntry[];
	model: { provider: string; id: string; contextWindow?: number } | undefined;
	usage: ContextUsage | undefined;
}

const PREVIEW_LIMIT = 360;
// Strip terminal escapes, C0/C1 controls, and bidi formatting before rendering user-supplied text.
export function safeText(value: string): string {
	return value.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))?/g, " ")
		.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
		.replace(/\s+/g, " ").trim();
}
function short(text: string): string {
	return summarizeText([text]).preview;
}
function summarizeText(parts: Iterable<string>): { preview: string; codePoints: number } {
	const prefix: string[] = [];
	let codePoints = 0;
	let pendingSpace = false;
	for (const part of parts) {
		// Count without materializing an array of characters or copying a large tool result.
		for (let i = 0; i < part.length; i++, codePoints++) {
			const code = part.charCodeAt(i);
			if (code >= 0xd800 && code <= 0xdbff && i + 1 < part.length) {
				const next = part.charCodeAt(i + 1);
				if (next >= 0xdc00 && next <= 0xdfff) i++;
			}
		}
		if (prefix.length > PREVIEW_LIMIT) continue;
		for (let i = 0; i < part.length && prefix.length <= PREVIEW_LIMIT;) {
			const code = part.codePointAt(i)!;
			if (code === 0x1b) {
				pendingSpace = true;
				i++;
				if (part[i] === "[") {
					i++;
					while (i < part.length && !(part.charCodeAt(i) >= 0x40 && part.charCodeAt(i) <= 0x7e)) i++;
					if (i < part.length) i++;
				} else if (part[i] === "]") {
					i++;
					while (i < part.length && part.charCodeAt(i) !== 0x07 &&
						!(part.charCodeAt(i) === 0x1b && part[i + 1] === "\\")) i++;
					if (part.charCodeAt(i) === 0x1b) i += 2;
					else if (i < part.length) i++;
				}
				continue;
			}
			const char = String.fromCodePoint(code);
			i += char.length;
			if (/[\s\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(char)) {
				pendingSpace = true;
				continue;
			}
			if (pendingSpace && prefix.length) prefix.push(" ");
			pendingSpace = false;
			prefix.push(char);
		}
	}
	const clipped = prefix.length > PREVIEW_LIMIT;
	const preview = prefix.slice(0, PREVIEW_LIMIT).join("");
	return { preview: clipped ? `${preview}… [clipped]` : preview || "(empty)", codePoints };
}
function row(group: ContextRow["group"], label: string, text: string | Iterable<string>, nested = false, unknown = false): ContextRow {
	const { preview, codePoints } = summarizeText(typeof text === "string" ? [text] : text);
	// Approximation of text only: one token per four Unicode code points; not a provider tokenizer.
	return { group, label: short(label), preview, estimate: unknown ? "unknown" : `~${Math.ceil(codePoints / 4)}`, nested };
}
function* contentParts(content: unknown): Iterable<string> {
	if (typeof content === "string") { yield content; return; }
	if (!Array.isArray(content)) { yield "(non-text content)"; return; }
	for (let i = 0; i < content.length; i++) {
		if (i > 0) yield "\n";
		const part = content[i];
		if (!part || typeof part !== "object") { yield "(unknown part)"; continue; }
		const block = part as Record<string, unknown>;
		if (block.type === "text" || block.type === "thinking") yield String(block.text ?? block.thinking ?? "");
		else if (block.type === "toolCall") yield `Tool call ${String(block.name ?? "unknown")}: ${JSON.stringify(block.arguments ?? {})}`;
		else yield `(${String(block.type ?? "non-text")} content; size unknown)`;
	}
}

function isRenderedSkill(prompt: string, skill: NonNullable<BuildSystemPromptOptions["skills"]>[number]): boolean {
	if (skill.disableModelInvocation) return false;
	// Use Pi's formatter so the complete block (including XML-escaped fields and location)
	// must appear inside a skill index, not as coincidental name/description substrings.
	const block = formatSkillsForPrompt([skill]).match(/  <skill>\n[\s\S]*?\n  <\/skill>/)?.[0];
	return !!block && [...prompt.matchAll(/<available_skills>\n([\s\S]*?)\n<\/available_skills>/g)]
		.some((match) => match[1].includes(block));
}

export function createContextSnapshot(input: SnapshotInput): ContextSnapshot {
	const rows: ContextRow[] = [];
	rows.push(row("System prompt", "Effective system prompt", input.prompt));
	// These sources overlap the effective prompt; never add them to a prompt total.
	for (const file of input.options.contextFiles ?? []) {
		if (file.content && input.prompt.includes(file.content)) {
			rows.push(row("Context files", `Context file: ${file.path} (within prompt)`, file.content, true));
		}
	}
	for (const skill of input.options.skills ?? []) {
		if (isRenderedSkill(input.prompt, skill)) {
			rows.push(row("Skills", `Skill index: ${skill.name} (within prompt)`, skill.description, true));
		}
	}
	const tools = new Map(input.allTools.map((tool) => [tool.name, tool]));
	for (const name of input.activeTools) {
		const tool = tools.get(name);
		rows.push(row("Tools", `Tool: ${name}`, tool
			? `${tool.description}\n${JSON.stringify(tool.parameters)}`
			: "(active definition unavailable; size unknown)", false, !tool));
	}
	for (const projected of input.projection.entries) {
		for (const message of projected.messages) {
			if (message.role === "system") continue; // represented by the current effective prompt
			if (message.role === "bashExecution" && message.excludeFromContext) continue;
			const source = projected.sourceEntry;
			const label = message.role === "toolResult" ? `Tool result: ${message.toolName}` :
				message.role === "custom" ? `Custom: ${message.customType}` :
				message.role === "compactionSummary" ? "Compaction summary" :
				message.role === "branchSummary" ? "Branch summary" :
				message.role === "assistant" ? "Assistant" :
				message.role === "user" ? "User" : message.role;
			const text = message.role === "branchSummary" || message.role === "compactionSummary"
				? [message.summary] : message.role === "bashExecution"
					? [message.command, "\n", message.output] : contentParts(message.content);
			const blocks = "content" in message ? message.content : undefined;
			const unknown = Array.isArray(blocks) && blocks.some((part) =>
				part && typeof part === "object" && !["text", "thinking", "toolCall"].includes(part.type));
			rows.push(row("Conversation", `${label} · ${source.id}`, text, false, unknown));
		}
	}
	const { usage, model, projection, branch } = input;
	let latestAccounted: SessionProjection["entries"][number] | undefined;
	let accounted: SessionProjection["messages"][number] | undefined;
	// Pi estimates from the last valid assistant message, not just the last entry
	// with a nonzero totalTokens field (providers may report only components).
	for (let i = projection.entries.length - 1; i >= 0 && !accounted; i--) {
		const entry = projection.entries[i];
		for (let j = entry.messages.length - 1; j >= 0; j--) {
			const message = entry.messages[j];
			if (message.role === "assistant" && message.stopReason !== "aborted" &&
				message.stopReason !== "error" && message.usage && calculateContextTokens(message.usage) > 0) {
				latestAccounted = entry;
				accounted = message;
				break;
			}
		}
	}
	const lastIndex = latestAccounted ? branch.findIndex((e) => e.id === latestAccounted.sourceEntry.id) : -1;
	const unchanged = lastIndex >= 0 && !branch.slice(lastIndex + 1).some((e) =>
		e.type === "context_edit" || e.type === "compaction" || e.type === "branch_summary");
	const trusted = !!model && !!accounted && accounted.role === "assistant" &&
		accounted.provider === model.provider && accounted.model === model.id && unchanged &&
		!!usage && usage.tokens !== null && Number.isFinite(usage.tokens) && usage.tokens >= 0 &&
		Number.isFinite(usage.contextWindow) && usage.contextWindow > 0 &&
		usage.contextWindow === input.model?.contextWindow;
	return {
		rows,
		usage: {
			tokens: trusted ? usage!.tokens : null,
		window: usage && usage.contextWindow > 0 ? usage.contextWindow
			: input.model?.contextWindow && input.model.contextWindow > 0 ? input.model.contextWindow : null,
			percent: trusted ? (usage!.tokens! / usage!.contextWindow) * 100 : null,
			provenance: trusted ? "Pi estimate · last accounted request + trailing content (not current wire payload)"
				: "Unknown · no attributable current-model usage (or context changed)",
		},
	};
}

const GROUPS = ["System prompt", "Context files", "Skills", "Tools", "Conversation"] as const;
type Group = ContextRow["group"];
type ListItem = { group: Group; row?: ContextRow };
const GROUP_DETAILS: Record<Group, string> = {
	"System prompt": "Effective prompt at this snapshot. Includes context files and the skill index.",
	"Context files": "Context file excerpts already included in the effective system prompt.",
	"Skills": "Skill descriptions already included in the effective system prompt.",
	"Tools": "Active tool definitions at this snapshot.",
	"Conversation": "Messages in the active, edit-aware session projection.",
};
function sourceName(label: string): string | null {
	const match = /^(?:↳\s*)?Context file:\s*(.*?)\s+\(within prompt\)$/.exec(safeText(label));
	return match ? match[1]!.split(/[\\/]/).filter(Boolean).at(-1) ?? match[1]! : null;
}

export class ContextModal {
	private selected = 0;
	private scroll = 0;
	private help = false;
	private helpBody: string[] = [];
	// Keep help scrolling separate so toggling it never changes the context viewport.
	private readonly helpScroll = new ScrollView({ render: () => this.helpBody, invalidate: () => {} },
		{ scrollbar: "hidden", overscroll: "contain" });
	private readonly expanded = new Set<Group>();
	private readonly snapshot: ContextSnapshot;
	private readonly tui: { terminal: { rows: number }; requestRender(): void };
	private readonly theme: { fg(color: "accent" | "muted" | "dim" | "text" | "warning", text: string): string };
	private readonly done: () => void;
	constructor(
		snapshot: ContextSnapshot,
		tui: { terminal: { rows: number }; requestRender(): void },
		theme: { fg(color: "accent" | "muted" | "dim" | "text" | "warning", text: string): string },
		done: () => void,
	) { this.snapshot = snapshot; this.tui = tui; this.theme = theme; this.done = done; }
	invalidate(): void { /* Render uses the current theme on every call. */ }
	private items(): ListItem[] {
		const items: ListItem[] = [];
		for (const group of GROUPS) {
			const rows = this.snapshot.rows.filter((r) => r.group === group);
			if (!rows.length && this.snapshot.error) continue;
			items.push({ group });
			if (this.expanded.has(group)) items.push(...rows.map((row) => ({ group, row })));
		}
		return items;
	}
	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || data === "q") { this.done(); return; }
		if (data === "?") {
			this.help = !this.help;
			this.tui.requestRender();
			return;
		}
		if (this.help) {
			if (matchesKey(data, Key.down) || data === "j") this.helpScroll.scrollBy(1);
			else if (matchesKey(data, Key.up) || data === "k") this.helpScroll.scrollBy(-1);
			else if (matchesKey(data, Key.pageDown)) this.helpScroll.scrollBy(Math.max(1, this.helpScroll.viewportHeight - 1));
			else if (matchesKey(data, Key.pageUp)) this.helpScroll.scrollBy(-Math.max(1, this.helpScroll.viewportHeight - 1));
			return;
		}
		const items = this.items();
		const collapseKey = matchesKey(data, Key.left) || data === "h";
		const expandKey = matchesKey(data, Key.right) || data === "l";
		if (matchesKey(data, Key.enter) || expandKey || collapseKey) {
			const item = items[this.selected];
			if (!item) return;
			if (item.row) {
				if (!collapseKey) return;
				this.selected = items.findIndex((candidate) => candidate.group === item.group && !candidate.row);
				this.expanded.delete(item.group);
				this.tui.requestRender();
				return;
			}
			const expand = expandKey ? true : collapseKey ? false : !this.expanded.has(item.group);
			if (expand) this.expanded.add(item.group);
			else this.expanded.delete(item.group);
		}
		else if (matchesKey(data, Key.down) || data === "j") this.selected = Math.min(this.selected + 1, items.length - 1);
		else if (matchesKey(data, Key.up) || data === "k") this.selected = Math.max(0, this.selected - 1);
		else if (matchesKey(data, Key.pageDown)) this.selected = Math.min(this.selected + Math.max(1, this.tui.terminal.rows - 12), items.length - 1);
		else if (matchesKey(data, Key.pageUp)) this.selected = Math.max(0, this.selected - Math.max(1, this.tui.terminal.rows - 12));
		else return;
		this.tui.requestRender();
	}
	private helpLines(width: number): string[] {
		return [
			"LOCAL SHORTCUTS",
			"↑/k · ↓/j: move between sections and rows",
			"PgUp/PgDn: page through sections and rows",
			"Enter: toggle the selected section",
			"→/l: expand the selected section",
			"←/h: collapse a section, including from a child row",
			"?: return to context · Esc/q: close",
			"",
			"In help, ↑↓/jk scroll and PgUp/PgDn page.",
			"",
			"ABOUT THIS SNAPSHOT",
			"Read-only prompt, active tools and current conversation.",
			"Previews are clipped. Reopen /context for a fresh snapshot.",
			"≈ tokens use text code points / 4, not a provider tokenizer.",
			"Context files and skills overlap the system prompt; do not add their estimates.",
			"Pi usage estimates the last accounted request plus trailing content, not the final payload.",
		].flatMap((text) => wrapTextWithAnsi(text, width).map((line) => this.theme.fg(
			text === "LOCAL SHORTCUTS" || text === "ABOUT THIS SNAPSHOT" ? "accent" : "muted", line)));
	}
	private renderHelp(width: number, maxHeight: number): string[] {
		const header = maxHeight >= 4 ? [this.theme.fg("accent", " CONTEXT  ·  help")] : [];
		const footerHeight = maxHeight >= 2 ? 1 : 0;
		this.helpBody = this.helpLines(width).map((line) => truncateToWidth(line, width, "…"));
		const viewport = Math.max(1, Math.min(this.helpBody.length, maxHeight - header.length - footerHeight));
		this.helpScroll.updateLayout(this.helpBody.length, viewport, () => this.tui.requestRender());
		const start = this.helpScroll.scrollTop;
		const body = this.helpScroll.render(width).slice(start, start + viewport);
		const range = `${start + 1}-${Math.min(start + viewport, this.helpBody.length)}/${this.helpBody.length} · `;
		const footer = [range + "↑↓/jk scroll · PgUp/PgDn page · ? back · Esc/q close",
			"↑↓ scroll · ? back · Esc/q close", "? back · Esc/q close", "? · Esc/q close", "Esc/q · ?", "q ?", "q"]
			.find((text) => visibleWidth(text) <= width)!;
		return [...header, ...body, ...(footerHeight ? [this.theme.fg("dim", footer)] : [])];
	}
	render(width: number): string[] {
		if (width <= 0 || this.tui.terminal.rows <= 0) return [];
		const outerWidth = Math.min(width, 104);
		const boxed = outerWidth >= 12 && this.tui.terminal.rows >= 9;
		const w = boxed ? outerWidth - 4 : outerWidth;
		const maxHeight = Math.max(1, Math.min(this.tui.terminal.rows - 2,
			Math.floor(this.tui.terminal.rows * 0.85)) - (boxed ? 2 : 0));
		if (this.help) return this.frame(this.renderHelp(w, maxHeight), width, outerWidth, boxed);
		const { usage } = this.snapshot;
		const items = this.items();
		this.selected = Math.max(0, Math.min(this.selected, items.length - 1));
		const selected = items[this.selected];
		const preview = selected?.row?.preview ?? (selected ? GROUP_DETAILS[selected.group] : "No model-visible rows available.");
		const previewTitle = selected?.row ? safeText(selected.row.label) : selected?.group ?? "Preview";
		const selectedSource = selected?.row ? sourceName(selected.row.label) : null;
		// A narrower two-pane layout hides section names behind the count column.
		const sideBySide = w >= 80 && this.tui.terminal.rows >= 10;
		const leftWidth = sideBySide ? Math.max(39, Math.floor(w * 0.43)) : w;
		const rightWidth = sideBySide ? w - leftWidth - 3 : w;
		const previewPane = [
			...(selectedSource ? [this.theme.fg("accent", selectedSource)] : []),
			...wrapTextWithAnsi(previewTitle, rightWidth).map((line) => this.theme.fg("accent", line)),
			...wrapTextWithAnsi(safeText(preview), rightWidth).map((line) => this.theme.fg("muted", line)),
		];
		const lines: string[] = [];
		const add = (s: string) => lines.push(truncateToWidth(s, w, "…"));
		// Leave room for navigation and a preview before adding optional explanation.
		const headerBudget = Math.max(0, maxHeight - (sideBySide ? 1 : 2) - 1);
		if (maxHeight >= 7 && headerBudget >= 2) {
			add(this.theme.fg("accent", " CONTEXT  ·  current snapshot"));
			const usageLine = usage.percent === null ? `Pi used/window: unknown / ${usage.window ?? "unknown"}`
				: w < 42
					? `Est. ${usage.tokens?.toLocaleString("en-US")}/${usage.window?.toLocaleString("en-US")} ·${usage.percent.toFixed(1)}%`
					: w < 60
					? `Est. context: ${usage.tokens?.toLocaleString("en-US")}/${usage.window?.toLocaleString("en-US")} ·${usage.percent.toFixed(1)}%`
					: `Estimated context: ${usage.tokens?.toLocaleString("en-US")} / ${usage.window?.toLocaleString("en-US")} tokens ·${usage.percent.toFixed(1)}%`;
			add(this.theme.fg("muted", usageLine));
		}
		if (maxHeight >= 12) {
			const provenance = usage.percent === null ? usage.provenance
				: "Last accounted request + later content; not the final payload.";
			const wrapped = wrapTextWithAnsi(safeText(provenance), w);
			if (lines.length + wrapped.length <= headerBudget)
				for (const line of wrapped) add(this.theme.fg("dim", line));
		}
		if (maxHeight >= 16 && usage.percent !== null && lines.length < headerBudget) {
			const fill = Math.min(w, Math.max(0, Math.round(usage.percent * w / 100)));
			add(this.theme.fg("accent", "━".repeat(fill)) + this.theme.fg("dim", "─".repeat(w - fill)));
		}
		if (maxHeight >= 10 && lines.length < headerBudget) add(this.theme.fg("dim", w < 68
			? "≈ tokens · files/skills overlap"
			: "≈ text code points / 4 · prompt, files and skills overlap"));
		if (this.snapshot.error) {
			if (lines.length < headerBudget) add(this.theme.fg("warning", this.snapshot.error));
			else lines[0] = truncateToWidth(this.theme.fg("warning", this.snapshot.error), w, "…");
		}
		const footerHeight = maxHeight >= 4 ? 1 : 0;
		const height = Math.min(maxHeight, lines.length + footerHeight + (sideBySide
			? Math.max(items.length, previewPane.length, 1)
			: Math.max(items.length, 1) + previewPane.length));
		const remaining = height - lines.length - footerHeight;
		const minList = Math.min(Math.max(items.length, 1), Math.min(3, Math.max(1, Math.floor(remaining / 2))));
		const listHeight = sideBySide ? Math.max(1, remaining)
			: Math.max(minList, Math.min(Math.max(items.length, 1), remaining - previewPane.length));
		if (this.selected < this.scroll) this.scroll = this.selected;
		if (this.selected >= this.scroll + listHeight) this.scroll = this.selected - listHeight + 1;
		const listLines: string[] = [];
		for (let i = this.scroll; i < Math.min(items.length, this.scroll + listHeight); i++) {
			const item = items[i]!;
			let label: string;
			let suffix: string;
			if (item.row) {
				label = `    ${sourceName(item.row.label) ?? safeText(item.row.label)}`;
				suffix = `  ${item.row.estimate}`;
			} else {
				const rows = this.snapshot.rows.filter((r) => r.group === item.group);
				const known = rows.reduce((sum, r) => sum + (Number(r.estimate.slice(1)) || 0), 0);
				const unknown = rows.some((r) => r.estimate === "unknown");
				label = ` ${this.expanded.has(item.group) ? "▾" : "▸"} ${item.group}`;
				const estimate = `${known ? `~${known}` : unknown ? "unknown" : "~0"}${known && unknown ? "+?" : ""}`;
				suffix = `  ${rows.length} ${rows.length === 1 ? "item" : "items"} · ${estimate}`;
				if (visibleWidth(`›${label}${suffix}`) > leftWidth)
					suffix = `  ${rows.length} · ${estimate}`;
				if (visibleWidth(`›${label}${suffix}`) > leftWidth)
					suffix = ` ${rows.length}·${estimate}`;
			}
			const prefix = i === this.selected ? "›" : " ";
			suffix = truncateToWidth(suffix, Math.max(0, leftWidth - 1 - Math.min(visibleWidth(label), 19)), "…");
			const labelWidth = Math.max(0, leftWidth - visibleWidth(prefix + suffix));
			listLines.push(this.theme.fg(i === this.selected ? "accent" : "muted", prefix) +
				this.theme.fg(i === this.selected ? "text" : "muted", truncateToWidth(label, labelWidth, "…")) +
				this.theme.fg("dim", suffix));
		}
		if (!items.length) listLines.push(this.theme.fg("muted", "No model-visible rows available."));
		if (sideBySide) {
			for (let i = 0; i < listHeight; i++) {
				const left = truncateToWidth(listLines[i] ?? "", leftWidth, "…");
				const clippedPreview = i === listHeight - 1 && previewPane.length > listHeight;
				const right = truncateToWidth(clippedPreview ? this.theme.fg("dim", "… [preview clipped]")
					: previewPane[i] ?? "", rightWidth, "…");
				add(`${left}${" ".repeat(Math.max(0, leftWidth - visibleWidth(left)))} ${this.theme.fg("dim", "│")} ${right}`);
			}
		} else {
			for (const line of listLines) add(line);
			const room = height - lines.length - footerHeight;
			const shown = room === 1 ? previewPane.slice(1, 2) : previewPane.slice(0, Math.max(0, room));
			if (previewPane.length > room && room > 2)
				shown[shown.length - 1] = this.theme.fg("dim", "… [preview clipped]");
			else if (previewPane.length > room && room === 2)
				shown[1] = truncateToWidth(shown[1] ?? "", Math.max(0, w - 1), "…") + this.theme.fg("dim", "…");
			for (const line of shown) add(line);
		}
		if (footerHeight) {
			const help = selected?.row ? "↑↓ move · ← collapse · ? help · Esc/q close" : "↑↓ move · Enter toggle · ? help · Esc/q close";
			const compact = selected?.row ? "↑↓ · ← · ? · Esc/q close" : "↑↓ · Enter · ? · Esc/q close";
			const index = `${items.length ? this.selected + 1 : 0}/${items.length}  `;
			const text = [index + help, help, compact, "? help · Esc/q close", "? · Esc/q close", "Esc/q · ?", "q ?", "q"]
				.find((text) => visibleWidth(text) <= w)!;
			add(this.theme.fg("dim", text));
		}
		return this.frame(lines.slice(0, height), width, outerWidth, boxed);
	}
	private frame(body: string[], width: number, outerWidth: number, boxed: boolean): string[] {
		const w = boxed ? outerWidth - 4 : outerWidth;
		const centered = (line: string) => `${" ".repeat(Math.floor((width - outerWidth) / 2))}${truncateToWidth(line, boxed ? outerWidth : w, "…")}`;
		if (!boxed) return body.map(centered);
		const border = this.theme.fg("accent", `╭${"─".repeat(outerWidth - 2)}╮`);
		const end = this.theme.fg("accent", `╰${"─".repeat(outerWidth - 2)}╯`);
		return [border, ...body.map((line) => {
			const clipped = truncateToWidth(line, w, "…");
			return `${this.theme.fg("accent", "│")} ${clipped}${" ".repeat(Math.max(0, w - visibleWidth(clipped)))} ${this.theme.fg("accent", "│")}`;
		}), end].map(centered);
	}
}

export default function piContext(pi: ExtensionAPI): void {
	pi.registerCommand("context", {
		description: "Inspect a snapshot of current prompt, tools, and conversation context",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				if (ctx.hasUI) ctx.ui.notify("/context requires interactive TUI mode.", "warning");
				else console.error("/context requires interactive TUI mode.");
				return;
			}
			let snapshot: ContextSnapshot;
			try {
				// This is Pi's persisted, edit-aware projection, not a future request's provider-shaped payload.
				snapshot = createContextSnapshot({
					prompt: ctx.getSystemPrompt(), options: ctx.getSystemPromptOptions(),
					activeTools: pi.getActiveTools(), allTools: pi.getAllTools(),
					projection: ctx.sessionManager.buildSessionProjection(),
					branch: ctx.sessionManager.getBranch(), model: ctx.model, usage: ctx.getContextUsage(),
				});
			} catch {
				snapshot = { rows: [], usage: { tokens: null, window: null, percent: null, provenance: "Unknown" },
					error: "Context projection unavailable; no historical fallback was displayed." };
			}
			await ctx.ui.custom<void>((tui, theme, _keys, done) => new ContextModal(snapshot, tui, theme, done), {
				overlay: true, overlayOptions: { width: "90%", maxHeight: "85%", anchor: "center", margin: 1 },
			});
		},
	});
}
