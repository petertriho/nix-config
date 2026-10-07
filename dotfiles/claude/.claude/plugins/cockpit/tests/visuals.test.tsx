import { expect, test } from 'claude-code/testing'
import type {
  BoxProps,
  ButtonProps,
  CodeProps,
  ElementConstructor,
  ImageProps,
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
import {
  activitySparkline,
  imageSize,
  rankedEstimates,
  reactorRaster,
  reactorSize,
  renderContext,
  renderImages,
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
    ui: { ...common, ...input, Raster: make<RasterProps>('Raster'), Image: make<ImageProps>('Image') } as CockpitElements,
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
    activity: {
      sessionId: null, model: '', working: false, phase: 'idle', tools: [], agents: [], turns: [],
      samples: [], selectedAgent: null, selectedTool: null, updatedAt: 0, error: null,
    },
    review: {
      sessionId: null, changes: [], findings: [], checks: [], selectedPath: null, branch: null,
      root: null, refreshedAt: null, loading: false, error: null,
    },
    context: { sessionId: null, usage: null, refreshedAt: null, loading: false, error: null },
    preferences: { view: 'context', band: true, animation: true, paneOpen: true },
    reactor: { frame: 0, phase: 'idle', samples: [] },
    images: { sessionId: null, images: [], selected: 0, draft: '', loading: false, error: null },
    actions: {
      selectView: noop, refreshAgents: noop, selectAgent: noop, selectTool: noop,
      refreshChanges: noop, selectChange: noop, copyPatch: noop, quotePatch: noop,
      refreshContext: noop, toggleAnimation: noop, loadImage: noop, selectImage: noop,
      clearImages: noop, setImageDraft: noop, ...actions,
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

const decodeCells = (value: string): Uint8Array => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 4) {
    const a = alphabet.indexOf(value[index] ?? '')
    const b = alphabet.indexOf(value[index + 1] ?? '')
    const c = alphabet.indexOf(value[index + 2] ?? '')
    const d = alphabet.indexOf(value[index + 3] ?? '')
    bytes.push((a << 2) | (b >>> 4))
    if (value[index + 2] !== '=') bytes.push(((b & 15) << 4) | (c >>> 2))
    if (value[index + 3] !== '=') bytes.push(((c & 3) << 6) | d)
  }
  return Uint8Array.from(bytes)
}

test('reactor encodes a real deterministic little-endian braille drawing', () => {
  const reactor = { frame: 0, phase: 'thinking' as const, samples: [0, 1, 2] }
  const raster = reactorRaster(reactor, 40, 14)
  const bytes = decodeCells(raster.cells)
  expect(bytes.length).toBe(40 * 14 * 12)
  const view = new DataView(bytes.buffer)
  let dots = 0
  let highlights = 0
  for (let offset = 0; offset < bytes.length; offset += 12) {
    const glyph = view.getUint32(offset, true)
    expect(glyph === 32 || (glyph >= 0x2801 && glyph <= 0x28ff)).toBe(true)
    expect(view.getUint32(offset + 4, true)).toBeLessThanOrEqual(0x00ffffff)
    expect(view.getUint32(offset + 8, true)).toBe(0x1a1b26)
    if (glyph !== 32) dots += 1
    if (view.getUint32(offset + 4, true) === 0x7dcfff) highlights += 1
  }
  expect(dots).toBeGreaterThan(20)
  expect(highlights).toBeGreaterThan(0)
  expect(reactorRaster(reactor, 40, 14).cells).toBe(raster.cells)
  expect(reactorRaster({ ...reactor, frame: 7 }, 40, 14).cells).not.toBe(raster.cells)
  expect(reactorRaster({ ...reactor, phase: 'error' }, 40, 14).cells).not.toBe(raster.cells)
})

test('remote reactor graphics retain their dark background', () => {
  const props = fixture()
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const { ui } = testElements(surface)
    const output = renderReactor(ui, props)
    const source = nodes(output).find(node => node.type === 'Svg')?.props.source
    expect(source).toBeDefined()
    expect(source).toContain('<rect')
    expect(source).toContain('fill="#1a1b26"')
  }
})

test('graphics dimensions stay bounded at 40, 80, and 140 columns', () => {
  for (const columns of [40, 80, 140]) {
    const orb = reactorSize(columns, 40)
    expect(orb.columns).toBeLessThanOrEqual(columns)
    expect(orb.columns).toBeLessThanOrEqual(64)
    expect(orb.rows).toBeLessThanOrEqual(18)
    const image = imageSize({ path: '/test.png', label: 'test', width: 1600, height: 900, bytes: 1000 }, columns, 40)
    expect(image.columns).toBeLessThanOrEqual(columns)
    expect(image.rows).toBeLessThanOrEqual(30)
    expect(image.rows).toBeGreaterThan(0)
  }
  expect(reactorSize(Number.NaN, Number.NaN)).toEqual({ columns: 64, rows: 18 })
  expect(reactorRaster({ frame: Number.NaN, phase: 'idle', samples: [] }, -10, 9999).rows).toBe(40)
})

test('activity history is relative observed data, not invented tokens', () => {
  expect(activitySparkline([], 40)).toBe('No activity samples yet')
  expect(activitySparkline([0, 1, 2, 4], 40)).toBe('▁▃▅█')
  expect(activitySparkline([0, Number.NaN, -1], 40)).toBe('▁▁▁')
  expect(activitySparkline([0, 1, 2, 4], 2)).toHaveLength(2)
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
  expect(text(output)).toContain('No zero usage assumed')
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
  expect(output).toContain('Deferred schemas are outside the window')
  expect(output).toContain('five_hour · 23.5%')
  expect(output).toContain('spend_limit · 104%')
  expect(output).toContain('Reset: unknown')
  expect(output).toContain('Session cost ledger: $0.0000')
})

test('reactor chooses only surface-supported graphics and pause callback', async () => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    let toggles = 0
    const props = fixture({ toggleAnimation: async () => { toggles += 1 } })
    props.reactor.phase = 'tools'
    props.reactor.samples = [1, 2, 1]
    const { ui, controls } = testElements(surface)
    const output = renderReactor(ui, props)
    expect(nodes(output).filter(node => node.type === 'Raster')).toHaveLength(surface === 'terminal' ? 1 : 0)
    expect(nodes(output).filter(node => node.type === 'Svg')).toHaveLength(surface === 'terminal' ? 0 : 1)
    expect(text(output)).toContain('TOOLS')
    expect(text(output)).toContain('Motion is decorative')
    expect(text(output)).not.toContain('tokens/s')
    await controls.get('reactor-toggle')?.onPress?.()
    expect(toggles).toBe(1)
    props.preferences.animation = false
    expect(text(renderReactor(ui, props))).toContain('Resume animation')
  }
})

test('image view uses a local PNG source and forwards user actions', async () => {
  const loads: string[] = []
  const drafts: string[] = []
  const selections: number[] = []
  let clears = 0
  const props = fixture({
    loadImage: async path => { loads.push(path) },
    setImageDraft: async value => { drafts.push(value) },
    selectImage: async index => { selections.push(index) },
    clearImages: async () => { clears += 1 },
  })
  props.images.images = [
    { path: '/tmp/first.png', label: 'first.png', width: 640, height: 480, bytes: 1024 },
    { path: '/tmp/second.png', label: 'second.png', width: 320, height: 240, bytes: 2048 },
  ]
  props.images.selected = 1
  props.images.draft = '/tmp/third.png'
  const { ui, controls } = testElements('terminal')
  const output = renderImages(ui, props)
  const picture = nodes(output).find(node => node.type === 'Image')
  expect(picture?.props.source).toEqual({ file: '/tmp/second.png', format: 'png' })
  expect(picture?.props.alt).toContain('Kitty-compatible terminal')
  expect(text(output)).toContain('320 × 240 px · PNG · 2.0 KiB')
  await controls.get('image-path')?.onInput?.('/tmp/new.png')
  await controls.get('image-path')?.onSubmit?.('/tmp/new.png')
  await controls.get('image-load')?.onPress?.()
  await controls.get('image-select-0')?.onPress?.()
  await controls.get('images-clear')?.onPress?.()
  expect(drafts).toEqual(['/tmp/new.png'])
  expect(loads).toEqual(['/tmp/new.png', '/tmp/third.png'])
  expect(selections).toEqual([0])
  expect(clears).toBe(1)
})

test('image sources include the revision of reloaded files', () => {
  const props = fixture()
  const image = { path: '/tmp/reload.png', label: 'reload.png', width: 100, height: 80, bytes: 1024, generation: 17 }
  props.images.images = [image]
  const { ui } = testElements('terminal')
  const output = renderImages(ui, props)
  expect(nodes(output).find(node => node.type === 'Image')?.props.source).toEqual({
    file: '/tmp/reload.png', format: 'png', generation: 17,
  })
})

test('remote image fallback keeps metadata and mobile omits unsupported input', () => {
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const props = fixture()
    props.images.images = [{ path: '/tmp/art.png', label: 'art.png', width: 100, height: 80, bytes: 1024 }]
    const { ui } = testElements(surface)
    const output = renderImages(ui, props)
    expect(nodes(output).filter(node => node.type === 'Image')).toHaveLength(0)
    expect(nodes(output).filter(node => node.type === 'Input')).toHaveLength(surface === 'mobile' ? 0 : 1)
    expect(text(output)).toContain('Inline PNG preview is terminal-only')
    expect(text(output)).toContain('/tmp/art.png')
    expect(text(output)).toContain('100 × 80 px')
  }
})

test('all visual views render bounded graphics and lists at supported widths', () => {
  for (const columns of [40, 80, 140]) {
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const props = fixture()
      props.columns = columns
      props.context.usage = { startedAt: 0, context: { window: 200000, breakdown: breakdown() }, rateLimits: [] }
      const { ui } = testElements(surface)
      for (const render of [renderContext, renderReactor, renderImages]) {
        const tree = render(ui, props)
        expect(nodes(tree).length).toBeLessThan(200)
        expect(text(tree)).not.toContain('undefined')
      }
    }
  }
})
