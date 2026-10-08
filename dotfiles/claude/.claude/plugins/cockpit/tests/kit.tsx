// Shared fixtures for the cockpit tests: element tables that record the tree,
// readers for drawn text and colors, and a session with every kind of data.
import type {
  BoxProps, ButtonProps, CodeProps, ElementConstructor, InputProps, LinkProps, MarkdownProps, RasterProps,
  RenderElement, RenderSurface, SelectProps, SessionContextBreakdown, SvgProps, TextProps,
} from 'claude-code'
import type { CockpitAgent, CockpitTool, CockpitView, CockpitViewProps } from '../types'
import { initialActivity, initialContext, initialReview } from '../hooks/state'
import type { CockpitElements } from '../hooks/theme'
import { colors } from '../hooks/theme'

type Node = RenderElement | string
type Drawn = { type: string; props: Record<string, unknown>; children?: Node[] }

const childrenOf = (node: RenderElement): Node[] => {
  const children = (node as unknown as Drawn).children
  return Array.isArray(children) ? children : []
}

const propsOf = (node: RenderElement): Record<string, unknown> => (node as unknown as Drawn).props ?? {}

const inline = (node: Node): string => {
  if (typeof node === 'string') return node
  if (node.type === 'Button') return String(propsOf(node).label ?? '')
  return childrenOf(node).map(inline).join('')
}

// The lines a node shows: a row of one-line children joins as the screen
// draws it, a gap as spaces; any other Box stacks its children's lines.
const linesOf = (node: Node): string[] => {
  if (typeof node === 'string') return [node]
  const props = propsOf(node)
  if (node.type === 'Text' || node.type === 'Button') return [inline(node)]
  if (node.type === 'Link') return [String(props.label ?? props.href ?? '')]
  if (node.type === 'Markdown') return [String(props.text ?? '')]
  if (node.type === 'Code') return [String(props.source ?? '')]
  const parts = childrenOf(node).map(linesOf).filter(lines => lines.length > 0)
  if (props.flexDirection === 'row' && parts.every(lines => lines.length === 1)) {
    const gap = Number(props.columnGap ?? props.gap ?? (props.justifyContent === 'space-between' ? 1 : 0)) || 0
    return [parts.map(lines => lines[0]).join(' '.repeat(gap))]
  }
  return parts.flat()
}

/** The text a drawing shows, one line per row the screen would draw. */
export const shownText = (tree: RenderElement): string => linesOf(tree).join('\n')

/** Every color a drawing names, for the theme-key check. */
export const colorsOf = (tree: RenderElement): unknown[] => {
  const found: unknown[] = []
  const walk = (node: Node): void => {
    if (typeof node === 'string') return
    const props = propsOf(node)
    for (const prop of ['color', 'borderColor', 'backgroundColor']) if (props[prop] !== undefined) found.push(props[prop])
    for (const child of childrenOf(node)) walk(child)
  }
  walk(tree)
  return found
}

export const themeKeys = new Set<string>(Object.values(colors))

export const elementsOf = (tree: RenderElement, type?: string): Drawn[] => {
  const found: Drawn[] = []
  const walk = (node: Node): void => {
    if (typeof node === 'string') return
    if (type === undefined || node.type === type) found.push(node as unknown as Drawn)
    for (const child of childrenOf(node)) walk(child)
  }
  walk(tree)
  return found
}

type Control = { onPress?: () => Promise<void> | void }

const flatten = (children: unknown): Node[] => {
  if (Array.isArray(children)) return children.flatMap(flatten)
  if (children === undefined || children === null || typeof children === 'boolean') return []
  if (typeof children === 'number') return [String(children)]
  return [children as Node]
}

/** An element table that returns plain trees and keeps each Button's handler by key. */
export const testElements = (surface: RenderSurface): { ui: CockpitElements; controls: Map<string, Control> } => {
  const controls = new Map<string, Control>()
  const make = <P,>(type: string): ElementConstructor<P> => props => {
    const attributes = { ...props } as Record<string, unknown>
    const key = attributes.key ?? attributes.label
    if (type === 'Button' && typeof key === 'string') controls.set(key, { onPress: attributes.onPress as Control['onPress'] })
    const children = flatten(attributes.children)
    delete attributes.children
    delete attributes.onPress
    return { type, props: attributes, children } as unknown as RenderElement
  }
  const common = {
    Box: make<BoxProps>('Box'), Text: make<TextProps>('Text'), Button: make<ButtonProps>('Button'),
    Link: make<LinkProps>('Link'), Code: make<CodeProps>('Code'), Markdown: make<MarkdownProps>('Markdown'),
  }
  const input = { Input: make<InputProps>('Input'), Select: make<SelectProps>('Select') }
  if (surface === 'terminal') return { ui: { ...common, ...input, Raster: make<RasterProps>('Raster') } as CockpitElements, controls }
  return { ui: { ...common, Svg: make<SvgProps>('Svg'), ...(surface === 'mobile' ? {} : input) } as CockpitElements, controls }
}

export const agent = (id: string, fields: Partial<CockpitAgent> = {}): CockpitAgent => ({
  id, name: id, description: `Task for ${id}`, type: 'general-purpose', status: 'running', lastSeenAt: 1000, ...fields,
})

export const tool = (id: string, fields: Partial<CockpitTool> = {}): CockpitTool => ({
  id, tool: 'Read', startedAt: 1000, outcome: 'running', ...fields,
})

export const breakdown = (fields: Partial<SessionContextBreakdown> = {}): SessionContextBreakdown => ({
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
  ...fields,
})

export const PATCH = '--- a/src/view.ts\n+++ b/src/view.ts\n@@ -1 +1 @@\n-old\n+new\n'

export const USAGE = { model: 'test-model', input_tokens: 20, output_tokens: 12, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 }

/** A session one minute in: a plan, three agents, tools of every outcome, changes, checks, context. */
export const viewFixture = (view: CockpitView, columns = 80): { props: CockpitViewProps; calls: string[] } => {
  const calls: string[] = []
  const props: CockpitViewProps = {
    activity: {
      ...initialActivity(),
      sessionId: 'fixture', model: 'claude-test-model', working: true, turnStartedAt: 50000, phase: 'tools',
      agents: [
        agent('parent', { name: 'Coordinator', startedAt: 10000 }),
        agent('child', { name: 'External worker', parentId: 'parent', teammateId: 'team:child', startedAt: 20000 }),
        agent('missing', { name: 'Unavailable worker', status: 'missing' }),
        agent('finished', {
          name: 'Finished worker', status: 'completed', durationMs: 2200, completedAt: 30000, startedAt: 27800,
          usage: USAGE,
        }),
      ],
      tools: [
        tool('main', { tool: 'Edit', outcome: 'success', startedAt: 12000, finishedAt: 12200, target: 'src/view.ts' }),
        tool('live', { agentId: 'child', tool: 'Grep', startedAt: 57000, target: 'src' }),
        tool('own', { tool: 'Bash', startedAt: 48000, target: 'npm' }),
        tool('server', { tool: 'mcp__example__search', agentId: 'child', outcome: 'error', startedAt: 40000, finishedAt: 41500, retrospective: true }),
        tool('denied', { agentId: 'parent', tool: 'WebFetch', outcome: 'denied', startedAt: 30000, finishedAt: 39000, approval: 'asked' }),
        tool('stopped', { agentId: 'parent', outcome: 'interrupted', startedAt: 25000, finishedAt: 26000 }),
        tool('asked', { tool: 'Bash', outcome: 'success', startedAt: 14000, finishedAt: 18000, runMs: 1500, approval: 'asked', target: 'git' }),
      ],
      turns: [
        { id: 'turn-1', durationMs: 30000, reason: 'answer', finishedAt: 45000, usage: USAGE },
        { id: 'turn-a', agentId: 'finished', durationMs: 2200, reason: 'answer', finishedAt: 30000, usage: USAGE },
      ],
      samples: [{ at: 10000, level: 1 }, { at: 20000, level: 3 }, { at: 30000, level: 2 }, { at: 50000, level: 1 }],
      todos: [
        { items: [
          { content: 'Plan', status: 'completed', activeForm: 'Planning' },
          { content: 'Build', status: 'in_progress', activeForm: 'Building' },
          { content: 'Ship', status: 'pending', activeForm: 'Shipping' },
        ], updatedAt: 1 },
        { agentId: 'finished', items: [{ content: 'Check', status: 'pending', activeForm: 'Checking' }], updatedAt: 1 },
      ],
      tasks: [{ id: '4', subject: 'Release', status: 'pending', owner: 'lead' }],
      background: [
        { id: 'shell-1', type: 'local_bash', status: 'running', description: 'Watch tests', startedAt: 40000, updatedAt: 40000 },
        { id: 'agent-1', type: 'subagent', status: 'ended', description: 'Survey', startedAt: 20000, endedAt: 30000, updatedAt: 30000 },
      ],
      crons: [{ id: 'c1', schedule: '*/5 * * * *', recurring: true }],
      backgroundAt: 55000,
      selectedAgent: view === 'agents' ? 'finished' : null,
      selectedTool: 'asked',
    },
    review: {
      ...initialReview(),
      sessionId: 'fixture', branch: 'feature/cockpit', selectedPath: 'src/view.ts', refreshedAt: 50000,
      changes: [
        { path: 'src/view.ts', patch: PATCH, additions: 1, deletions: 1, source: 'git', state: 'modified', updatedAt: 1000, edits: 2, agentId: 'child' },
        { path: 'src/staged.ts', patch: '', additions: 8, deletions: 0, source: 'git', state: 'added', staged: true, updatedAt: 1000 },
        { path: 'src/new.ts', patch: '', additions: 0, deletions: 0, source: 'git', state: 'untracked', untracked: true, updatedAt: 1000 },
        { path: 'src/edited.ts', patch: '', additions: 0, deletions: 0, source: 'observed', truncated: true, updatedAt: 1000 },
      ],
      findings: [
        { id: 'finding-1', path: 'src/view.ts', line: 1, summary: 'Missing return value', category: 'correctness', verdict: 'CONFIRMED' },
        { id: 'finding-2', path: 'src/unchanged.ts', line: 4, summary: 'Finding on an unchanged file', category: 'correctness' },
      ],
      checks: [
        { id: 'check-1', label: 'Type check', status: 'passed', passed: 2, failed: 0, durationMs: 400, finishedAt: 40000 },
        { id: 'check-2', label: 'npm test', status: 'failed', failed: 3, durationMs: 6200, finishedAt: 45000 },
        { id: 'check-3', label: 'Lint', status: 'running' },
      ],
      gitOps: [
        { id: 'g1', at: 40000, commit: { sha: 'abcdef0123456789', kind: 'committed', branch: 'feature/cockpit' } },
        { id: 'g2', at: 50000, pr: { number: 12, action: 'created', url: 'https://example.test/pull/12' } },
      ],
    },
    context: {
      ...initialContext(),
      sessionId: 'fixture', refreshedAt: 55000,
      usage: {
        startedAt: 0,
        context: { window: 100000, tokens: 60000, percent: 60, breakdown: breakdown() },
        rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: new Date(60000 + 7200000).toISOString() }, { kind: 'seven_day', percentUsed: 95 }],
        cost: { usd: 1.75 },
      },
      costs: [{ at: 10000, usd: 1 }, { at: 30000, usd: 1.5 }, { at: 50000, usd: 1.75 }],
      fills: [{ at: 10000, tokens: 20000 }, { at: 30000, tokens: 40000 }, { at: 50000, tokens: 60000 }],
      compactions: [
        { at: 5000, trigger: 'auto', tokensBefore: 150000, tokensAfter: 20000 },
        { at: 8000, trigger: 'manual', skipped: 'Blocked.' },
      ],
    },
    preferences: { view, band: true, animation: true, span: 'fit', paneOpen: true },
    mascot: { frame: 0, phase: 'tools' },
    viewedAgent: null,
    columns,
    rows: 40,
    now: 60000,
    actions: {
      selectView: async next => { calls.push(`view:${next}`); props.preferences.view = next },
      refreshAgents: async () => { calls.push('refresh:agents') },
      selectAgent: async id => { calls.push(`agent:${id}`); props.activity.selectedAgent = id },
      selectTool: async id => { calls.push(`tool:${id}`); props.activity.selectedTool = id },
      refreshChanges: async () => { calls.push('refresh:changes') },
      selectChange: async path => { calls.push(`file:${path}`); props.review.selectedPath = path },
      copyPath: async path => { calls.push(`path:${path}`) },
      copyPatch: async path => { calls.push(`copy:${path}`) },
      quotePatch: async path => { calls.push(`quote:${path}`) },
      refreshContext: async () => { calls.push('refresh:context') },
      toggleAnimation: async () => { calls.push('animation'); props.preferences.animation = !props.preferences.animation },
      cycleSpan: async () => { calls.push('span') },
    },
  }
  return { props, calls }
}
