import type {
  ContextCategory,
  RenderElement,
  SessionContextBreakdown,
  ThemeKey,
} from 'claude-code'
import type { CockpitImage, CockpitReactor, CockpitViewProps } from '../types'
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
  return <Box flexDirection="column" gap={1}>
    <Box flexDirection={width < 60 ? 'column' : 'row'} justifyContent="space-between" gap={1}>
      <Text bold color={colors.accent}>CONTEXT / LOCAL SUMMARY</Text>
      <Button key="context-refresh" label={props.context.loading ? 'Refreshing…' : 'Refresh summary'}
        onPress={props.actions.refreshContext} />
    </Box>
    <Text color={colors.muted}>Summary only · no token-count API request · {age(props.context.refreshedAt, props.now)}</Text>
    {props.context.error && <Text color={colors.red}>{cleanText(props.context.error)}</Text>}
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1}>
      <Text bold>Last response · actual input</Text>
      <Text color={colors.cyan}>{count(live?.tokens)} / {count(live?.window)} tokens · {percent(live?.percent)}</Text>
      {finite(live?.percent) && <Text color={colors.accent}>{meter(live.percent, Math.max(8, Math.min(40, width - 6)))}</Text>}
      <Text color={colors.muted}>Input includes cache reads and writes. Not a running token counter.</Text>
    </Box>
    {breakdown ? <Box flexDirection="column" gap={1}>
      <Box flexDirection={width >= 80 ? 'row' : 'column'} gap={2}>
        {renderHeatmap(ui, breakdown, width)}
        <Box flexDirection="column" width={categoryWidth} flexShrink={0}>
          <Text bold color={colors.accent}>Estimated category tokens</Text>
          <Text>{count(breakdown.totalTokens)} / {count(breakdown.rawMaxTokens)} · {percent(breakdown.percentage)}</Text>
          <Text color={colors.muted}>Estimates need not match actual input.</Text>
          {breakdown.categories.slice(0, 16).map((category, index) =>
            <Box flexDirection="row" justifyContent="space-between" key={`category-${index}`} gap={1}>
              <Text color={categoryColor(category, index)}>{clip(`${category.name}${category.kind === 'deferred' ? ' (deferred)' : ''}`, Math.max(12, categoryWidth - 14))}</Text>
              <Text>{count(category.tokens)}</Text>
            </Box>,
          )}
          <Text color={colors.muted}>Deferred schemas are outside the window.</Text>
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
    <Box flexDirection="column" gap={1}>
      <Text bold color={colors.accent}>Rate windows · last reported</Text>
      {!usage || usage.rateLimits.length === 0 ? <Text color={colors.muted}>Not reported. No zero usage assumed.</Text> : usage.rateLimits.slice(0, 8).map((rate, index) =>
        <Box flexDirection="column" key={`rate-${index}`}>
          <Text color={rate.percentUsed >= 90 ? colors.yellow : colors.cyan}>{cleanText(rate.kind)} · {percent(rate.percentUsed)}</Text>
          {finite(rate.percentUsed) && <Text color={colors.accent}>{meter(rate.percentUsed, Math.min(32, width - 4))}</Text>}
          <Text color={colors.muted}>Reset: {rate.resetsAt ? cleanText(rate.resetsAt) : 'unknown'}</Text>
        </Box>,
      )}
      <Text>Session cost ledger: {finite(usage?.cost?.usd) ? `$${usage.cost.usd.toFixed(4)}` : 'unknown'}</Text>
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
    <Text color={colors.cyan}>{activitySparkline(props.reactor.samples, width - 2)}</Text>
    <Text color={colors.muted}>Observed activity history · relative scale</Text>
    <Text color={colors.muted}>Running tools + running agents + main turn · 1s samples while animated</Text>
    <Text>Running tools: {count(runningTools)} · running agents: {count(runningAgents)}</Text>
    <Text color={colors.muted}>Phase and history follow observed events. Motion is decorative.</Text>
    <Text color={colors.muted}>No generated or running token counts. Animation stays in this pane.</Text>
    {props.activity.error && <Text color={colors.red}>{cleanText(props.activity.error)}</Text>}
  </Box>
}

export const imageSize = (
  image: CockpitImage,
  columns: number,
  rows: number,
): { columns: number; rows: number } => {
  const maxColumns = Math.max(8, Math.min(100, widthOf(columns) - 2))
  const maxRows = Math.max(4, Math.min(30, Math.floor(Number.isFinite(rows) ? rows : 30) - 12))
  const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 1
  const pictureRows = Math.max(1, Math.min(maxRows, Math.round(maxColumns / (ratio * 2))))
  return {
    columns: Math.max(1, Math.min(maxColumns, Math.round(pictureRows * ratio * 2))),
    rows: pictureRows,
  }
}

const fileSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`

export const renderImages = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box, Text, Button } = ui
  const width = widthOf(props.columns)
  const images = props.images.images
  const selected = images[props.images.selected]
  const size = selected ? imageSize(selected, width, props.rows) : null
  return <Box flexDirection="column" gap={1}>
    <Text bold color={colors.accent}>LOCAL IMAGE VIEWER</Text>
    <Text color={colors.muted}>User-selected PNG files only · no network or image generation</Text>
    {'Input' in ui ? <ui.Input key="image-path" label="PNG path" placeholder="/absolute/path/image.png"
      value={props.images.draft} submitLabel="load"
      onInput={value => props.actions.setImageDraft(value)}
      onSubmit={value => props.actions.loadImage(value)} /> :
      <Box flexDirection="column">
        <Text color={colors.muted}>This surface has no file input.</Text>
        <Text color={colors.muted}>Load with /cockpit images /absolute/path/image.png on a surface with input.</Text>
      </Box>}
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {props.images.draft.trim() !== '' && <Button key="image-load" label={props.images.loading ? 'Loading…' : 'Load PNG'} onPress={() => props.actions.loadImage(props.images.draft)} />}
      {images.length > 0 && <Button key="images-clear" label="Clear images" onPress={props.actions.clearImages} />}
    </Box>
    {props.images.loading && <Text color={colors.cyan}>Reading and validating the selected local file…</Text>}
    {props.images.error && <Text color={colors.red}>{cleanText(props.images.error)}</Text>}
    {images.length === 0 ? <Text color={colors.muted}>No image loaded. Enter a local PNG path to view it.</Text> :
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {images.slice(0, 20).map((image, index) => <Button key={`image-select-${index}`}
          label={clip(`${index === props.images.selected ? '● ' : ''}${image.label}`, Math.max(12, Math.min(32, width - 6)))}
          variant={index === props.images.selected ? 'primary' : 'secondary'}
          onPress={() => props.actions.selectImage(index)} />)}
      </Box>}
    {selected && size && <Box flexDirection="column" gap={1}>
      <Text bold color={colors.accent}>{cleanText(selected.label)}</Text>
      <Text>{count(selected.width)} × {count(selected.height)} px · PNG · {fileSize(selected.bytes)}</Text>
      <Text color={colors.muted}>{cleanText(selected.path)}</Text>
      {'Image' in ui ? <ui.Image key="selected-image" source={{ file: selected.path, format: 'png', ...(selected.generation === undefined ? {} : { generation: selected.generation }) }}
        columns={size.columns} rows={size.rows}
        alt={`${cleanText(selected.label)}: ${selected.width} × ${selected.height} px, local PNG. Inline preview needs a Kitty-compatible terminal such as Ghostty or Kitty.`} /> :
        <Box flexDirection="column" borderStyle="round" borderColor={colors.muted} paddingX={1}>
          <Text color={colors.muted}>Inline PNG preview is terminal-only in this SDK.</Text>
          <Text>Local file: {cleanText(selected.path)}</Text>
          <Text color={colors.muted}>Metadata is available here. View pixels in a compatible local terminal.</Text>
        </Box>}
      <Text color={colors.muted}>Inline pixels need Kitty graphics support and access to this local file. Other terminals show the image description.</Text>
    </Box>}
  </Box>
}
