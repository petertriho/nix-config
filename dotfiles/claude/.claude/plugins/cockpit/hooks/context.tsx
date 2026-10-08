import type { ContextCategory, RenderElement, SessionContextBreakdown, ThemeKey } from 'claude-code'
import type { CockpitCompaction, CockpitCostSample, CockpitViewProps } from '../types'
import { actions, field, heading, line, muted, section, sparkline, viewWidth } from './layout'
import type { Segment } from './summary'
import { cacheHit, contextColor, contextFill, mainTurns, sessionStart, tokenTotals } from './summary'
import type { CockpitElements } from './theme'
import { ago, bar, brief, cleanText, clip, colors, compact, count, humanize, meter, padEnd, padStart, percent, shortModel, usd } from './theme'

const palette: ThemeKey[] = [colors.accent, colors.cyan, colors.green, colors.magenta, colors.yellow, colors.red]

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)

export const categoryColor = (category: Pick<ContextCategory, 'kind'>, index: number): ThemeKey => {
  if (category.kind === 'free') return colors.muted
  if (category.kind === 'buffer') return colors.yellow
  if (category.kind === 'deferred') return colors.magenta
  return palette[index % palette.length] ?? colors.accent
}

export type RankedEstimate = { label: string; tokens: number; detail?: string }

export const rankedEstimates = (breakdown: SessionContextBreakdown): {
  memory: RankedEstimate[]
  mcp: RankedEstimate[]
  skills: RankedEstimate[]
} => {
  const servers = new Map<string, { tokens: number; loaded: number; total: number; deferred: number }>()
  for (const tool of breakdown.mcpTools) {
    const server = servers.get(tool.serverName) ?? { tokens: 0, loaded: 0, total: 0, deferred: 0 }
    const tokens = Number.isFinite(tool.tokens) ? Math.max(0, tool.tokens) : 0
    server.tokens += tokens
    server.total += 1
    if (tool.isLoaded) server.loaded += 1
    else server.deferred += tokens
    servers.set(tool.serverName, server)
  }
  const descending = (a: RankedEstimate, b: RankedEstimate): number => b.tokens - a.tokens
  return {
    memory: breakdown.memoryFiles
      .map(file => ({ label: file.path, tokens: file.tokens, detail: file.type }))
      .sort(descending),
    mcp: Array.from(servers, ([label, server]) => ({
      label,
      tokens: server.tokens,
      detail: `${server.loaded}/${server.total} loaded; ${count(server.deferred)} deferred`,
    })).sort(descending),
    skills: (breakdown.skills?.skillFrontmatter ?? [])
      .map(skill => ({ label: skill.name, tokens: skill.tokens, detail: skill.pluginName ?? skill.source }))
      .sort(descending),
  }
}

// Each cost sample is the session total after a main turn grew it. The first
// sample can hold earlier turns, so only differences between samples count.
export const costPerTurn = (costs: readonly CockpitCostSample[]): number[] =>
  costs.slice(1).map((sample, index) => Math.max(0, sample.usd - (costs[index]?.usd ?? sample.usd)))

export const compactionLine = (entry: CockpitCompaction, now: number): string => {
  const who = `${humanize(entry.trigger)}${entry.agentId ? ' (agent)' : ''}`
  if (entry.skipped !== undefined) return `${who} · skipped: ${entry.skipped} · ${ago(now, entry.at)}`
  const saved = finite(entry.tokensBefore) && finite(entry.tokensAfter) && entry.tokensBefore > 0
    ? ` (−${Math.round((1 - entry.tokensAfter / entry.tokensBefore) * 100)}%)` : ''
  return `${who} · ${compact(entry.tokensBefore)} → ${compact(entry.tokensAfter)}${saved} · ${ago(now, entry.at)}`
}

type Cell = { glyph: string; color: ThemeKey }

/**
 * One line across the window: each used category in its color, free space up
 * to the auto-compaction threshold, the threshold mark, and the reserve after it.
 */
export const contextGauge = (
  breakdown: SessionContextBreakdown | undefined, tokens: number | undefined, window: number | undefined,
  threshold: number | undefined, columns: number,
): Cell[] => {
  const cells = Math.max(8, Math.floor(columns))
  const size = finite(window) && window > 0 ? window : breakdown?.rawMaxTokens
  if (!finite(size) || size <= 0) return []
  const used = breakdown?.categories.filter(category => category.kind === 'used' || category.kind === 'deferred') ?? []
  const estimate = used.reduce((total, category) => total + Math.max(0, category.tokens), 0)
  // Scale the estimate to the live fill, which the last response measured.
  const scale = finite(tokens) && estimate > 0 ? tokens / estimate : 1
  const result: Cell[] = []
  if (used.length > 0) {
    let carried = 0
    used.forEach((category, index) => {
      const exact = Math.max(0, category.tokens) * scale / size * cells + carried
      // The epsilon keeps float error in the carried fractions from losing a cell.
      const whole = Math.floor(exact + 1e-9)
      carried = exact - whole
      const colorIndex = breakdown?.categories.indexOf(category) ?? index
      for (let cell = 0; cell < whole && result.length < cells; cell += 1) result.push({ glyph: '█', color: categoryColor(category, colorIndex) })
    })
  } else if (finite(tokens)) {
    for (let cell = 0; cell < Math.round(tokens / size * cells) && result.length < cells; cell += 1) result.push({ glyph: '█', color: colors.accent })
  }
  const mark = finite(threshold) ? Math.min(cells - 1, Math.round(threshold / size * cells)) : undefined
  while (result.length < cells) {
    const index = result.length
    if (mark !== undefined && index === mark) result.push({ glyph: '┃', color: colors.yellow })
    else if (mark !== undefined && index > mark) result.push({ glyph: '░', color: colors.muted })
    else result.push({ glyph: '─', color: colors.muted })
  }
  if (mark !== undefined && result[mark]?.glyph === '█') result[mark] = { glyph: '┃', color: colors.red }
  return result
}

const runs = (cells: readonly Cell[]): Segment[] => {
  const merged: Segment[] = []
  for (const cell of cells) {
    const last = merged[merged.length - 1]
    if (last && last.color === cell.color) last.text += cell.glyph
    else merged.push({ text: cell.glyph, color: cell.color })
  }
  return merged
}

const resetText = (value: string | undefined, now: number): string => {
  if (!value) return 'reset unknown'
  const at = Date.parse(value)
  return Number.isFinite(at) ? `resets in ${brief(Math.max(0, at - now))}` : `resets ${cleanText(value)}`
}

const fillSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement => {
  const { Box } = ui
  const usage = props.context.usage
  const breakdown = usage?.context.breakdown
  const fill = contextFill(props.context)
  const gauge = contextGauge(breakdown, fill.tokens, fill.window, fill.threshold, width)
  const trend = props.context.fills.map(sample => sample.tokens)
  const color = contextColor(fill)
  return (
    <Box key="context:fill" flexDirection="column" width="100%">
      {heading(ui, 'context:title', 'Context', [
        { text: shortModel(breakdown?.model ?? props.activity.model ?? ''), color: colors.muted },
        { text: finite(fill.window) ? ` · ${compact(fill.window)} window` : '', color: colors.muted },
      ], width)}
      {line(ui, 'context:headline', [
        { text: finite(fill.tokens) ? count(fill.tokens) : 'Not measured yet', bold: true },
        { text: finite(fill.tokens) ? ' tokens' : '', color: colors.muted },
        { text: finite(fill.percent) ? ` · ${percent(fill.percent)}` : '', color: color === colors.muted ? colors.accent : color, bold: true },
        { text: finite(fill.window) ? ` of ${compact(fill.window)}` : '', color: colors.muted },
      ])}
      {gauge.length > 0 && line(ui, 'context:gauge', runs(gauge))}
      {finite(fill.threshold) ? line(ui, 'context:headroom', [
        { text: `${compact(fill.headroom)} left`, color: color === colors.muted ? colors.green : color, bold: true },
        { text: ` before auto-compact at ${compact(fill.threshold)}`, color: colors.muted },
      ], true) : breakdown && !breakdown.isAutoCompactEnabled ? muted(ui, 'context:no-compact', 'Auto-compact is off.') : null}
      {trend.length > 1 && line(ui, 'context:trend', [
        { text: 'Trend ', color: colors.muted },
        { text: sparkline(trend, Math.min(12, trend.length)), color: colors.cyan },
        { text: finite(fill.growth) ? ` +${compact(fill.growth)} per response` : '' },
        { text: finite(fill.responsesLeft) ? ` · ~${fill.responsesLeft < 10 ? fill.responsesLeft.toFixed(1) : Math.round(fill.responsesLeft)} responses to compact` : '', color: color === colors.muted ? colors.muted : color },
      ], true)}
      {props.context.error && line(ui, 'context:error', [{ text: clip(props.context.error, 280), color: colors.red }], true)}
      {actions(ui, 'context:actions', [
        { key: 'context:refresh', label: props.context.loading ? 'Estimating…' : 'Estimate categories', hotkey: 'r', onPress: props.actions.refreshContext },
      ])}
    </Box>
  )
}

const breakdownSection = (ui: CockpitElements, props: CockpitViewProps, breakdown: SessionContextBreakdown, width: number): RenderElement => {
  const nameWidth = Math.min(18, Math.max(10, ...breakdown.categories.map(category => category.name.length)))
  const barWidth = Math.max(0, width - nameWidth - 7 - 5 - 2)
  const size = Math.max(1, breakdown.rawMaxTokens)
  const largest = Math.max(1, ...breakdown.categories.filter(category => category.kind === 'used' || category.kind === 'deferred').map(category => category.tokens))
  return section(ui, 'context:breakdown', [
    heading(ui, 'context:breakdown:title', 'Breakdown', [
      { text: `estimated ${props.context.refreshedAt === null ? '' : ago(props.now, props.context.refreshedAt)}`, color: colors.muted },
    ], width),
    ...breakdown.categories.slice(0, 14).map((category, index) => {
      const reserved = category.kind === 'free' || category.kind === 'buffer'
      return line(ui, `context:category:${index}`, [
        { text: '■ ', color: categoryColor(category, index) },
        { text: padEnd(clip(`${category.name}${category.kind === 'deferred' ? '*' : ''}`, nameWidth), nameWidth), color: reserved ? colors.muted : undefined },
        { text: padStart(compact(category.tokens), 7), color: reserved ? colors.muted : undefined },
        { text: padStart(percent(category.tokens / size * 100), 5), color: colors.muted },
        { text: reserved || barWidth === 0 ? '' : ` ${bar(category.tokens / largest, barWidth)}`, color: categoryColor(category, index) },
      ])
    }),
    breakdown.categories.some(category => category.kind === 'deferred') ? muted(ui, 'context:deferred', '* deferred: loaded only when used.') : null,
  ])
}

const consumers = (ui: CockpitElements, breakdown: SessionContextBreakdown, width: number): RenderElement | null => {
  const ranked = rankedEstimates(breakdown)
  const list = (entries: { label: string; tokens: number }[], limit: number): Segment[] =>
    entries.slice(0, limit).flatMap((entry, index) => [
      { text: index > 0 ? ' · ' : '', color: colors.muted },
      { text: clip(entry.label.replace(/^.*\/(?=[^/]+\/[^/]+$)/, ''), 24) },
      { text: ` ${compact(entry.tokens)}`, color: colors.cyan },
    ])
  const rows = [
    ranked.memory.length > 0 ? field(ui, 'context:consumers:memory', 'Memory', list(ranked.memory, 3)) : null,
    ranked.mcp.length > 0 ? field(ui, 'context:consumers:mcp', 'MCP', list(ranked.mcp, 3)) : null,
    breakdown.skills ? field(ui, 'context:consumers:skills', 'Skills', [
      { text: `${count(breakdown.skills.includedSkills)}/${count(breakdown.skills.totalSkills)} listed`, color: colors.muted },
      { text: ranked.skills.length > 0 ? ' · ' : '', color: colors.muted },
      ...list(ranked.skills, 2),
    ]) : null,
  ]
  if (rows.every(row => row === null)) return null
  return section(ui, 'context:consumers', [heading(ui, 'context:consumers:title', 'Largest', [{ text: 'estimated', color: colors.muted }], width), ...rows])
}

const usageSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const turns = mainTurns(props.activity)
  const last = turns.filter(turn => turn.usage).at(-1)?.usage
  if (!last) return null
  const lastTotals = tokenTotals([last])
  const session = tokenTotals(turns.map(turn => turn.usage))
  const lastHit = cacheHit(lastTotals)
  const sessionHit = cacheHit(session)
  const column = 7
  const row = (key: string, label: string, totals: typeof session, hit: number | undefined): RenderElement => line(ui, key, [
    { text: padEnd(label, 10), color: colors.muted },
    ...[totals.input, totals.output, totals.cacheRead, totals.cacheWrite].map(value => ({ text: padStart(compact(value), column) })),
    { text: padStart(percent(hit), column), color: hit !== undefined && hit < 50 ? colors.yellow : colors.green },
  ])
  return section(ui, 'context:usage', [
    heading(ui, 'context:usage:title', 'Tokens', [{ text: 'main session', color: colors.muted }], width),
    line(ui, 'context:usage:columns', [{ text: `${padEnd('', 10)}${['input', 'output', 'read', 'write', 'hit'].map(name => padStart(name, column)).join('')}`, color: colors.muted }]),
    row('context:usage:last', 'Last turn', lastTotals, lastHit),
    row('context:usage:session', `${turns.length} ${turns.length === 1 ? 'turn' : 'turns'}`, session, sessionHit),
  ])
}

const costSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement => {
  const usage = props.context.usage
  const total = usage?.cost?.usd
  const perTurn = costPerTurn(props.context.costs)
  const last = perTurn.at(-1)
  const average = perTurn.length > 0 ? perTurn.reduce((sum, value) => sum + value, 0) / perTurn.length : undefined
  const started = sessionStart(props.activity, props.context)
  const hours = finite(started) ? (props.now - started) / 3600000 : undefined
  const rate = finite(total) && finite(hours) && hours > 0.05 ? total / hours : undefined
  const limits = usage?.rateLimits ?? []
  return section(ui, 'context:cost', [
    heading(ui, 'context:cost:title', 'Cost', [{ text: finite(total) ? usd(total) : 'not reported', color: finite(total) ? colors.accent : colors.muted, bold: true }], width),
    last !== undefined ? line(ui, 'context:cost:turns', [
      { text: 'Last turn ', color: colors.muted }, { text: usd(last) },
      { text: ' · avg ', color: colors.muted }, { text: average === undefined ? '?' : usd(average) },
      { text: rate === undefined ? '' : ' · ', color: colors.muted }, { text: rate === undefined ? '' : `${usd(rate)}/h` },
      { text: perTurn.length > 1 ? `  ${sparkline(perTurn, Math.min(20, width - 44))}` : '', color: colors.cyan },
    ]) : null,
    ...limits.slice(0, 6).map((limit, index) => {
      const used = limit.percentUsed
      const color = used >= 90 ? colors.red : used >= 75 ? colors.yellow : colors.cyan
      return line(ui, `context:limit:${index}`, [
        { text: padEnd(clip(humanize(limit.kind), 10), 10), color: colors.muted },
        { text: padStart(percent(used), 5), color },
        { text: ` ${meter(used, Math.max(6, Math.min(20, width - 36)))} `, color },
        { text: resetText(limit.resetsAt, props.now), color: colors.muted },
      ])
    }),
    limits.length === 0 ? muted(ui, 'context:limits:none', 'Rate limits not reported.') : null,
  ])
}

const compactionSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const entries = props.context.compactions
  if (entries.length === 0) return null
  return section(ui, 'context:compactions', [
    heading(ui, 'context:compactions:title', 'Compactions', [{ text: `${entries.length}`, color: colors.muted }], width),
    ...entries.slice(-5).reverse().map((entry, index) => line(ui, `context:compaction:${index}`, [
      { text: entry.skipped === undefined ? '⇣ ' : '· ', color: entry.skipped === undefined ? colors.cyan : colors.yellow },
      { text: clip(compactionLine(entry, props.now), width - 2), color: entry.skipped === undefined ? undefined : colors.yellow },
    ])),
  ])
}

export const renderContext = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box } = ui
  const width = viewWidth(props)
  const wide = width >= 100
  const left = wide ? Math.floor((width - 2) / 2) : width
  const right = wide ? width - left - 2 : width
  const breakdown = props.context.usage?.context.breakdown
  const keep = (items: (RenderElement | null)[]) => items.filter((item): item is RenderElement => Boolean(item))
  const first = keep([
    fillSection(ui, props, left),
    breakdown ? breakdownSection(ui, props, breakdown, left) : muted(ui, 'context:breakdown:none', 'Estimate categories to see what fills the window.'),
  ])
  const second = keep([
    usageSection(ui, props, right),
    costSection(ui, props, right),
    breakdown ? consumers(ui, breakdown, right) : null,
    compactionSection(ui, props, right),
  ])
  return wide ? (
    <Box flexDirection="row" gap={2} width="100%" alignItems="flex-start">
      <Box flexDirection="column" gap={1} width={left} flexShrink={0}>{first}</Box>
      <Box flexDirection="column" gap={1} width={right} flexShrink={0}>{second}</Box>
    </Box>
  ) : (
    <Box flexDirection="column" gap={1} width="100%">{[...first, ...second]}</Box>
  )
}
