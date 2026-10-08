import type {
  ContextCategory,
  RenderElement,
  SessionContextBreakdown,
  ThemeKey,
} from 'claude-code'
import type { CockpitCompaction, CockpitCostSample, CockpitReactor, CockpitSample, CockpitViewProps } from '../types'
import type { CockpitElements } from './theme'
import { cleanText, clip, colors, count, duration, meter, statusColor } from './theme'

const palette: ThemeKey[] = [colors.accent, colors.cyan, colors.green, colors.magenta, colors.yellow, colors.red]
const finite = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value)
const percent = (value: number | undefined): string =>
  finite(value) ? `${Math.round(value * 10) / 10}%` : 'unknown'
const widthOf = (columns: number): number =>
  Math.max(16, Math.min(140, Math.floor(Number.isFinite(columns) ? columns : 80)))
const categoryColor = (category: ContextCategory, index: number): ThemeKey => {
  if (category.kind === 'free') return colors.muted
  if (category.kind === 'buffer') return colors.yellow
  if (category.kind === 'deferred') return colors.magenta
  return palette[index % palette.length] ?? colors.accent
}
const age = (at: number | null, now: number): string =>
  at === null ? 'not refreshed' : `${duration(now - at)} ago`

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

const renderRanking = (
  ui: CockpitElements,
  title: string,
  entries: RankedEstimate[],
  width: number,
  limit: number,
): RenderElement => {
  const { Box, Text } = ui
  const tokenWidth = Math.min(12, Math.max(6, Math.floor(width / 3)))
  return <Box flexDirection="column" width={width} flexShrink={0}>
    <Text bold color={colors.accent}>{title} · estimated</Text>
    {entries.length === 0 ? <Text color={colors.muted}>None listed</Text> : entries.slice(0, limit).map((entry, index) =>
      <Box flexDirection="column" key={`${title}-${index}`}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text>{clip(entry.label, Math.max(8, width - tokenWidth - 1))}</Text>
          <Text color={colors.cyan}>{count(entry.tokens)}</Text>
        </Box>
        {entry.detail && <Text color={colors.muted}>{clip(entry.detail, width)}</Text>}
      </Box>,
    )}
    {entries.length > limit && <Text color={colors.muted}>{entries.length - limit} more</Text>}
  </Box>
}

const renderHeatmap = (
  ui: CockpitElements,
  breakdown: SessionContextBreakdown,
  columns: number,
): RenderElement => {
  const { Box, Text } = ui
  const gridWidth = columns < 60 ? 5 : columns < 100 ? 10 : 20
  const original = breakdown.gridRows.flat().slice(0, 200)
  const size = Math.min(original.length, gridWidth * 10)
  const squares = Array.from({ length: size }, (_, index) =>
    original[Math.min(original.length - 1, Math.floor((index + 0.5) * original.length / size))],
  )
  const rows = Array.from({ length: Math.ceil(squares.length / gridWidth) }, (_, row) =>
    squares.slice(row * gridWidth, (row + 1) * gridWidth),
  )
  return <Box flexDirection="column" width={columns >= 80 ? gridWidth * 2 : undefined}>
    <Text bold color={colors.accent}>Category heatmap · estimated</Text>
    {rows.length === 0 ? <Text color={colors.muted}>No category grid reported</Text> : rows.map((row, rowIndex) => {
      const runs: { color: ThemeKey; glyphs: string }[] = []
      for (const square of row) {
        if (!square) continue
        const categoryIndex = breakdown.categories.findIndex(category => category.name === square.categoryName)
        const category = breakdown.categories[categoryIndex]
        const color = category ? categoryColor(category, categoryIndex) : colors.muted
        const glyph = square.isFilled && square.squareFullness >= 0.7 ? '■ ' : '□ '
        const previous = runs[runs.length - 1]
        if (previous?.color === color) previous.glyphs += glyph
        else runs.push({ color, glyphs: glyph })
      }
      return <Box flexDirection="row" key={`heatmap-${rowIndex}`}>
        {runs.map(run => <Text color={run.color}>{run.glyphs}</Text>)}
      </Box>
    })}
    <Text color={colors.muted}>□ free / partial · reserve included</Text>
  </Box>
}

// Each cost sample is the session total after a main turn grew it. The first
// sample can hold earlier turns, so only differences between samples count.
export const costPerTurn = (costs: readonly CockpitCostSample[]): number[] =>
  costs.slice(1).map((sample, index) => Math.max(0, sample.usd - (costs[index]?.usd ?? sample.usd)))

const usd = (value: number): string => `$${value.toFixed(4)}`

const compactionLine = (entry: CockpitCompaction, now: number): string => {
  const who = `${entry.trigger}${entry.agentId ? ' (agent)' : ''}`
  if (entry.skipped !== undefined) return `${who} · skipped: ${entry.skipped} · ${age(entry.at, now)}`
  return `${who} · ${count(entry.tokensBefore)} → ${count(entry.tokensAfter)} tokens · ${age(entry.at, now)}`
}

export const renderContext = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box, Text, Button } = ui
  const width = widthOf(props.columns)
  const usage = props.context.usage
  const live = usage?.context
  const breakdown = live?.breakdown
  const estimates = breakdown ? rankedEstimates(breakdown) : null
  const wide = width >= 100
  const rankWidth = wide ? Math.floor((width - 4) / 3) : width
  const rankLimit = width < 60 ? 4 : 6
  const categoryWidth = width >= 80 ? width - (width >= 100 ? 40 : 20) - 2 : width
  const turnCosts = costPerTurn(props.context.costs)
  const lastCost = turnCosts.at(-1)
  return <Box flexDirection="column" gap={1}>
    <Box flexDirection={width < 60 ? 'column' : 'row'} justifyContent="space-between" gap={1}>
      <Text bold color={colors.accent}>CONTEXT / LOCAL SUMMARY</Text>
      <Button key="context-refresh" label={props.context.loading ? 'Refreshing…' : 'Refresh summary'}
        onPress={props.actions.refreshContext} />
    </Box>
    <Text color={colors.muted}>Category summary {age(props.context.refreshedAt, props.now)}</Text>
    {props.context.error && <Text color={colors.red}>{cleanText(props.context.error)}</Text>}
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1}>
      <Text bold>Last response · actual input</Text>
      <Text color={colors.cyan}>{count(live?.tokens)} / {count(live?.window)} tokens · {percent(live?.percent)}</Text>
      {finite(live?.percent) && <Text color={colors.accent}>{meter(live.percent, Math.max(8, Math.min(40, width - 6)))}</Text>}
    </Box>
    {breakdown ? <Box flexDirection="column" gap={1}>
      <Box flexDirection={width >= 80 ? 'row' : 'column'} gap={2}>
        {renderHeatmap(ui, breakdown, width)}
        <Box flexDirection="column" width={categoryWidth} flexShrink={0}>
          <Text bold color={colors.accent}>Estimated category tokens</Text>
          <Text>{count(breakdown.totalTokens)} / {count(breakdown.rawMaxTokens)} · {percent(breakdown.percentage)}</Text>
          {breakdown.categories.slice(0, 16).map((category, index) =>
            <Box flexDirection="row" justifyContent="space-between" key={`category-${index}`} gap={1}>
              <Text color={categoryColor(category, index)}>{clip(`${category.name}${category.kind === 'deferred' ? ' (deferred)' : ''}`, Math.max(12, categoryWidth - 14))}</Text>
              <Text>{count(category.tokens)}</Text>
            </Box>,
          )}
        </Box>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor={colors.yellow} paddingX={1}>
        <Text bold color={colors.yellow}>Auto-compaction · {breakdown.isAutoCompactEnabled ? 'enabled' : 'off'}</Text>
        <Text>Threshold: {breakdown.isAutoCompactEnabled ? count(breakdown.autoCompactThreshold) : 'not applicable'} tokens</Text>
        <Text color={colors.muted}>Compaction window: {count(breakdown.rawMaxTokens)} · {cleanText(breakdown.autocompactSource)}</Text>
      </Box>
      {estimates && <Box flexDirection={wide ? 'row' : 'column'} gap={wide ? 2 : 1}>
        {renderRanking(ui, 'Memory files', estimates.memory, rankWidth, rankLimit)}
        {renderRanking(ui, 'MCP schemas', estimates.mcp, rankWidth, rankLimit)}
        {renderRanking(ui, 'Skill listings', estimates.skills, rankWidth, rankLimit)}
      </Box>}
      {breakdown.skills && <Text color={colors.muted}>Skills listed: {count(breakdown.skills.includedSkills)} / {count(breakdown.skills.totalSkills)} · {count(breakdown.skills.tokens)} estimated tokens</Text>}
    </Box> : <Text color={colors.muted}>No category summary yet. Refresh to compute local estimates.</Text>}
    <Box flexDirection="column">
      <Text bold color={colors.accent}>Compactions</Text>
      {props.context.compactions.length === 0 ? <Text color={colors.muted}>None observed.</Text>
        : props.context.compactions.slice(-5).reverse().map((entry, index) =>
          <Text key={`compaction-${index}`} color={entry.skipped === undefined ? colors.cyan : colors.yellow} wrap="wrap">{clip(compactionLine(entry, props.now), width)}</Text>,
        )}
    </Box>
    <Box flexDirection="column" gap={1}>
      <Text bold color={colors.accent}>Rate windows · last reported</Text>
      {!usage || usage.rateLimits.length === 0 ? <Text color={colors.muted}>Not reported.</Text> : usage.rateLimits.slice(0, 8).map((rate, index) =>
        <Box flexDirection="column" key={`rate-${index}`}>
          <Text color={rate.percentUsed >= 90 ? colors.yellow : colors.cyan}>{cleanText(rate.kind)} · {percent(rate.percentUsed)}</Text>
          {finite(rate.percentUsed) && <Text color={colors.accent}>{meter(rate.percentUsed, Math.min(32, width - 4))}</Text>}
          <Text color={colors.muted}>Reset: {rate.resetsAt ? cleanText(rate.resetsAt) : 'unknown'}</Text>
        </Box>,
      )}
      <Text>Session cost ledger: {finite(usage?.cost?.usd) ? usd(usage.cost.usd) : 'unknown'}</Text>
      {lastCost !== undefined && <Text>Last turn: {usd(lastCost)} · average {usd(turnCosts.reduce((total, value) => total + value, 0) / turnCosts.length)} over {count(turnCosts.length)}</Text>}
      {turnCosts.length > 1 && <Text color={colors.cyan}>{activitySparkline(turnCosts, Math.min(48, width - 2))}</Text>}
    </Box>
  </Box>
}

export const reactorSize = (columns: number, rows: number): { columns: number; rows: number } => {
  const width = Math.max(16, Math.min(64, widthOf(columns) - 2))
  const height = width >= 60 ? 18 : width >= 40 ? 14 : 10
  return {
    columns: width,
    rows: Math.max(6, Math.min(height, Math.floor(Number.isFinite(rows) ? rows : 30) - 10)),
  }
}

export type ReactorRun = { color: ThemeKey; glyphs: string }

// Text runs, not a Raster: Raster cells take only RGB values, and theme keys
// keep the orb in the terminal's palette.
export const reactorOrb = (reactor: CockpitReactor, columns: number, rows: number): ReactorRun[][] => {
  const width = Math.max(1, Math.min(128, Math.floor(Number.isFinite(columns) ? columns : 32)))
  const height = Math.max(1, Math.min(40, Math.floor(Number.isFinite(rows) ? rows : 12)))
  const phase = reactor.phase
  const time = (Number.isFinite(reactor.frame) ? reactor.frame : 0) / 8
  const energetic = phase === 'thinking' || phase === 'tools'
  const baseColor = statusColor(phase)
  const highlight = phase === 'error' ? colors.yellow : colors.cyan
  const bits = [[0, 3], [1, 4], [2, 5], [6, 7]] as const
  const aspect = width / (height * 2)
  const lines: ReactorRun[][] = []
  for (let y = 0; y < height; y += 1) {
    const runs: ReactorRun[] = []
    for (let x = 0; x < width; x += 1) {
      let dots = 0
      let core = false
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const px = ((x + (dx + 0.5) / 2) / width - 0.5) * 2 * aspect
          const py = ((y + (dy + 0.5) / 4) / height - 0.5) * 2
          const radius = Math.hypot(px, py)
          const angle = Math.atan2(py, px)
          const pulse = energetic ? 0.035 * Math.sin(time * 2) : 0.01 * Math.sin(time)
          const ring = Math.abs(radius - 0.62 - pulse) < 0.018 + 0.012 * (1 + Math.sin(angle * 3 + time))
          const inner = radius < 0.3 && (radius < 0.14 || Math.sin(px * 18 + time) + Math.cos(py * 17 - time) > (energetic ? 0.1 : 0.8))
          const orbitAngle = time * (energetic ? 1 : 0.3)
          const satellite = Math.hypot(px - 0.62 * Math.cos(orbitAngle), py - 0.62 * Math.sin(orbitAngle)) < 0.07
          const halo = Math.abs(radius - 0.83) < 0.01 && Math.cos(angle * 8 - time) > 0.35
          if (ring || inner || satellite || halo) {
            dots |= 1 << (bits[dy]?.[dx] ?? 0)
            if (inner || satellite) core = true
          }
        }
      }
      const previous = runs[runs.length - 1]
      const color = dots === 0 ? previous?.color ?? baseColor : core ? highlight : baseColor
      // The blank braille pattern, not a space, keeps every row the same width.
      const glyph = String.fromCharCode(0x2800 + dots)
      if (previous?.color === color) previous.glyphs += glyph
      else runs.push({ color, glyphs: glyph })
    }
    lines.push(runs)
  }
  return lines
}

export const HISTORY_BUCKET_MS = 5000

// The level per bucket for the newest buckets up to `now`: the highest level
// reached in the bucket, or the level carried from the sample before it.
export const activityHistory = (
  samples: readonly CockpitSample[], now: number, columns: number, bucketMs = HISTORY_BUCKET_MS,
): number[] => {
  const sorted = samples.filter(sample => finite(sample?.at) && finite(sample?.level)).slice().sort((left, right) => left.at - right.at)
  const first = sorted[0]
  if (first === undefined || !finite(now)) return []
  const width = Math.max(1, Math.min(80, Math.floor(Number.isFinite(columns) ? columns : 40)))
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

export const activitySparkline = (samples: readonly number[], columns: number): string => {
  const values = samples.slice(-Math.max(1, Math.min(80, Math.floor(Number.isFinite(columns) ? columns : 40))))
  if (values.length === 0) return 'No activity samples yet'
  const maximum = Math.max(1, ...values.filter(Number.isFinite))
  const glyphs = '▁▂▃▄▅▆▇█'
  return values.map(value => glyphs[Math.max(0, Math.min(7, Math.round((Number.isFinite(value) ? value : 0) / maximum * 7)))] ?? '▁').join('')
}

export const renderReactor = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box, Text, Button } = ui
  const width = widthOf(props.columns)
  const size = reactorSize(width, props.rows)
  const phase = props.reactor.phase
  const runningTools = props.activity.tools.filter(tool => tool.outcome === 'running').length
  const runningAgents = props.activity.agents.filter(agent => agent.status === 'running').length
  const history = activityHistory(props.activity.samples, props.now, width - 2)
  return <Box flexDirection="column" gap={1}>
    <Box flexDirection={width < 60 ? 'column' : 'row'} justifyContent="space-between" gap={1}>
      <Text bold color={colors.accent}>ACTIVITY REACTOR</Text>
      <Button key="reactor-toggle" label={props.preferences.animation ? 'Pause animation' : 'Resume animation'} onPress={props.actions.toggleAnimation} />
    </Box>
    <Text color={statusColor(phase)}>{phase.toUpperCase()} · {props.preferences.animation ? 'animation on' : 'animation paused'}</Text>
    <Box flexDirection="column" alignItems="center">
      {reactorOrb(props.reactor, size.columns, size.rows).map((runs, row) =>
        <Box flexDirection="row" key={`reactor-${row}`}>
          {runs.map(run => <Text color={run.color}>{run.glyphs}</Text>)}
        </Box>,
      )}
    </Box>
    <Text color={colors.cyan}>{activitySparkline(history, width - 2)}</Text>
    {history.length > 0 && <Text color={colors.muted}>Activity, last {duration(history.length * HISTORY_BUCKET_MS)} · tools + agents + main turn</Text>}
    <Text>Running tools: {count(runningTools)} · running agents: {count(runningAgents)}</Text>
    {props.activity.error && <Text color={colors.red}>{cleanText(props.activity.error)}</Text>}
  </Box>
}
