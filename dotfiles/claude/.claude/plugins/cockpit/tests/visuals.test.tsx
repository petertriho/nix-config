import { expect, test } from 'claude-code/testing'
import type {
  BoxProps,
  ButtonProps,
  CodeProps,
  ElementConstructor,
  InputProps,
  LinkProps,
  MarkdownProps,
  RasterProps,
  RenderElement,
  RenderSurface,
  SelectProps,
  SessionContextBreakdown,
  SvgProps,
  TextProps,
} from 'claude-code'
import type { CockpitActions, CockpitViewProps } from '../types'
import type { CockpitElements } from '../hooks/theme'
import { colors } from '../hooks/theme'
import { initialActivity, initialContext, initialReview } from '../hooks/state'
import {
  activityHistory,
  activitySparkline,
  costPerTurn,
  rankedEstimates,
  reactorOrb,
  reactorSize,
  renderContext,
  renderReactor,
} from '../hooks/visuals'

type Control = {
  onPress?: () => Promise<void>
  onInput?: (value: string) => Promise<void>
  onSubmit?: (value: string) => Promise<void>
}
type Drawn = { type: string; props: Record<string, unknown>; children?: (Drawn | string)[] }

const flatten = (children: unknown): (Drawn | string)[] => {
  if (Array.isArray(children)) return children.flatMap(flatten)
  if (children === undefined || children === null || typeof children === 'boolean') return []
  if (typeof children === 'number') return [String(children)]
  return [children as Drawn | string]
}

const testElements = (surface: RenderSurface): {
  ui: CockpitElements
  controls: Map<string, Control>
} => {
  const controls = new Map<string, Control>()
  const make = <P,>(type: string): ElementConstructor<P> => props => {
    const attributes = { ...props } as Record<string, unknown>
    const key = attributes.key ?? attributes.label
    if (typeof key === 'string') controls.set(key, {
      onPress: attributes.onPress as Control['onPress'],
      onInput: attributes.onInput as Control['onInput'],
      onSubmit: attributes.onSubmit as Control['onSubmit'],
    })
    const children = flatten(attributes.children)
    delete attributes.children
    delete attributes.onPress
    delete attributes.onInput
    delete attributes.onSubmit
    return { type, props: attributes, children } as unknown as RenderElement
  }
  const common = {
    Box: make<BoxProps>('Box'),
    Text: make<TextProps>('Text'),
    Button: make<ButtonProps>('Button'),
    Link: make<LinkProps>('Link'),
    Code: make<CodeProps>('Code'),
    Markdown: make<MarkdownProps>('Markdown'),
  }
  const input = { Input: make<InputProps>('Input'), Select: make<SelectProps>('Select') }
  const remote = { Svg: make<SvgProps>('Svg') }
  if (surface === 'terminal') return {
    ui: { ...common, ...input, Raster: make<RasterProps>('Raster') } as CockpitElements,
    controls,
  }
  return { ui: { ...common, ...remote, ...(surface === 'mobile' ? {} : input) } as CockpitElements, controls }
}

const nodes = (tree: RenderElement | Drawn): Drawn[] => {
  const root = tree as Drawn
  return [root, ...(root.children ?? []).flatMap(child => typeof child === 'string' ? [] : nodes(child))]
}
const text = (tree: RenderElement | Drawn): string => nodes(tree)
  .flatMap(node => [node.props.label, node.props.alt, (node.children ?? []).filter(child => typeof child === 'string').join('')])
  .filter(value => typeof value === 'string' && value !== '').join('\n')

const fixture = (actions: Partial<CockpitActions> = {}): CockpitViewProps => {
  const noop = async (): Promise<void> => {}
  return {
    activity: initialActivity(),
    review: initialReview(),
    context: initialContext(),
    preferences: { view: 'context', band: true, animation: true, paneOpen: true },
    reactor: { frame: 0, phase: 'idle' },
    viewedAgent: null,
    actions: {
      selectView: noop, refreshAgents: noop, selectAgent: noop, selectTool: noop,
      refreshChanges: noop, selectChange: noop, copyPatch: noop, quotePatch: noop,
      refreshContext: noop, toggleAnimation: noop, ...actions,
    },
    columns: 80, rows: 40, now: 1000,
  }
}

const breakdown = (): SessionContextBreakdown => ({
  categories: [
    { name: 'Messages', tokens: 4000, color: 'text', isDeferred: false, kind: 'used' },
    { name: 'Memory', tokens: 500, color: 'remember', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 85000, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 10500, color: 'warning', isDeferred: false, kind: 'buffer' },
    { name: 'Deferred tools', tokens: 900, color: 'permission', isDeferred: true, kind: 'deferred' },
  ],
  totalTokens: 4500, maxTokens: 100000, rawMaxTokens: 100000, autocompactSource: 'model-default',
  percentage: 4.5, model: 'test-model',
  gridRows: [[
    { color: 'text', isFilled: true, categoryName: 'Messages', tokens: 4000, percentage: 4, squareFullness: 1 },
    { color: 'inactive', isFilled: false, categoryName: 'Free space', tokens: 85000, percentage: 85, squareFullness: 0 },
  ]],
  memoryFiles: [
    { path: '/project/CLAUDE.md', type: 'Project', tokens: 300 },
    { path: '/user/CLAUDE.md', type: 'User', tokens: 900 },
  ],
  mcpTools: [
    { name: 'mcp__first__read', serverName: 'first', tokens: 100, isLoaded: true },
    { name: 'mcp__first__write', serverName: 'first', tokens: 900, isLoaded: false },
    { name: 'mcp__second__read', serverName: 'second', tokens: 500, isLoaded: true },
  ],
  agents: [],
  skills: {
    totalSkills: 4, includedSkills: 2, tokens: 350,
    skillFrontmatter: [
      { name: 'small', source: 'built-in', tokens: 100 },
      { name: 'large', source: 'plugin', pluginName: 'example', tokens: 250 },
    ],
  },
  autoCompactThreshold: 89500, isAutoCompactEnabled: true, apiUsage: null,
})

const themeKeys = new Set<string>(Object.values(colors))

test('reactor draws deterministic braille rows in theme colors', () => {
  const reactor = { frame: 0, phase: 'thinking' as const }
  const orb = reactorOrb(reactor, 40, 14)
  expect(orb).toHaveLength(14)
  let dots = 0
  for (const runs of orb) {
    const row = runs.map(run => run.glyphs).join('')
    expect(row).toHaveLength(40)
    for (const glyph of row) {
      const code = glyph.charCodeAt(0)
      expect(code >= 0x2800 && code <= 0x28ff).toBe(true)
      if (code !== 0x2800) dots += 1
    }
    for (const run of runs) expect(run.color).toBe(colors.cyan)
  }
  expect(dots).toBeGreaterThan(20)
  const failed = reactorOrb({ ...reactor, phase: 'error' }, 40, 14).flat().map(run => run.color)
  expect(new Set(failed)).toEqual(new Set([colors.red, colors.yellow]))
  expect(reactorOrb(reactor, 40, 14)).toEqual(orb)
  expect(reactorOrb({ ...reactor, frame: 7 }, 40, 14)).not.toEqual(orb)
})

test('reactor leaves the background to the surface and uses only theme keys', () => {
  const props = fixture()
  props.reactor.phase = 'error'
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const { ui } = testElements(surface)
    const all = nodes(renderReactor(ui, props))
    expect(all.filter(node => node.type === 'Raster' || node.type === 'Svg')).toHaveLength(0)
    for (const node of all) {
      expect(node.props.backgroundColor).toBeUndefined()
      if (node.props.color !== undefined) expect(themeKeys.has(node.props.color as string)).toBe(true)
    }
  }
})

test('graphics dimensions stay bounded at 40, 80, and 140 columns', () => {
  for (const columns of [40, 80, 140]) {
    const orb = reactorSize(columns, 40)
    expect(orb.columns).toBeLessThanOrEqual(columns)
    expect(orb.columns).toBeLessThanOrEqual(64)
    expect(orb.rows).toBeLessThanOrEqual(18)
  }
  expect(reactorSize(Number.NaN, Number.NaN)).toEqual({ columns: 64, rows: 18 })
  const clamped = reactorOrb({ frame: Number.NaN, phase: 'idle' }, -10, 9999)
  expect(clamped).toHaveLength(40)
  expect(clamped.every(runs => runs.map(run => run.glyphs).join('').length === 1)).toBe(true)
})

test('activity history is relative observed data, not invented tokens', () => {
  expect(activitySparkline([], 40)).toBe('No activity samples yet')
  expect(activitySparkline([0, 1, 2, 4], 40)).toBe('▁▃▅█')
  expect(activitySparkline([0, Number.NaN, -1], 40)).toBe('▁▁▁')
  expect(activitySparkline([0, 1, 2, 4], 2)).toHaveLength(2)
})

test('activity history holds each level until the next sample and keeps the peak of a bucket', () => {
  const samples = [{ at: 0, level: 0 }, { at: 6000, level: 2 }, { at: 7000, level: 1 }, { at: 21000, level: 0 }]
  expect(activityHistory(samples, 24000, 40, 5000)).toEqual([0, 2, 1, 1, 1])
  expect(activityHistory(samples, 24000, 2, 5000)).toEqual([1, 1])
  expect(activityHistory(samples, 40000, 40, 5000)).toEqual([0, 2, 1, 1, 1, 0, 0, 0, 0])
  expect(activityHistory([], 24000, 40)).toEqual([])
})

test('cost per turn uses only differences between samples', () => {
  expect(costPerTurn([{ at: 0, usd: 1 }, { at: 1, usd: 1.5 }, { at: 2, usd: 1.75 }])).toEqual([0.5, 0.25])
  expect(costPerTurn([{ at: 0, usd: 3 }])).toEqual([])
})

test('ranked estimates preserve inputs and label deferred MCP schemas', () => {
  const input = breakdown()
  const ranked = rankedEstimates(input)
  expect(ranked.memory[0]?.label).toBe('/user/CLAUDE.md')
  expect(ranked.mcp[0]).toEqual({ label: 'first', tokens: 1000, detail: '1/2 loaded; 900 deferred' })
  expect(ranked.skills[0]?.label).toBe('large')
  expect(input.memoryFiles[0]?.path).toBe('/project/CLAUDE.md')
  expect(input.skills?.skillFrontmatter[0]?.name).toBe('small')
})

test('context keeps absent usage, thresholds, rates, and cost unknown', async () => {
  let refreshed = 0
  const props = fixture({ refreshContext: async () => { refreshed += 1 } })
  const { ui, controls } = testElements('terminal')
  const output = renderContext(ui, props)
  expect(text(output)).toContain('unknown / unknown tokens · unknown')
  expect(text(output)).toContain('Session cost ledger: unknown')
  expect(text(output)).toContain('No category summary yet')
  expect(text(output)).toContain('Rate windows · last reported\nNot reported.')
  await controls.get('context-refresh')?.onPress?.()
  expect(refreshed).toBe(1)
  props.context.usage = { startedAt: 0, context: { window: 200000, breakdown: { ...breakdown(), autoCompactThreshold: undefined } }, rateLimits: [] }
  expect(text(renderContext(ui, props))).toContain('Threshold: unknown tokens')
})

test('context distinguishes actual usage from local estimates and accepts a zero cost ledger', () => {
  const props = fixture()
  props.context.usage = {
    startedAt: 0, context: { tokens: 4000, window: 200000, percent: 2, breakdown: breakdown() },
    rateLimits: [{ kind: 'five_hour', percentUsed: 23.5 }, { kind: 'spend_limit', percentUsed: 104, resetsAt: '2026-10-08T00:00:00Z' }],
    cost: { usd: 0 },
  }
  const { ui } = testElements('terminal')
  const output = text(renderContext(ui, props))
  expect(output).toContain('4,000 / 200,000 tokens · 2%')
  expect(output).toContain('4,500 / 100,000 · 4.5%')
  expect(output).toContain('Threshold: 89,500 tokens')
  expect(output).toContain('five_hour · 23.5%')
  expect(output).toContain('spend_limit · 104%')
  expect(output).toContain('Reset: unknown')
  expect(output).toContain('Session cost ledger: $0.0000')
  expect(output).not.toContain('Last turn:')
})

test('context lists compactions and cost per turn', () => {
  const props = fixture()
  props.context.compactions = [
    { at: 0, trigger: 'auto', tokensBefore: 150000, tokensAfter: 20000 },
    { at: 500, trigger: 'manual', skipped: 'Blocked.' },
  ]
  props.context.costs = [{ at: 0, usd: 1 }, { at: 1, usd: 1.5 }, { at: 2, usd: 1.75 }]
  const output = text(renderContext(testElements('terminal').ui, props))
  expect(output).toContain('manual · skipped: Blocked. · 500ms ago')
  expect(output).toContain('auto · 150,000 → 20,000 tokens · 1.0s ago')
  expect(output).toContain('Last turn: $0.2500 · average $0.3750 over 2')
})

test('reactor draws the orb as text on every surface and keeps the pause callback', async () => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    let toggles = 0
    const props = fixture({ toggleAnimation: async () => { toggles += 1 } })
    props.reactor.phase = 'tools'
    props.activity.samples = [{ at: 0, level: 1 }, { at: 5000, level: 2 }, { at: 10000, level: 1 }]
    props.now = 12000
    const { ui, controls } = testElements(surface)
    const output = renderReactor(ui, props)
    expect(nodes(output).filter(node => node.type === 'Raster' || node.type === 'Svg')).toHaveLength(0)
    expect(text(output)).toMatch(/[⠁-⣿]/)
    expect(text(output)).toContain('TOOLS')
    expect(text(output)).toContain('Activity, last 15.0s')
    expect(text(output)).not.toContain('tokens/s')
    await controls.get('reactor-toggle')?.onPress?.()
    expect(toggles).toBe(1)
    props.preferences.animation = false
    expect(text(renderReactor(ui, props))).toContain('Resume animation')
  }
})

test('all visual views render bounded graphics and lists at supported widths', () => {
  for (const columns of [40, 80, 140]) {
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const props = fixture()
      props.columns = columns
      props.context.usage = { startedAt: 0, context: { window: 200000, breakdown: breakdown() }, rateLimits: [] }
      const { ui } = testElements(surface)
      for (const render of [renderContext, renderReactor]) {
        const tree = render(ui, props)
        expect(nodes(tree).length).toBeLessThan(200)
        expect(text(tree)).not.toContain('undefined')
      }
    }
  }
})
