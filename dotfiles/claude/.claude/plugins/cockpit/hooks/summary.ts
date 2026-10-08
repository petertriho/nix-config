import type { ThemeKey } from 'claude-code'
import type {
  CockpitActivity, CockpitAgent, CockpitCheck, CockpitContext, CockpitReview, CockpitTodo, CockpitTokenUsage,
  CockpitTool, CockpitTurn,
} from '../types'
import { brief, clip, colors, compact, humanize, percent, statusColor, statusGlyph, usd } from './theme'

export type Segment = { text: string; color?: ThemeKey; bold?: boolean }

const finite = (value: number | undefined | null): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// A finished call with a PostToolUse time reports execution alone. Otherwise
// the time includes any permission prompt and hook time.
export const toolDuration = (tool: CockpitTool, now: number): number | undefined => {
  if (tool.outcome !== 'running' && tool.runMs !== undefined) return tool.runMs
  const end = tool.finishedAt ?? (tool.outcome === 'running' ? now : undefined)
  if (end === undefined || !Number.isFinite(end) || !Number.isFinite(tool.startedAt)) return undefined
  return Math.max(0, end - tool.startedAt)
}

// The time around the execution: the permission prompt when one was asked, and hooks.
export const waitDuration = (tool: CockpitTool): number | undefined => {
  if (tool.finishedAt === undefined || tool.runMs === undefined) return undefined
  return Math.max(0, tool.finishedAt - tool.startedAt - tool.runMs)
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

export const planState = (activity: Pick<CockpitActivity, 'todos' | 'tasks'>): PlanState | undefined => {
  const todos = activity.todos.find(list => list.agentId === undefined)?.items ?? []
  if (todos.length > 0) {
    const current = todos.find(todo => todo.status === 'in_progress')
    return { done: todos.filter(todo => todo.status === 'completed').length, total: todos.length, current: current?.activeForm, noun: 'todos' }
  }
  if (activity.tasks.length === 0) return undefined
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

export const approvalWait = (tools: readonly CockpitTool[]): { asked: number; totalMs: number; measured: number } => {
  const asked = tools.filter(tool => tool.approval === 'asked')
  const waits = asked.map(waitDuration).filter(finite)
  return { asked: asked.length, totalMs: waits.reduce((total, wait) => total + wait, 0), measured: waits.length }
}

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

const segmentWidth = (segments: readonly Segment[]): number =>
  segments.reduce((total, segment) => total + [...segment.text].length, 0)

type Part = { priority: number; full: Segment[]; short?: Segment[] }

/**
 * The band line: what runs now, the plan, agents, context, checks, changes,
 * cost, background work. When the line is too wide, parts take their short
 * form, the lowest priorities drop, and the highest regain their full form.
 */
export const bandSegments = (
  activity: CockpitActivity, review: CockpitReview, context: CockpitContext,
  options: { isWorking: boolean; columns: number; now: number },
): Segment[] => {
  const parts: Part[] = []
  const status = sessionStatus(activity, options.isWorking)
  const since = finite(status.since) ? ` ${brief(options.now - status.since)}` : ''
  const lead = status.since === undefined ? undefined : leadTool(runningTools(activity))
  parts.push({
    priority: 0,
    full: [{ text: `${status.glyph} ${status.label}${since}`, color: status.color }],
    short: lead ? [{ text: `${status.glyph} ${lead.tool}${since}`, color: status.color }] : undefined,
  })
  const plan = planState(activity)
  if (plan) {
    parts.push({
      priority: 1,
      full: [{ text: `${plan.done}/${plan.total}${plan.current ? ` ${clip(plan.current, 32)}` : ` ${plan.noun}`}`, color: colors.accent }],
      short: [{ text: `${plan.done}/${plan.total}`, color: colors.accent }],
    })
  }
  const agents = activity.agents.filter(isLive).length
  if (agents > 0) parts.push({ priority: 2, full: [{ text: `${agents} ${agents === 1 ? 'agent' : 'agents'}`, color: colors.magenta }] })
  const fill = contextFill(context)
  if (finite(fill.percent)) {
    parts.push({ priority: 3, full: [{ text: `ctx ${percent(fill.percent)}`, color: contextColor(fill) }] })
  }
  const check = latestCheck(review)
  if (check) {
    const failed = check.status === 'failed' || (check.failed ?? 0) > 0
    const glyph = check.status === 'running' ? '◌' : statusGlyph(failed ? 'failed' : check.status)
    const color = check.status === 'running' ? colors.cyan : failed ? colors.red : statusColor(check.status)
    parts.push({
      priority: 4,
      full: [{ text: `${glyph} ${clip(check.label, 24)}${check.status === 'running' ? '' : ` ${checkResult(check)}`}`, color }],
      short: [{ text: `${glyph} ${clip(check.label, 12)}`, color }],
    })
  }
  const changes = changeTotals(review)
  if (changes.files > 0) {
    const counts: Segment[] = [
      { text: `+${compact(changes.additions)}`, color: colors.green }, { text: ' ' },
      { text: `−${compact(changes.deletions)}`, color: colors.red },
    ]
    parts.push({ priority: 5, full: [{ text: `${changes.files} ${changes.files === 1 ? 'file' : 'files'} ` }, ...counts], short: counts })
  }
  const cost = context.usage?.cost?.usd
  if (finite(cost)) parts.push({ priority: 6, full: [{ text: usd(cost), color: colors.muted }] })
  const background = activity.background.filter(task => task.endedAt === undefined).length
  if (background > 0) parts.push({ priority: 7, full: [{ text: `${background} bg`, color: colors.muted }] })
  const last = mainTurns(activity).at(-1)
  if (!options.isWorking && last) parts.push({ priority: 8, full: [{ text: `last turn ${brief(last.durationMs)}`, color: colors.muted }] })

  const separator = 3
  const measure = (kept: readonly Part[], form: (part: Part) => Segment[]) =>
    kept.reduce((total, part) => total + segmentWidth(form(part)), 0) + separator * Math.max(0, kept.length - 1)
  const full = new Set<Part>(parts)
  const form = (part: Part): Segment[] => full.has(part) ? part.full : part.short ?? part.full
  let kept = parts
  if (measure(kept, form) > options.columns) {
    full.clear()
    while (kept.length > 1 && measure(kept, form) > options.columns) {
      const lowest = Math.max(...kept.map(part => part.priority))
      kept = kept.filter(part => part.priority !== lowest)
    }
    for (const part of kept) {
      full.add(part)
      if (measure(kept, form) > options.columns) full.delete(part)
    }
  }
  const joined: Segment[] = []
  kept.forEach((part, index) => {
    if (index > 0) joined.push({ text: ' · ', color: colors.muted })
    joined.push(...form(part))
  })
  // The status part alone can still be too wide.
  if (kept.length === 1 && segmentWidth(joined) > options.columns) {
    const first = joined[0]
    if (first) return [{ ...first, text: clip(first.text, options.columns) }]
  }
  return joined
}
