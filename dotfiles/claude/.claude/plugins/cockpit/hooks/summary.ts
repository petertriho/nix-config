import type { ThemeKey } from 'claude-code'
import type {
  CockpitActivity, CockpitAgent, CockpitCheck, CockpitContext, CockpitReview, CockpitSample, CockpitTodo,
  CockpitTokenUsage, CockpitTool, CockpitTurn,
} from '../types'
import { bar, brief, cells, clip, colors, compact, humanize, sparkline, statusColor, statusGlyph, stopwatch } from './theme'

export type Segment = { text: string; color?: ThemeKey; backgroundColor?: ThemeKey; bold?: boolean }

const finite = (value: number | undefined | null): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// The time includes any permission prompt and hook time. Execution time alone
// comes only from the classic PostToolUse hook, which a managed security plugin
// keeps from installed plugins.
export const toolDuration = (tool: CockpitTool, now: number): number | undefined => {
  const end = tool.finishedAt ?? (tool.outcome === 'running' ? now : undefined)
  if (end === undefined || !Number.isFinite(end) || !Number.isFinite(tool.startedAt)) return undefined
  return Math.max(0, end - tool.startedAt)
}

export const runningTools = (activity: CockpitActivity): CockpitTool[] =>
  activity.tools.filter(tool => tool.outcome === 'running').sort((left, right) => right.startedAt - left.startedAt)

export const isLive = (agent: CockpitAgent): boolean =>
  agent.status === 'running' || agent.status === 'pending' || agent.status === 'waiting'

export const mainTurns = (activity: CockpitActivity): CockpitTurn[] =>
  activity.turns.filter(turn => turn.agentId === undefined)

export type TokenTotals = { input: number; output: number; cacheRead: number; cacheWrite: number }

export const tokenTotals = (usages: readonly (CockpitTokenUsage | undefined)[]): TokenTotals =>
  usages.reduce<TokenTotals>((total, usage) => usage ? {
    input: total.input + (usage.input_tokens || 0),
    output: total.output + (usage.output_tokens || 0),
    cacheRead: total.cacheRead + (usage.cache_read_input_tokens || 0),
    cacheWrite: total.cacheWrite + (usage.cache_creation_input_tokens || 0),
  } : total, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

/** The share of prompt tokens read from the cache; undefined before any prompt. */
export const cacheHit = (totals: TokenTotals): number | undefined => {
  const prompt = totals.input + totals.cacheRead + totals.cacheWrite
  return prompt > 0 ? totals.cacheRead / prompt * 100 : undefined
}

export const agentTokens = (agent: CockpitAgent): number | undefined => {
  if (agent.totals) return agent.totals.tokens
  if (!agent.usage) return undefined
  const totals = tokenTotals([agent.usage])
  return totals.input + totals.output + totals.cacheRead + totals.cacheWrite
}

/** How long an agent ran: its reported duration, or the time since it was first seen. */
export const agentElapsed = (agent: CockpitAgent, now: number): number | undefined => {
  if (agent.totals) return agent.totals.durationMs
  if (agent.durationMs !== undefined) return agent.durationMs
  if (agent.startedAt === undefined) return undefined
  return Math.max(0, (agent.completedAt ?? now) - agent.startedAt)
}

export const mainTodos = (activity: CockpitActivity): CockpitTodo[] =>
  activity.todos.find(list => list.agentId === undefined)?.items ?? []

export type PlanState = { done: number; total: number; current?: string; noun: 'todos' | 'tasks' }

/** The plan of the main session, or of one agent: its todos. Tasks belong to the main session. */
export const planState = (activity: Pick<CockpitActivity, 'todos' | 'tasks'>, agentId?: string): PlanState | undefined => {
  const todos = activity.todos.find(list => list.agentId === agentId)?.items ?? []
  if (todos.length > 0) {
    const current = todos.find(todo => todo.status === 'in_progress')
    return { done: todos.filter(todo => todo.status === 'completed').length, total: todos.length, current: current?.activeForm, noun: 'todos' }
  }
  if (agentId !== undefined || activity.tasks.length === 0) return undefined
  const current = activity.tasks.find(task => task.status === 'in_progress')
  return { done: activity.tasks.filter(task => task.status === 'completed').length, total: activity.tasks.length, current: current?.subject, noun: 'tasks' }
}

export const planProgress = (activity: Pick<CockpitActivity, 'todos' | 'tasks'>): string | undefined => {
  const plan = planState(activity)
  return plan ? `${plan.done}/${plan.total} ${plan.noun}` : undefined
}

export type ChangeTotals = { files: number; additions: number; deletions: number; staged: number; untracked: number }

export const changeTotals = (review: CockpitReview): ChangeTotals => ({
  files: review.changes.length,
  additions: review.changes.reduce((total, change) => total + change.additions, 0),
  deletions: review.changes.reduce((total, change) => total + change.deletions, 0),
  staged: review.changes.filter(change => change.staged).length,
  untracked: review.changes.filter(change => change.untracked).length,
})

/** A running check first; otherwise the one that finished last. */
export const latestCheck = (review: CockpitReview): CockpitCheck | undefined =>
  review.checks.filter(check => check.status === 'running').at(-1)
  ?? review.checks.filter(check => check.status !== 'running').slice().sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0)).at(-1)

export const checkResult = (check: CockpitCheck): string => {
  if (check.status === 'running') return 'running'
  if (check.failed !== undefined && check.failed > 0) return `${compact(check.failed)} failed`
  if (check.passed !== undefined) return `${compact(check.passed)} passed`
  return check.status
}

export type ContextFill = {
  tokens?: number
  window?: number
  percent?: number
  threshold?: number
  headroom?: number
  /** Average growth per measurement, after compactions are left out. */
  growth?: number
  responsesLeft?: number
}

export const contextFill = (context: CockpitContext): ContextFill => {
  const live = context.usage?.context
  const breakdown = live?.breakdown
  const threshold = breakdown?.isAutoCompactEnabled ? breakdown.autoCompactThreshold : undefined
  const tokens = live?.tokens
  const deltas = context.fills.slice(1).map((sample, index) => sample.tokens - (context.fills[index]?.tokens ?? sample.tokens))
    .filter(delta => delta > 0).slice(-5)
  const growth = deltas.length > 0 ? deltas.reduce((total, delta) => total + delta, 0) / deltas.length : undefined
  const headroom = finite(threshold) && finite(tokens) ? Math.max(0, threshold - tokens) : undefined
  return {
    tokens, window: live?.window, percent: live?.percent, threshold, headroom, growth,
    responsesLeft: finite(headroom) && finite(growth) && growth > 0 ? headroom / growth : undefined,
  }
}

/** The context share at which the band and header warn: near auto-compaction, or 80% without a threshold. */
export const contextColor = (fill: ContextFill): ThemeKey => {
  if (!finite(fill.percent)) return colors.muted
  const limit = finite(fill.threshold) && finite(fill.window) && fill.window > 0 ? fill.threshold / fill.window * 100 : 80
  if (fill.percent >= limit) return colors.red
  if (fill.percent >= limit - 10) return colors.yellow
  return colors.muted
}

export type ToolStat = { tool: string; calls: number; failures: number; totalMs: number; maxMs: number }

export const toolStats = (tools: readonly CockpitTool[], now: number): ToolStat[] => {
  const stats = new Map<string, ToolStat>()
  for (const tool of tools) {
    const stat = stats.get(tool.tool) ?? { tool: tool.tool, calls: 0, failures: 0, totalMs: 0, maxMs: 0 }
    const elapsed = toolDuration(tool, now) ?? 0
    stat.calls += 1
    if (tool.outcome === 'error' || tool.outcome === 'denied') stat.failures += 1
    stat.totalMs += elapsed
    stat.maxMs = Math.max(stat.maxMs, elapsed)
    stats.set(tool.tool, stat)
  }
  return [...stats.values()].sort((left, right) => right.totalMs - left.totalMs || right.calls - left.calls)
}

export const approvalCount = (tools: readonly CockpitTool[]): number =>
  tools.filter(tool => tool.approval === 'asked').length

export const sessionStart = (activity: CockpitActivity, context: CockpitContext): number | undefined => {
  const started = context.usage?.startedAt
  if (finite(started)) return started
  const times = [
    ...activity.tools.map(tool => tool.startedAt),
    ...activity.turns.map(turn => turn.finishedAt - turn.durationMs),
    ...activity.samples.map(sample => sample.at),
  ].filter(finite)
  return times.length > 0 ? Math.min(...times) : undefined
}

export const toolLabel = (tool: CockpitTool): string => tool.target ? `${tool.tool} ${tool.target}` : tool.tool

/** The main thread's own call first, then a subagent it waits on, then any running call. */
export const leadTool = (running: readonly CockpitTool[]): CockpitTool | undefined =>
  running.find(tool => tool.agentId === undefined && tool.tool !== 'Agent')
  ?? running.find(tool => tool.agentId === undefined)
  ?? running[0]

export type StatusSummary = { glyph: string; label: string; color: ThemeKey; since?: number }

/** What the main session is doing now, for the band and the pane header. */
export const sessionStatus = (activity: CockpitActivity, isWorking: boolean): StatusSummary => {
  const failure = isWorking ? null : activity.stopFailure
  if (failure) return { glyph: '✗', label: `stopped: ${humanize(failure.error)}`, color: colors.red }
  const running = runningTools(activity)
  const lead = leadTool(running)
  if (lead) {
    const more = running.length > 1 ? ` +${running.length - 1}` : ''
    return { glyph: '▸', label: `${toolLabel(lead)}${more}`, color: colors.cyan, since: lead.startedAt }
  }
  if (isWorking) return { glyph: '▸', label: 'thinking', color: colors.cyan, since: activity.turnStartedAt ?? undefined }
  if (activity.phase === 'error') return { glyph: '✗', label: 'last turn failed', color: colors.red }
  return { glyph: '○', label: 'idle', color: colors.muted }
}

// Activity history: one level per bucket, for the band and the Activity view.
export const HISTORY_BUCKET_MS = 5000

// The level per bucket for the newest buckets up to `now`: the highest level
// reached in the bucket, or the level carried from the sample before it.
export const activityHistory = (
  samples: readonly CockpitSample[], now: number, columns: number, bucketMs = HISTORY_BUCKET_MS,
): number[] => {
  const sorted = samples.filter(sample => finite(sample?.at) && finite(sample?.level)).slice().sort((left, right) => left.at - right.at)
  const first = sorted[0]
  if (first === undefined || !finite(now)) return []
  const width = Math.max(1, Math.min(120, Math.floor(Number.isFinite(columns) ? columns : 40)))
  const end = Math.floor(now / bucketMs)
  const begin = Math.max(end - width + 1, Math.floor(first.at / bucketMs))
  let carried = 0
  let cursor = 0
  while (cursor < sorted.length && Math.floor((sorted[cursor]?.at ?? 0) / bucketMs) < begin) {
    carried = sorted[cursor]?.level ?? carried
    cursor += 1
  }
  const levels: number[] = []
  for (let bucket = begin; bucket <= end; bucket += 1) {
    let peak = carried
    while (cursor < sorted.length && Math.floor((sorted[cursor]?.at ?? 0) / bucketMs) === bucket) {
      carried = sorted[cursor]?.level ?? carried
      peak = Math.max(peak, carried)
      cursor += 1
    }
    levels.push(peak)
  }
  return levels
}

// ---------------------------------------------------------------- band

export type BandRow = { start: Segment[]; end: Segment[] }

export type BandOptions = {
  isWorking: boolean
  columns: number
  now: number
  /** The agent whose transcript is on screen; absent for the main conversation. */
  agentId?: string
  /** The spinner frame; absent while animation is off. */
  frame?: number
}

const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const GAP = 2
const SPARK_BUCKETS = 10
const SPARK_BUCKET_MS = 30000

const width = (segments: readonly Segment[]): number =>
  segments.reduce((total, segment) => total + cells(segment.text), 0)

const spin = (frame: number | undefined): string =>
  frame === undefined || !finite(frame) ? '▸' : SPINNER[Math.abs(Math.floor(frame)) % SPINNER.length] ?? '▸'

// Seconds while they change, then minutes, so that a chip keeps its width.
const age = (ms: number): string => ms < 60000 ? stopwatch(ms) : brief(ms)

const agentLabel = (agent: CockpitAgent): string => agent.name ?? agent.type

/** Edits that finished after a check can have changed its result. */
export const isStale = (check: CockpitCheck, tools: readonly CockpitTool[]): boolean => {
  const finished = check.finishedAt
  if (check.status === 'running' || !finite(finished)) return false
  return tools.some(tool => EDIT_TOOLS.has(tool.tool) && tool.outcome === 'success'
    && (tool.finishedAt ?? tool.startedAt) > finished)
}

/** A bar in eighths of a cell over a muted track. */
const gauge = (fraction: number, columns: number, color: ThemeKey): Segment[] => {
  const filled = bar(fraction, columns)
  const whole = filled.replace(/[^█]/g, '')
  const segments: Segment[] = [
    { text: whole, color },
    { text: filled.slice(whole.length), color, backgroundColor: colors.muted },
    { text: ' '.repeat(Math.max(0, columns - [...filled].length)), backgroundColor: colors.muted },
  ]
  return segments.filter(segment => segment.text !== '')
}

/** Five cells split between additions and deletions, as `git diff --stat` splits its bar. */
const diffstat = (additions: number, deletions: number): Segment[] => {
  const total = additions + deletions
  if (!(total > 0)) return []
  const added = deletions === 0 ? 5 : additions === 0 ? 0 : Math.min(4, Math.max(1, Math.round(additions / total * 5)))
  const segments: Segment[] = [{ text: '▮'.repeat(added), color: colors.green }, { text: '▮'.repeat(5 - added), color: colors.red }]
  return segments.filter(segment => segment.text !== '')
}

const checkCounts = (check: CockpitCheck): string => {
  if (check.failed !== undefined && check.failed > 0) {
    return check.passed === undefined ? `${compact(check.failed)} failed` : `${compact(check.failed)}/${compact(check.failed + check.passed)} failed`
  }
  if (check.passed !== undefined) return `${compact(check.passed)} passed`
  return check.status
}

type Part = { priority: number; full: Segment[]; short?: Segment[]; end?: true }

const clipSegments = (segments: readonly Segment[], columns: number): Segment[] => {
  const clipped: Segment[] = []
  let left = columns
  for (const segment of segments) {
    const size = cells(segment.text)
    if (size <= left) {
      clipped.push(segment)
      left -= size
      continue
    }
    let text = ''
    for (const char of segment.text) {
      if (cells(text + char) > left - 1) break
      text += char
    }
    if (left >= 1) clipped.push({ ...segment, text: `${text}…` })
    break
  }
  return clipped
}

/**
 * One band row. When the row is too wide, every part takes its short form, the
 * lowest priorities drop, and the highest regain their full form while it fits.
 */
const fitRow = (parts: readonly Part[], columns: number): BandRow | undefined => {
  if (parts.length === 0) return undefined
  const full = new Set<Part>(parts)
  const form = (part: Part): Segment[] => full.has(part) ? part.full : part.short ?? part.full
  const measure = (kept: readonly Part[]) =>
    kept.reduce((total, part) => total + width(form(part)), 0) + GAP * Math.max(0, kept.length - 1)
  let kept = [...parts]
  if (measure(kept) > columns) {
    full.clear()
    while (kept.length > 1 && measure(kept) > columns) {
      const lowest = Math.max(...kept.map(part => part.priority))
      kept = kept.filter(part => part.priority !== lowest)
    }
    for (const part of kept) {
      full.add(part)
      if (measure(kept) > columns) full.delete(part)
    }
  }
  const join = (side: readonly Part[]): Segment[] =>
    side.flatMap((part, index) => index > 0 ? [{ text: ' '.repeat(GAP) }, ...form(part)] : form(part))
  const start = join(kept.filter(part => !part.end))
  const end = join(kept.filter(part => part.end))
  // A part left alone can still be too wide.
  if (measure(kept) > columns) return { start: clipSegments([...start, ...end], columns), end: [] }
  return { start, end }
}

/** What the main session runs now, or why it stopped; nothing while idle. */
const mainStatus = (activity: CockpitActivity, isWorking: boolean, glyph: string, now: number): Part | undefined => {
  const failure = isWorking ? null : activity.stopFailure
  if (failure) return { priority: 0, full: [{ text: `✗ stopped: ${humanize(failure.error)}`, color: colors.red }] }
  const running = runningTools(activity)
  const lead = leadTool(running)
  if (lead) {
    const tail = ` ${stopwatch(now - lead.startedAt)}${running.length > 1 ? ` +${running.length - 1}` : ''}`
    return {
      priority: 0,
      full: [{ text: `${glyph} ${clip(toolLabel(lead), 40)}${tail}`, color: colors.cyan }],
      short: [{ text: `${glyph} ${clip(lead.tool, 16)}${tail}`, color: colors.cyan }],
    }
  }
  if (isWorking) return { priority: 0, full: [{ text: `${glyph} thinking`, color: colors.cyan }] }
  if (activity.phase === 'error') return { priority: 0, full: [{ text: '✗ last turn failed', color: colors.red }] }
  return undefined
}

/** What the agent in view runs now, or its status, after its name. */
const agentStatus = (activity: CockpitActivity, agentId: string, glyph: string, now: number): Part => {
  const agent = activity.agents.find(item => item.id === agentId)
  const name: Segment = { text: `${clip(agent ? agentLabel(agent) : 'agent', 16)} › `, color: colors.magenta }
  const own = runningTools(activity).filter(tool => tool.agentId === agentId)
  const lead = own.find(tool => tool.tool !== 'Agent') ?? own[0]
  if (lead) {
    const tail = ` ${stopwatch(now - lead.startedAt)}${own.length > 1 ? ` +${own.length - 1}` : ''}`
    return {
      priority: 0,
      full: [name, { text: `${glyph} ${clip(toolLabel(lead), 40)}${tail}`, color: colors.cyan }],
      short: [name, { text: `${glyph} ${clip(lead.tool, 16)}${tail}`, color: colors.cyan }],
    }
  }
  if (agent && isLive(agent)) return { priority: 0, full: [name, { text: `${glyph} thinking`, color: colors.cyan }] }
  const status = agent?.status ?? 'missing'
  const elapsed = agent ? agentElapsed(agent, now) : undefined
  return {
    priority: 0,
    full: [name, { text: `${statusGlyph(status)} ${status}${elapsed === undefined ? '' : ` ${age(elapsed)}`}`, color: statusColor(status) }],
  }
}

/**
 * The band: what runs now, then where the work stands. The first row shows
 * while anything runs, and drops while the session is idle. The status line
 * shows the model, context fill, and cost, and the engine shows the turn time,
 * so the band leaves them out.
 */
export const bandRows = (
  activity: CockpitActivity, review: CockpitReview, context: CockpitContext, options: BandOptions,
): BandRow[] => {
  const { agentId, now } = options
  const columns = Math.max(8, Math.floor(options.columns))
  const glyph = spin(options.frame)

  const running: Part[] = []
  const status = agentId === undefined
    ? mainStatus(activity, options.isWorking, glyph, now)
    : agentStatus(activity, agentId, glyph, now)
  if (status) running.push(status)
  const live = activity.agents.filter(agent => isLive(agent) && agent.id !== agentId)
    .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0))
  if (live.length > 0) {
    const chips = live.map((agent): Segment[] => {
      const elapsed = agentElapsed(agent, now)
      return [{
        text: `${agent.status === 'pending' ? '○' : '◐'} ${clip(agentLabel(agent), 16)}${elapsed === undefined ? '' : ` ${age(elapsed)}`}`,
        color: agent.status === 'waiting' ? colors.yellow : colors.magenta,
      }]
    })
    running.push({
      priority: 1,
      full: chips.flatMap((chip, index) => index > 0 ? [{ text: ' '.repeat(GAP) }, ...chip] : chip),
      short: [{ text: `◐ ${live.length} ${live.length === 1 ? 'agent' : 'agents'}`, color: colors.magenta }],
    })
  }
  if (running.length > 0) {
    const history = activityHistory(activity.samples, now, SPARK_BUCKETS, SPARK_BUCKET_MS)
    if (history.length > 1) running.push({ priority: 2, end: true, full: [{ text: sparkline(history, SPARK_BUCKETS), color: colors.cyan }] })
  }

  const state: Part[] = []
  const viewed = agentId === undefined ? undefined : activity.agents.find(agent => agent.id === agentId)
  const plan = planState(activity, agentId)
  // A finished plan stays only while its work runs.
  if (plan && (plan.done < plan.total || (viewed ? isLive(viewed) : options.isWorking))) {
    const progress = gauge(plan.total > 0 ? plan.done / plan.total : 0, 6, colors.accent)
    state.push({
      priority: 0,
      full: [...progress, { text: ` ${plan.done}/${plan.total}${plan.current ? ` ${clip(plan.current, 32)}` : ` ${plan.noun}`}`, color: colors.accent }],
      short: [...progress, { text: ` ${plan.done}/${plan.total}`, color: colors.accent }],
    })
  }
  const check = latestCheck(review)
  if (check) {
    const failed = check.status === 'failed' || (check.failed ?? 0) > 0
    const stale = isStale(check, activity.tools)
    const mark = check.status === 'running' ? glyph : statusGlyph(failed ? 'failed' : check.status)
    const color = stale ? colors.muted : check.status === 'running' ? colors.cyan : failed ? colors.red : statusColor(check.status)
    const result = check.status === 'running' ? '' : ` ${checkCounts(check)}${stale ? ' (stale)' : ''}`
    state.push({
      priority: 1,
      full: [{ text: `${mark} ${clip(check.label, 24)}${result}`, color }],
      short: [{ text: `${mark} ${clip(check.label, 12)}`, color }],
    })
  }
  const changes = changeTotals(review)
  if (changes.files > 0) {
    const counts: Segment[] = [
      { text: `+${compact(changes.additions)}`, color: colors.green }, { text: ' ' },
      { text: `−${compact(changes.deletions)}`, color: colors.red },
    ]
    const stat = diffstat(changes.additions, changes.deletions)
    state.push({
      priority: 2,
      full: [{ text: `${changes.files} ${changes.files === 1 ? 'file' : 'files'} ` }, ...counts, ...(stat.length > 0 ? [{ text: ' ' }, ...stat] : [])],
      short: counts,
    })
  }
  const fill = contextFill(context)
  const warning = contextColor(fill)
  // Only near auto-compaction: the status line shows the fill, not the threshold.
  if (finite(fill.threshold) && warning !== colors.muted) {
    const replies = finite(fill.responsesLeft) ? Math.floor(fill.responsesLeft) : undefined
    const full = replies === undefined
      ? finite(fill.headroom) && fill.headroom > 0 ? `${compact(fill.headroom)} to compact` : 'compaction due'
      : replies < 1 ? 'compaction next' : `~${replies} ${replies === 1 ? 'reply' : 'replies'} to compact`
    const short = replies === undefined
      ? finite(fill.headroom) && fill.headroom > 0 ? compact(fill.headroom) : 'due'
      : replies < 1 ? 'next' : `~${replies}`
    state.push({ priority: 3, full: [{ text: `⟳ ${full}`, color: warning }], short: [{ text: `⟳ ${short}`, color: warning }] })
  }

  return [fitRow(running, columns), fitRow(state, columns)].filter((row): row is BandRow => row !== undefined)
}
