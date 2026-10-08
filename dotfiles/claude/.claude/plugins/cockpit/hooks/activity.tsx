import type { RenderElement, ThemeKey } from 'claude-code'
import type { CockpitActivity, CockpitContext, CockpitMascot, CockpitSample, CockpitSpan, CockpitViewProps } from '../types'
import { agentName } from './agents'
import { actions, field, heading, line, muted, section, sparkline, viewWidth } from './layout'
import type { Segment } from './summary'
import {
  agentElapsed, approvalWait, isLive, leadTool, mainTurns, runningTools, sessionStart, sessionStatus, toolDuration, toolLabel,
  toolStats, waitDuration,
} from './summary'
import type { CockpitElements } from './theme'
import { brief, clip, colors, duration, humanize, padEnd, percent, plural } from './theme'

const finite = (value: number | undefined | null): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// ---------------------------------------------------------------- Bongo Cat

export type Pose = 'up' | 'left' | 'right' | 'both' | 'rest'

/** Running tools and live agents: how hard the cat drums. */
export const activityLoad = (activity: CockpitActivity): number =>
  runningTools(activity).length + activity.agents.filter(agent => agent.status === 'running').length

/**
 * The cat acts out the phase: asleep on the drums when idle, a slow tap while
 * the model thinks, both paws while tools run (faster with more at once), and
 * paws up after an error. A paused animation holds frame 0.
 */
export const catPose = (phase: CockpitMascot['phase'], frame: number, load: number): Pose => {
  if (phase === 'error') return 'up'
  if (phase === 'idle') return 'rest'
  if (phase === 'thinking') return frame % 4 === 0 ? 'right' : 'up'
  if (load >= 3) return frame % 2 === 0 ? 'both' : 'up'
  if (load === 2) return frame % 2 === 0 ? 'left' : 'right'
  return (['left', 'up', 'right', 'up'] as const)[frame % 4] ?? 'up'
}

type Eyes = 'open' | 'closed' | 'squint' | 'crossed'

const eyesFor = (phase: CockpitMascot['phase'], pose: Pose, frame: number): Eyes => {
  if (phase === 'error') return 'crossed'
  if (phase === 'idle') return 'closed'
  if (pose === 'both') return 'squint'
  return pose === 'up' && frame % 8 === 7 ? 'closed' : 'open'
}

type Glyph = { char: string; color?: ThemeKey }
type Point = readonly [number, number]
type Layer = 'table' | 'drum' | 'cat' | 'eyes' | 'bean' | 'hit'

// The drawing follows the original Bongo Cat, in the 612 × 354 space of the
// overlay art: the table edge falls to the right, the face tilts with it, and
// the bongos stand in front. A raised paw is an arch with toe beans; a paw
// that hits curls onto its drum, with impact lines under it.
const spline = (points: readonly Point[], steps = 40): Point[] => {
  const out: Point[] = []
  const at = (index: number): Point => points[Math.max(0, Math.min(points.length - 1, index))] ?? [0, 0]
  for (let index = 0; index < points.length - 1; index += 1) {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)]
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps
      const curve = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
      out.push([curve(p0[0], p1[0], p2[0], p3[0]), curve(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(at(points.length - 1))
  return out
}

const segment = (from: Point, to: Point, steps = 30): Point[] =>
  Array.from({ length: steps + 1 }, (_, step): Point => [from[0] + (to[0] - from[0]) * step / steps, from[1] + (to[1] - from[1]) * step / steps])

const oval = (cx: number, cy: number, rx: number, ry: number, from = 0, to = 360, steps = 120): Point[] =>
  Array.from({ length: steps + 1 }, (_, step): Point => {
    const angle = (from + (to - from) * step / steps) * Math.PI / 180
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]
  })

const blob = (cx: number, cy: number, rx: number, ry: number): Point[] => {
  const out: Point[] = []
  for (let x = -10; x <= 10; x += 1) {
    for (let y = -10; y <= 10; y += 1) if (x * x + y * y <= 100) out.push([cx + rx * x / 10, cy + ry * y / 10])
  }
  return out
}

type Drum = { cx: number; cy: number; rx: number; ry: number; bottom: number }

const DRUMS: readonly Drum[] = [
  { cx: 196, cy: 214, rx: 62, ry: 20, bottom: 262 },
  { cx: 332, cy: 236, rx: 58, ry: 19, bottom: 280 },
]

const insideDrum = (drum: Drum, x: number, y: number): boolean => {
  if (y < drum.cy) return ((x - drum.cx) / drum.rx) ** 2 + ((y - drum.cy) / drum.ry) ** 2 <= 1
  if (y <= drum.bottom) return Math.abs(x - drum.cx) <= drum.rx - 8 * (y - drum.cy) / (drum.bottom - drum.cy)
  return ((x - drum.cx) / (drum.rx - 8)) ** 2 + ((y - drum.bottom) / drum.ry) ** 2 <= 1
}

const drumLines = (drum: Drum): Point[] => [
  ...oval(drum.cx, drum.cy, drum.rx, drum.ry),
  ...segment([drum.cx - drum.rx, drum.cy], [drum.cx - drum.rx + 8, drum.bottom], 60),
  ...segment([drum.cx + drum.rx, drum.cy], [drum.cx + drum.rx - 8, drum.bottom], 60),
  ...oval(drum.cx, drum.bottom, drum.rx - 8, drum.ry, 0, 180),
]

const CAT_PARTS = {
  body: spline([[172, 106], [205, 90], [240, 72], [268, 52], [290, 26], [297, 20], [306, 30], [318, 50], [360, 55], [405, 72],
    [440, 104], [462, 92], [481, 87], [487, 125], [476, 150], [482, 192], [497, 226], [503, 240]]),
  table: segment([0, 150], [612, 252], 200),
  smile: spline([[264, 138], [270, 152], [281, 155], [288, 146], [294, 155], [305, 156], [312, 146]], 12),
  gasp: oval(288, 149, 8, 7),
  open: [...blob(241, 131, 7, 7), ...blob(357, 166, 7, 7)],
  closed: [...segment([231, 129], [251, 133]), ...segment([347, 164], [367, 168])],
  squint: [...segment([232, 123], [246, 131]), ...segment([246, 131], [232, 139]), ...segment([366, 158], [352, 166]), ...segment([352, 166], [366, 174])],
  crossed: [...segment([233, 123], [249, 139]), ...segment([249, 123], [233, 139]), ...segment([349, 158], [365, 174]), ...segment([365, 158], [349, 174])],
  leftUp: spline([[138, 172], [133, 122], [145, 93], [165, 88], [190, 100], [207, 145]]),
  leftBeans: [...blob(150, 135, 5, 6), ...blob(162, 118, 5, 6), ...blob(178, 133, 5, 6), ...blob(168, 153, 9, 12)],
  leftDown: spline([[172, 108], [158, 140], [160, 190], [180, 218], [200, 224], [216, 213], [221, 196], [219, 180]]),
  leftHit: [...segment([184, 234], [180, 252]), ...segment([207, 236], [214, 249]), ...segment([232, 221], [254, 228])],
  rightUp: spline([[386, 215], [381, 166], [392, 136], [412, 132], [437, 146], [455, 188]]),
  rightBeans: [...blob(398, 180, 5, 6), ...blob(409, 162, 5, 6), ...blob(425, 177, 5, 6), ...blob(416, 198, 9, 12)],
  rightDown: spline([[425, 170], [380, 190], [342, 213], [328, 232], [350, 246], [400, 246], [450, 237], [488, 225]]),
  rightHit: [...segment([268, 229], [298, 228]), ...segment([291, 258], [305, 245])],
} satisfies Record<string, Point[]>

type CatPart = keyof typeof CAT_PARTS

/** The part of the art the cat shows: from the left table edge to past the cat, ears to drums. */
const CAT_VIEW = { left: 40, top: 12, width: 530, height: 290 }
/** Where the bubble's tail points (the top of the head) and the right ear, in art space. */
const CAT_HEAD_X = 360
const CAT_EAR_X = 481

type CatSheet = { columns: number; rows: number; scale: number; base: (Layer | undefined)[]; parts: Record<CatPart, number[]> }

const sheets = new Map<number, CatSheet>()

// Braille cells hold 2 × 4 dots, close to square on a terminal, so one scale
// serves both axes. Each size is traced once and kept.
const catSheet = (columns: number): CatSheet => {
  const cached = sheets.get(columns)
  if (cached) return cached
  const scale = CAT_VIEW.width / (columns * 2)
  const rows = Math.ceil(CAT_VIEW.height / scale / 4)
  const width = columns * 2
  const height = rows * 4
  const dotsOf = (points: readonly Point[]): number[] => {
    const dots = new Set<number>()
    for (const [x, y] of points) {
      const dx = Math.floor((x - CAT_VIEW.left) / scale)
      const dy = Math.floor((y - CAT_VIEW.top) / scale)
      if (dx >= 0 && dx < width && dy >= 0 && dy < height) dots.add(dy * width + dx)
    }
    return [...dots]
  }
  const base: (Layer | undefined)[] = Array.from({ length: width * height }, () => undefined)
  for (const dot of dotsOf(CAT_PARTS.body)) base[dot] = 'cat'
  for (const dot of dotsOf(CAT_PARTS.table)) base[dot] = 'table'
  // The bongos stand in front: they hide the table edge and the cat behind them.
  for (const drum of DRUMS) {
    for (let dot = 0; dot < base.length; dot += 1) {
      const x = CAT_VIEW.left + (dot % width + 0.5) * scale
      const y = CAT_VIEW.top + (Math.floor(dot / width) + 0.5) * scale
      if (insideDrum(drum, x, y)) base[dot] = undefined
    }
    for (const dot of dotsOf(drumLines(drum))) base[dot] = 'drum'
  }
  const parts = Object.fromEntries(Object.entries(CAT_PARTS).map(([name, points]) => [name, dotsOf(points)])) as Record<CatPart, number[]>
  const sheet = { columns, rows, scale, base, parts }
  sheets.set(columns, sheet)
  return sheet
}

/** The widest cat that fits: 40 columns, then 34, then down to 20. */
export const catColumns = (width: number): number =>
  width >= 44 ? 40 : width >= 36 ? 34 : Math.max(20, Math.min(28, Math.floor(Number.isFinite(width) ? width : 28)))

/** The column of the top of the cat's head in a cat `columns` wide. */
export const catHead = (columns: number): number => Math.floor((CAT_HEAD_X - CAT_VIEW.left) / catSheet(columns).scale / 2)

const LAYER_ORDER: readonly Layer[] = ['table', 'drum', 'cat', 'eyes', 'bean', 'hit']
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const

/**
 * The cat as rows of colored braille glyphs, `columns` wide. Each cell takes
 * the color of its strongest layer: impact lines, toe beans, eyes, the cat,
 * the drums, then the table edge.
 */
export const bongoCat = (phase: CockpitMascot['phase'], frame: number, load: number, columns = 40): Glyph[][] => {
  const safeFrame = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0
  const pose = catPose(phase, safeFrame, load)
  const sheet = catSheet(Math.max(20, Math.min(40, Math.floor(Number.isFinite(columns) ? columns : 40))))
  const dots = sheet.base.slice()
  const draw = (part: CatPart, layer: Layer): void => { for (const dot of sheet.parts[part]) dots[dot] = layer }
  const leftDown = pose === 'left' || pose === 'both' || pose === 'rest'
  const rightDown = pose === 'right' || pose === 'both' || pose === 'rest'
  const hit = pose !== 'rest'
  draw(phase === 'error' ? 'gasp' : 'smile', 'cat')
  draw(eyesFor(phase, pose, safeFrame), 'eyes')
  if (leftDown) { draw('leftDown', 'cat'); if (hit) draw('leftHit', 'hit') } else { draw('leftUp', 'cat'); draw('leftBeans', 'bean') }
  if (rightDown) { draw('rightDown', 'cat'); if (hit) draw('rightHit', 'hit') } else { draw('rightUp', 'cat'); draw('rightBeans', 'bean') }
  const colorOf: Record<Layer, ThemeKey | undefined> = {
    table: colors.muted, drum: colors.yellow, cat: undefined, eyes: phase === 'error' ? colors.red : undefined, bean: colors.magenta, hit: colors.accent,
  }
  const width = sheet.columns * 2
  const grid: Glyph[][] = Array.from({ length: sheet.rows }, (_, row) => Array.from({ length: sheet.columns }, (_, column): Glyph => {
    let bits = 0
    let strongest = -1
    for (let dy = 0; dy < 4; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const layer = dots[(row * 4 + dy) * width + column * 2 + dx]
        if (layer === undefined) continue
        bits |= BRAILLE_BITS[dy]?.[dx] ?? 0
        strongest = Math.max(strongest, LAYER_ORDER.indexOf(layer))
      }
    }
    // An empty cell is a space: some fonts draw the blank braille pattern.
    if (bits === 0) return { char: ' ' }
    const layer = LAYER_ORDER[strongest]
    return { char: String.fromCharCode(0x2800 + bits), color: layer === undefined ? undefined : colorOf[layer] }
  }))
  const ear = Math.floor((CAT_EAR_X - CAT_VIEW.left) / sheet.scale / 2)
  const put = (row: number, column: number, char: string, color: ThemeKey): void => {
    const cell = grid[row]?.[Math.min(sheet.columns - 1, column)]
    if (cell) { cell.char = char; cell.color = color }
  }
  if (phase === 'idle') {
    const drift = safeFrame % 4 < 2 ? 0 : 1
    put(1, ear + 2 + drift, 'z', colors.muted)
    put(0, ear + 4 + drift, 'Z', colors.muted)
  }
  if (phase === 'error') put(0, ear + 3, '!', colors.red)
  if (phase === 'thinking' && safeFrame % 8 >= 4) put(0, ear + 3, '?', colors.cyan)
  return grid
}

/** What the cat says: the tool it drums for, the thought, the error, or sleep. */
export const catSays = (activity: CockpitActivity, now: number): { text: string; color: ThemeKey } => {
  const status = sessionStatus(activity, activity.working)
  if (activity.stopFailure && !activity.working) return { text: `stopped: ${humanize(activity.stopFailure.error)}`, color: colors.red }
  const running = runningTools(activity)
  const lead = leadTool(running)
  if (lead) {
    const more = running.length > 1 ? ` +${running.length - 1}` : ''
    return { text: `${toolLabel(lead)} · ${brief(now - lead.startedAt)}${more}`, color: colors.cyan }
  }
  if (activity.working) {
    return { text: activity.turnStartedAt === null ? 'thinking' : `thinking · ${brief(now - activity.turnStartedAt)}`, color: colors.cyan }
  }
  if (status.label === 'last turn failed') return { text: 'last turn failed', color: colors.red }
  const last = mainTurns(activity).at(-1)
  return { text: last ? `zzz · idle ${brief(now - last.finishedAt)}` : 'zzz', color: colors.muted }
}

const toSegments = (row: readonly Glyph[]): Segment[] => {
  const segments: Segment[] = []
  for (const glyph of row) {
    const last = segments[segments.length - 1]
    if (last && last.color === glyph.color) last.text += glyph.char
    else segments.push({ text: glyph.char, color: glyph.color })
  }
  return segments
}

const catBlock = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement => {
  const { Box } = ui
  const load = activityLoad(props.activity)
  const frame = props.preferences.animation ? props.mascot.frame : 0
  const columns = catColumns(width)
  const grid = bongoCat(props.mascot.phase, frame, load, columns)
  const says = catSays(props.activity, props.now)
  const text = clip(says.text, Math.max(8, width - 6))
  const inner = [...text].length + 2
  const blockWidth = Math.max(columns, inner + 2)
  // Center the bubble and the cat in one block, the tail over the cat's head.
  const bubbleAt = Math.floor((blockWidth - inner - 2) / 2)
  const catAt = Math.floor((blockWidth - columns) / 2)
  const tail = Math.max(bubbleAt + 1, Math.min(bubbleAt + inner, catAt + catHead(columns)))
  const border = colors.muted
  const pad = (segments: Segment[], used: number): Segment[] => [...segments, { text: ' '.repeat(Math.max(0, blockWidth - used)) }]
  const rows: Segment[][] = [
    pad([{ text: `${' '.repeat(bubbleAt)}╭${'─'.repeat(inner)}╮`, color: border }], bubbleAt + inner + 2),
    pad([{ text: `${' '.repeat(bubbleAt)}│ `, color: border }, { text, color: says.color, bold: true }, { text: ' │', color: border }], bubbleAt + inner + 2),
    pad([{ text: `${' '.repeat(bubbleAt)}╰${'─'.repeat(tail - bubbleAt - 1)}┬${'─'.repeat(bubbleAt + inner - tail)}╯`, color: border }], bubbleAt + inner + 2),
    pad([{ text: `${' '.repeat(tail)}│`, color: border }], tail + 1),
    ...grid.map(row => pad([{ text: ' '.repeat(catAt) }, ...toSegments(row)], catAt + columns)),
  ]
  return (
    <Box key="activity:cat" flexDirection="column" alignItems="center" width="100%">
      {rows.map((segments, index) => line(ui, `activity:cat:${index}`, segments))}
    </Box>
  )
}

// ---------------------------------------------------------------- history

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

// ---------------------------------------------------------------- timeline

/** Cell states, in the order one overrides another within a cell. */
export const LANE = { absent: -1, idle: 0, model: 1, agent: 2, tool: 3, approval: 4, error: 5 } as const
type LaneState = typeof LANE[keyof typeof LANE]

const laneGlyph: Record<LaneState, Glyph> = {
  [-1]: { char: ' ' },
  0: { char: '·', color: colors.muted },
  1: { char: '▒', color: colors.accent },
  2: { char: '▓', color: colors.magenta },
  3: { char: '█', color: colors.cyan },
  4: { char: '█', color: colors.yellow },
  5: { char: '█', color: colors.red },
}

const SPANS: Record<Exclude<CockpitSpan, 'fit'>, number> = { '5m': 300000, '15m': 900000, '60m': 3600000 }
const NICE_CELLS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1200, 1800, 3600].map(seconds => seconds * 1000)

export const SPAN_ORDER: CockpitSpan[] = ['fit', '5m', '15m', '60m']

/** The cell size and start: a fixed span, or since the first event for `fit`. */
export const timelineScale = (span: CockpitSpan, first: number | undefined, now: number, cells: number): { cellMs: number; start: number } => {
  const columns = Math.max(1, Math.floor(cells))
  const wanted = span === 'fit' ? Math.max(60000, now - (first ?? now)) : SPANS[span]
  const cellMs = NICE_CELLS.find(size => size * columns >= wanted) ?? NICE_CELLS[NICE_CELLS.length - 1] ?? 3600000
  return { cellMs, start: now - cellMs * columns }
}

type Interval = { from: number; to: number; state: LaneState }
export type Lane = { id?: string; label: string; cells: LaneState[] }

const laneIntervals = (activity: CockpitActivity, id: string | undefined, now: number): { intervals: Interval[]; from?: number; to?: number } => {
  const intervals: Interval[] = []
  for (const turn of activity.turns.filter(item => item.agentId === id)) {
    intervals.push({ from: turn.finishedAt - turn.durationMs, to: turn.finishedAt, state: LANE.model })
  }
  let from: number | undefined
  let to: number | undefined
  if (id === undefined) {
    if (activity.working && activity.turnStartedAt !== null) intervals.push({ from: activity.turnStartedAt, to: now, state: LANE.model })
  } else {
    const agent = activity.agents.find(item => item.id === id)
    if (agent?.startedAt !== undefined) {
      from = agent.startedAt
      to = isLive(agent) ? now : agent.completedAt ?? agent.lastSeenAt
      intervals.push({ from, to, state: LANE.model })
    }
  }
  for (const tool of activity.tools.filter(item => item.agentId === id)) {
    const end = tool.finishedAt ?? (tool.outcome === 'running' ? now : tool.startedAt)
    intervals.push({ from: tool.startedAt, to: end, state: tool.tool === 'Agent' ? LANE.agent : LANE.tool })
    const wait = tool.approval === 'asked' ? waitDuration(tool) : undefined
    if (wait !== undefined && wait > 0) intervals.push({ from: tool.startedAt, to: tool.startedAt + wait, state: LANE.approval })
    if (tool.outcome === 'error' || tool.outcome === 'denied') intervals.push({ from: end, to: end, state: LANE.error })
    from = from === undefined ? tool.startedAt : Math.min(from, tool.startedAt)
    to = to === undefined ? end : Math.max(to, end)
  }
  return { intervals, from, to }
}

export const timelineLanes = (
  activity: CockpitActivity, now: number, start: number, cellMs: number, cells: number, maxLanes = 6, sessionFrom?: number,
): Lane[] => {
  const windowEnd = start + cellMs * cells
  const agents = activity.agents
    .filter(agent => agent.startedAt !== undefined || activity.tools.some(tool => tool.agentId === agent.id))
    .map(agent => ({ agent, span: laneIntervals(activity, agent.id, now) }))
    .filter(entry => (entry.span.to ?? 0) >= start)
    .sort((left, right) => (left.span.from ?? 0) - (right.span.from ?? 0))
    .slice(-Math.max(0, maxLanes - 1))
  const main = laneIntervals(activity, undefined, now)
  const lanes = [
    { id: undefined, label: 'main', span: { ...main, from: sessionFrom ?? main.from, to: now }, bounded: sessionFrom !== undefined },
    ...agents.map(entry => ({ id: entry.agent.id, label: agentName(entry.agent), span: entry.span, bounded: true })),
  ]
  return lanes.map(lane => {
    const states: LaneState[] = []
    for (let index = 0; index < cells; index += 1) {
      const from = start + index * cellMs
      const to = Math.min(windowEnd, from + cellMs)
      let state: LaneState = lane.bounded && (lane.span.from === undefined || to <= lane.span.from || from >= (lane.span.to ?? now)) ? LANE.absent : LANE.idle
      if (from >= now) state = LANE.absent
      for (const interval of lane.span.intervals) {
        const overlaps = interval.from === interval.to ? interval.from >= from && interval.from < to : interval.from < to && interval.to > from
        if (overlaps && interval.state > state) state = interval.state
      }
      states.push(state)
    }
    return { id: lane.id, label: lane.label, cells: states }
  })
}

const laneSegments = (cells: readonly LaneState[]): Segment[] => toSegments(cells.map(state => laneGlyph[state]))

export type TimeBudget = {
  sessionMs?: number
  busyMs: number
  toolMs: number
  topTools: { tool: string; ms: number }[]
  agentMs: number
  agents: number
  approvals: number
  approvalMs: number
  peak: number
  average?: number
  calls: number
  failures: number
}

/** Where the session's time went: the main turn, tools, agents, and approval prompts. */
export const timeBudget = (activity: CockpitActivity, context: CockpitContext, now: number): TimeBudget => {
  const started = sessionStart(activity, context)
  const turns = mainTurns(activity)
  const busy = turns.reduce((total, turn) => total + turn.durationMs, 0)
    + (activity.working && activity.turnStartedAt !== null ? Math.max(0, now - activity.turnStartedAt) : 0)
  const tools = activity.tools.filter(tool => tool.tool !== 'Agent')
  const wait = approvalWait(activity.tools)
  const sorted = activity.samples.filter(sample => finite(sample.at) && finite(sample.level)).slice().sort((left, right) => left.at - right.at)
  let weighted = 0
  let active = 0
  sorted.forEach((sample, index) => {
    const end = sorted[index + 1]?.at ?? now
    if (sample.level > 0) { weighted += sample.level * (end - sample.at); active += end - sample.at }
  })
  return {
    sessionMs: finite(started) ? Math.max(0, now - started) : undefined,
    busyMs: busy,
    toolMs: tools.reduce((total, tool) => total + (toolDuration(tool, now) ?? 0), 0),
    topTools: toolStats(tools, now).slice(0, 3).map(stat => ({ tool: stat.tool, ms: stat.totalMs })),
    agentMs: activity.agents.reduce((total, agent) => total + (agentElapsed(agent, now) ?? 0), 0),
    agents: activity.agents.length,
    approvals: wait.asked,
    approvalMs: wait.totalMs,
    peak: Math.max(0, ...sorted.map(sample => sample.level)),
    average: active > 0 ? weighted / active : undefined,
    calls: activity.tools.length,
    failures: activity.tools.filter(tool => tool.outcome === 'error' || tool.outcome === 'denied').length,
  }
}

const timelineSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement => {
  const { Box } = ui
  const labelWidth = Math.min(10, Math.max(6, Math.floor(width / 6)))
  const cells = Math.max(10, width - labelWidth - 1)
  const first = sessionStart(props.activity, props.context)
  const { cellMs, start } = timelineScale(props.preferences.span, first, props.now, cells)
  const lanes = timelineLanes(props.activity, props.now, start, cellMs, cells, 6, first)
  const left = `-${brief(props.now - start)}`
  const middle = `-${brief((props.now - start) / 2)}`
  const axisGap = Math.max(1, Math.floor((cells - left.length - middle.length - 3) / 2))
  const legend: Segment[] = [
    { text: '█', color: colors.cyan }, { text: ' tool  ', color: colors.muted },
    { text: '▒', color: colors.accent }, { text: ' model  ', color: colors.muted },
    { text: '▓', color: colors.magenta }, { text: ' agent  ', color: colors.muted },
    { text: '█', color: colors.yellow }, { text: ' approval  ', color: colors.muted },
    { text: '█', color: colors.red }, { text: ' error', color: colors.muted },
  ]
  return (
    <Box key="activity:timeline" flexDirection="column" width="100%">
      {heading(ui, 'activity:timeline:title', 'Timeline', [
        { text: `${brief(cellMs * cells)} · 1 cell ${brief(cellMs)}`, color: colors.muted },
      ], width)}
      {lanes.map(lane => line(ui, `activity:lane:${lane.id ?? 'main'}`, [
        { text: `${padEnd(clip(lane.label, labelWidth - 1), labelWidth - 1)} `, color: lane.id === undefined ? colors.accent : colors.magenta },
        ...laneSegments(lane.cells),
      ]))}
      {line(ui, 'activity:axis', [{ text: `${' '.repeat(labelWidth)}${left}${' '.repeat(axisGap)}${middle}${' '.repeat(axisGap)}now`, color: colors.muted }])}
      {line(ui, 'activity:legend', legend, true)}
      {actions(ui, 'activity:timeline:actions', [
        { key: 'activity:span', label: `Zoom: ${props.preferences.span === 'fit' ? 'session' : `last ${props.preferences.span}`}`, hotkey: 'z', onPress: props.actions.cycleSpan },
        { key: 'activity:animation', label: props.preferences.animation ? 'Pause cat' : 'Wake cat', hotkey: 'p', onPress: props.actions.toggleAnimation },
      ])}
    </Box>
  )
}

const budgetSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement => {
  const budget = timeBudget(props.activity, props.context, props.now)
  const share = finite(budget.sessionMs) && budget.sessionMs > 0 ? ` (${percent(budget.busyMs / budget.sessionMs * 100)})` : ''
  const busyMinutes = budget.busyMs / 60000
  return section(ui, 'activity:budget', [
    heading(ui, 'activity:budget:title', 'Where time went', [], width),
    field(ui, 'activity:budget:session', 'Session', [
      { text: finite(budget.sessionMs) ? duration(budget.sessionMs) : 'unknown' },
      { text: ' · main busy ', color: colors.muted }, { text: `${duration(budget.busyMs)}${share}` },
    ], 10),
    field(ui, 'activity:budget:tools', 'Tools', [
      { text: duration(budget.toolMs) },
      ...budget.topTools.flatMap(tool => [{ text: ' · ', color: colors.muted }, { text: tool.tool }, { text: ` ${brief(tool.ms)}`, color: colors.muted }]),
    ], 10),
    budget.agents > 0 ? field(ui, 'activity:budget:agents', 'Agents', [
      { text: plural(budget.agents, 'agent') }, { text: ` · ${duration(budget.agentMs)} total`, color: colors.muted },
    ], 10) : null,
    field(ui, 'activity:budget:approval', 'Approval', budget.approvals === 0 ? [{ text: 'none asked', color: colors.muted }] : [
      { text: plural(budget.approvals, 'prompt'), color: colors.yellow },
      { text: budget.approvalMs > 0 ? ` · ${duration(budget.approvalMs)} waiting on you` : '', color: colors.yellow },
    ], 10),
    field(ui, 'activity:budget:parallel', 'Parallel', [
      { text: `peak ${budget.peak}` },
      { text: budget.average === undefined ? '' : ` · avg ${budget.average.toFixed(1)} while active`, color: colors.muted },
    ], 10),
    field(ui, 'activity:budget:pace', 'Pace', [
      { text: plural(budget.calls, 'call') },
      { text: busyMinutes >= 0.5 ? ` · ${(budget.calls / busyMinutes).toFixed(1)}/min busy` : '', color: colors.muted },
      { text: budget.failures > 0 ? ` · ${budget.failures} failed` : '', color: colors.red },
    ], 10),
  ])
}

const phaseLabel: Record<CockpitMascot['phase'], string> = {
  idle: 'idle', thinking: 'thinking', tools: 'running tools', error: 'error',
}

export const renderActivity = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box } = ui
  const width = viewWidth(props)
  const status = sessionStatus(props.activity, props.activity.working)
  const tools = runningTools(props.activity).length
  const agents = props.activity.agents.filter(agent => agent.status === 'running').length
  const history = activityHistory(props.activity.samples, props.now, width)
  const wide = width >= 100
  const left = wide ? Math.floor((width - 2) / 2) : width
  const right = wide ? width - left - 2 : width
  const top = [
    heading(ui, 'activity:title', 'Activity', [
      { text: phaseLabel[props.mascot.phase], color: status.color },
      { text: props.preferences.animation ? '' : ' · paused', color: colors.muted },
    ], width),
    catBlock(ui, props, width),
    line(ui, 'activity:counts', [
      { text: plural(tools, 'tool'), color: tools > 0 ? colors.cyan : colors.muted },
      { text: ' · ', color: colors.muted },
      { text: plural(agents, 'agent'), color: agents > 0 ? colors.magenta : colors.muted },
      { text: props.activity.working && props.activity.turnStartedAt !== null ? ` · turn ${brief(props.now - props.activity.turnStartedAt)}` : '', color: colors.muted },
    ]),
    history.length > 0 ? line(ui, 'activity:history', [{ text: sparkline(history, width), color: colors.cyan }]) : null,
    history.length > 0 ? muted(ui, 'activity:history:legend', `Concurrency, last ${brief(history.length * HISTORY_BUCKET_MS)}: tools, agents, and the main turn`) : null,
  ].filter((child): child is RenderElement => Boolean(child))
  const timeline = timelineSection(ui, props, left)
  const budget = budgetSection(ui, props, right)
  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Box key="activity:top" flexDirection="column" width="100%">{top}</Box>
      {wide ? (
        <Box key="activity:bottom" flexDirection="row" gap={2} width="100%" alignItems="flex-start">
          <Box flexDirection="column" width={left} flexShrink={0}>{timeline}</Box>
          <Box flexDirection="column" width={right} flexShrink={0}>{budget}</Box>
        </Box>
      ) : (
        <Box key="activity:bottom" flexDirection="column" gap={1} width="100%">{timeline}{budget}</Box>
      )}
    </Box>
  )
}
