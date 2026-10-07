import { expect, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import type { On, RenderElement, RenderPropsOf, RenderSurface } from 'claude-code'
import type { CockpitAgent, CockpitTool, CockpitView, CockpitViewProps } from '../types'
import {
  agentHierarchy,
  agentStatusLabel,
  patchPreview,
  renderAgents,
  renderChanges,
  renderTools,
  toolDuration,
  visibleWindow,
} from '../hooks/operations'
import { initialActivity, initialContext, initialImages, initialReview } from '../hooks/state'

const agent = (id: string, fields: Partial<CockpitAgent> = {}): CockpitAgent => ({
  id,
  name: id,
  description: `Task for ${id}`,
  type: 'general-purpose',
  status: 'running',
  lastSeenAt: 1000,
  ...fields,
})

const tool = (id: string, fields: Partial<CockpitTool> = {}): CockpitTool => ({
  id,
  tool: 'Read',
  startedAt: 1000,
  outcome: 'running',
  ...fields,
})

const patch = '--- a/src/view.ts\n+++ b/src/view.ts\n@@ -1 +1 @@\n-old\n+new\n'

test('operations: missing agents are unknown and external statuses are last reported', () => {
  expect(agentStatusLabel(agent('worker', { status: 'missing' }))).toBe('unknown (not listed)')
  expect(agentStatusLabel(agent('external', { teammateId: 'team:worker' }))).toBe('last reported: running')
  expect(agentStatusLabel(agent('local', { status: 'completed' }))).toBe('completed')
})

test('operations: hierarchy preserves parentage, orphans and cycles without duplicate rows', () => {
  const rows = agentHierarchy([
    agent('child', { parentId: 'parent' }),
    agent('parent'),
    agent('orphan', { parentId: 'not-observed' }),
    agent('cycle-a', { parentId: 'cycle-b' }),
    agent('cycle-b', { parentId: 'cycle-a' }),
  ])
  expect(rows.map(row => [row.agent.id, row.depth])).toEqual([
    ['parent', 0], ['child', 1], ['orphan', 0], ['cycle-a', 0], ['cycle-b', 1],
  ])
  expect(agentHierarchy(Array.from({ length: 140 }, (_, index) => agent(`worker-${index}`)))).toHaveLength(100)
})

test('operations: bounded windows keep the selected item reachable at each end', () => {
  const items = Array.from({ length: 100 }, (_, index) => index)
  expect(visibleWindow(items, 0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  expect(visibleWindow(items, 99, 8)).toEqual([92, 93, 94, 95, 96, 97, 98, 99])
  expect(visibleWindow(items, 51, 8)).toContain(51)
  expect(visibleWindow([], -1, 8)).toEqual([])
})

test('operations: duration uses elapsed time only for running tools', () => {
  expect(toolDuration(tool('live'), 3500)).toBe(2500)
  expect(toolDuration(tool('done', { outcome: 'success', finishedAt: 1800 }), 3500)).toBe(800)
  expect(toolDuration(tool('unknown', { outcome: 'error' }), 3500)).toBeUndefined()
  expect(toolDuration(tool('clock-skew', { finishedAt: 500 }), 3500)).toBe(0)
  expect(toolDuration(tool('bad-time', { startedAt: NaN }), 3500)).toBeUndefined()
})

test('operations: patch preview preserves complete hunks and strips unsafe controls', () => {
  const second = '@@ -10 +10 @@\n-before\n+after\n'
  expect(patchPreview(patch)).toEqual({ source: patch, truncated: false })
  expect(patchPreview(patch + second, patch.length + 10)).toEqual({ source: patch, truncated: true })
  expect(patchPreview(patch, 45)).toEqual({ source: '', truncated: true })
  expect(patchPreview('@@ -1 +1 @@\n-a\n+b\u001b\u0000\t\n').source).toBe('@@ -1 +1 @@\n-a\n+b  \t\n')
})

const paneProps = (columns: number): RenderPropsOf['Pane'] => ({
  title: 'Operations test',
  isFocused: true,
  bodyColumns: columns,
  placement: columns >= 110 ? 'dock' : 'inline',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
})

const fixture = (view: CockpitView, columns = 80): { props: CockpitViewProps; calls: string[] } => {
  const calls: string[] = []
  const props: CockpitViewProps = {
    activity: {
      ...initialActivity(),
      agents: [
        agent('parent', { name: 'Coordinator' }),
        agent('child', { name: 'External worker', parentId: 'parent', teammateId: 'team:child' }),
        agent('missing', { name: 'Unavailable worker', status: 'missing' }),
        agent('finished', {
          name: 'Finished worker',
          status: 'completed',
          durationMs: 2200,
          usage: { model: 'test-model', input_tokens: 12, output_tokens: 24, cache_read_input_tokens: 36, cache_creation_input_tokens: 48 },
        }),
      ],
      selectedAgent: view === 'agents' ? 'child' : null,
      tools: [
        tool('main', { outcome: 'success', finishedAt: 1200, target: 'src/view.ts' }),
        tool('live', { agentId: 'child', startedAt: 2000 }),
        tool('server', { tool: 'mcp__example__search', agentId: 'child', outcome: 'error', finishedAt: 1500, retrospective: true }),
        tool('denied', { agentId: 'parent', outcome: 'denied', finishedAt: 1200 }),
        tool('stopped', { agentId: 'parent', outcome: 'interrupted', finishedAt: 1300 }),
      ],
      selectedTool: 'server',
    },
    review: {
      ...initialReview(),
      branch: 'feature/cockpit',
      selectedPath: 'src/view.ts',
      changes: [
        { path: 'src/view.ts', patch, additions: 1, deletions: 1, source: 'git', updatedAt: 1000 },
        { path: 'src/new.ts', patch: '', additions: 0, deletions: 0, source: 'observed', untracked: true, truncated: true, updatedAt: 1000 },
      ],
      findings: [
        { id: 'finding-1', path: 'src/view.ts', line: 1, summary: 'Missing return value', category: 'correctness', verdict: 'CONFIRMED' },
        { id: 'finding-2', path: 'src/unchanged.ts', line: 4, summary: 'Finding on an unchanged file', category: 'correctness' },
      ],
      checks: [
        { id: 'check-1', label: 'Type check', status: 'passed', passed: 2, failed: 0, durationMs: 400 },
        { id: 'check-2', label: 'Other check', status: 'completed' },
      ],
    },
    context: initialContext(),
    preferences: { view, band: false, animation: false, paneOpen: false },
    reactor: { frame: 0, phase: 'idle', samples: [] },
    images: initialImages(),
    columns,
    rows: 30,
    now: 6000,
    actions: {
      selectView: async next => { calls.push(`view:${next}`); props.preferences.view = next },
      refreshAgents: async () => { calls.push('refresh:agents') },
      selectAgent: async id => { calls.push(`agent:${id}`); props.activity.selectedAgent = id },
      selectTool: async id => { calls.push(`tool:${id}`); props.activity.selectedTool = id },
      refreshChanges: async () => { calls.push('refresh:changes') },
      selectChange: async path => { calls.push(`file:${path}`); props.review.selectedPath = path },
      copyPatch: async path => { calls.push(`copy:${path}`) },
      quotePatch: async path => { calls.push(`quote:${path}`) },
      refreshContext: async () => { calls.push('unexpected:context') },
      toggleAnimation: async () => { calls.push('unexpected:animation') },
      loadImage: async () => { calls.push('unexpected:image') },
      selectImage: async () => { calls.push('unexpected:image-selection') },
      clearImages: async () => { calls.push('unexpected:image-clear') },
      setImageDraft: async () => { calls.push('unexpected:image-draft') },
    },
  }
  return { props, calls }
}

const buttonOwner = (tree: RenderElement, key: string): string | undefined => {
  if (tree.type === 'Button' && tree.props.key === key) return tree.press.plugin
  for (const child of ('children' in tree ? tree.children : undefined) ?? []) {
    if (typeof child !== 'string') {
      const owner = buttonOwner(child, key)
      if (owner !== undefined) return owner
    }
  }
  return undefined
}

const press = async (mounted: Pick<Mounted<RenderSurface, 'Pane'>, 'drawn' | 'press'>, key: string): Promise<void> => {
  const plugin = buttonOwner(await mounted.drawn(), key)
  expect(plugin).toBeDefined()
  await mounted.press({ key, plugin })
}

const renderers = { agents: renderAgents, tools: renderTools, changes: renderChanges } as const

for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
  for (const view of ['agents', 'tools', 'changes'] as const) {
    test(`operations: ${view} uses native ${surface} elements at 40/80/140 columns`, async ($, on) => {
      const { props, calls } = fixture(view)
      on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderers[view]($.ui.resolve(e), props))
      for (const columns of [40, 80, 140]) {
        props.columns = columns
        const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'ops:test', props: paneProps(columns) })
        expect((await mounted.drawn()).type).toBe('Box')
        expect(await mounted.find({ type: 'Text', text: view === 'agents' ? 'Agent hierarchy' : view === 'tools' ? 'Tool timeline' : 'Changes & checks' })).toBeDefined()
        if (view === 'agents') {
          expect(await mounted.find({ type: 'Text', text: 'last reported: running' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: 'unknown (not listed)' })).toBeDefined()
        } else if (view === 'tools') {
          for (const outcome of ['running', 'success', 'error', 'denied', 'interrupted']) expect(await mounted.find({ type: 'Text', text: outcome })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: 'Retrospective server tool' })).toBeDefined()
        } else {
          expect((await mounted.find({ type: 'Code' }))?.props.format).toBe('diff')
          expect(await mounted.find({ type: 'Text', text: 'Missing return value' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: 'Finding on an unchanged file' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: 'Completed does not mean passed' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: 'Pass/fail counts unknown' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: 'Line counts unavailable' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: '+0' })).toBeUndefined()
          expect(await mounted.find({ type: 'Text', text: '−0' })).toBeUndefined()
        }
        await mounted.unmount()
      }
      expect(calls).toEqual([])
    })
  }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`operations: agent buttons call supplied actions on ${surface}`, async ($, on) => {
    const { props, calls } = fixture('agents')
    on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderAgents($.ui.resolve(e), props))
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'ops:test', props: paneProps(80) })
    await press(mounted, 'ops:refresh-agents')
    await press(mounted, 'ops:agent-tool:live')
    expect(calls).toEqual(['refresh:agents', 'agent:child', 'tool:live', 'view:tools'])
    await press(mounted, 'ops:agent:finished')
    await mounted.redraw()
    expect(await mounted.find({ type: 'Text', text: 'test-model' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Input 12' })).toBeDefined()
    expect(calls.at(-1)).toBe('agent:finished')
    await mounted.unmount()
  })

  test(`operations: tool filters and selection call supplied actions on ${surface}`, async ($, on) => {
    const { props, calls } = fixture('tools')
    on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderTools($.ui.resolve(e), props))
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'ops:test', props: paneProps(80) })
    await press(mounted, 'ops:tools-agent:child')
    await mounted.redraw()
    expect(await mounted.find({ key: 'ops:tool:main' })).toBeUndefined()
    expect(await mounted.find({ key: 'ops:tool:live' })).toBeDefined()
    await press(mounted, 'ops:tool:server')
    await mounted.redraw()
    expect(await mounted.find({ type: 'Text', text: 'observed after the result' })).toBeDefined()
    await press(mounted, 'ops:tools-all')
    await mounted.redraw()
    expect(await mounted.find({ key: 'ops:tool:main' })).toBeDefined()
    expect(calls).toEqual(['agent:child', 'tool:null', 'tool:server', 'agent:null', 'tool:null'])
    await mounted.unmount()
  })

  test(`operations: change buttons select, refresh, copy and quote on ${surface}`, async ($, on) => {
    const { props, calls } = fixture('changes')
    on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderChanges($.ui.resolve(e), props))
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'ops:test', props: paneProps(80) })
    await press(mounted, 'ops:refresh-changes')
    await press(mounted, 'ops:copy-patch')
    await press(mounted, 'ops:quote-patch')
    await press(mounted, 'ops:file:src/new.ts')
    await mounted.redraw()
    expect(await mounted.find({ type: 'Text', text: 'Truncated patch' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Patch omitted: no complete hunk fits the capture limit' })).toBeDefined()
    expect(await mounted.find({ key: 'ops:copy-patch' })).toBeUndefined()
    expect(calls).toEqual(['refresh:changes', 'copy:src/view.ts', 'quote:src/view.ts', 'file:src/new.ts'])
    await mounted.unmount()
  })
}

test('operations: large agent lists stay bounded and selected tails remain visible', async ($, on) => {
  const { props } = fixture('agents', 40)
  props.activity.agents = Array.from({ length: 100 }, (_, index) => agent(`worker-${index}`))
  props.activity.selectedAgent = 'worker-99'
  on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderAgents($.ui.resolve(e), props))
  const mounted = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'ops:test', props: paneProps(40) })
  expect(await mounted.find({ key: 'ops:agent:worker-99' })).toBeDefined()
  expect((await mounted.findAll({ type: 'Button' })).length).toBeLessThan(30)
  expect(await mounted.find({ type: 'Text', text: 'Showing 20/100' })).toBeDefined()
  await press(mounted, 'ops:agent-next')
  await mounted.redraw()
  expect(await mounted.find({ key: 'ops:agent:worker-0' })).toBeDefined()
  await mounted.unmount()
})

const nativeState = (on: On, props: CockpitViewProps): Map<string, unknown> => {
  props.activity.sessionId = 'operations-test-session'
  props.review.sessionId = 'operations-test-session'
  props.context.sessionId = 'operations-test-session'
  props.images.sessionId = 'operations-test-session'
  const state = new Map<string, unknown>([
    ['activity', props.activity], ['review', props.review], ['context', props.context],
    ['preferences', props.preferences], ['reactor', props.reactor], ['images', props.images],
  ])
  const versions = new Map<string, number>()
  on('state.get', { plugin: 'cockpit' }, ($, e) => ({ value: { value: state.get(e.key), version: versions.get(e.key) ?? 0 } }))
  on('state.set', { plugin: 'cockpit' }, ($, e) => {
    const version = versions.get(e.key) ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false, version } }
    state.set(e.key, e.value)
    versions.set(e.key, version + 1)
    return { value: { isSet: true, version: version + 1 } }
  })
  on('session.id', () => ({ value: 'operations-test-session' }))
  on('clock.now', () => ({ value: 6000 }))
  on('ui.toast', () => ({ value: undefined }))
  return state
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`operations: actual cockpit route selects an agent and opens its tool on ${surface}`, async ($, on) => {
    const { props } = fixture('agents')
    const state = nativeState(on, props)
    let refreshes = 0
    on('agent.list', () => { refreshes += 1; return { value: [] } })
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'cockpit', props: paneProps(80) })
    expect(await mounted.find({ type: 'Text', text: 'COCKPIT' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Agent hierarchy' })).toBeDefined()
    await press(mounted, 'ops:agent:finished')
    await mounted.redraw()
    expect(state.get('activity')).toMatchObject({ selectedAgent: 'finished' })
    expect(await mounted.find({ type: 'Text', text: 'Input 12' })).toBeDefined()
    await press(mounted, 'ops:agent:child')
    await mounted.redraw()
    await press(mounted, 'ops:agent-tool:live')
    await mounted.redraw()
    expect(state.get('preferences')).toMatchObject({ view: 'tools' })
    expect(state.get('activity')).toMatchObject({ selectedAgent: 'child', selectedTool: 'live' })
    expect(await mounted.find({ type: 'Text', text: 'Tool timeline' })).toBeDefined()
    expect(refreshes).toBe(1)
    await mounted.unmount()
  })

  test(`operations: actual cockpit changes route copies and quotes without submitting on ${surface}`, async ($, on) => {
    const { props } = fixture('changes')
    const state = nativeState(on, props)
    const copies: Array<{ text: string; surface: RenderSurface | undefined }> = []
    const drafts: string[] = []
    let submissions = 0
    on('ui.copy', ($, e) => { copies.push({ text: e.text, surface: e.surface }); return { value: { isCopied: true } } })
    on('prompt.fill', ($, e) => { drafts.push(e.text); expect(e.mode).toBe('append'); return { isFilled: true } })
    on('prompt.submit', () => { submissions += 1; return { drop: 'This test must not submit a prompt.' } })
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'cockpit', props: paneProps(80) })
    expect((await mounted.find({ type: 'Code' }))?.props.format).toBe('diff')
    await press(mounted, 'ops:copy-patch')
    await press(mounted, 'ops:quote-patch')
    expect(copies).toEqual([{ text: patch, surface }])
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toContain(patch)
    expect(drafts[0]).toContain('```diff')
    expect(submissions).toBe(0)
    await press(mounted, 'ops:file:src/new.ts')
    await mounted.redraw()
    expect(state.get('review')).toMatchObject({ selectedPath: 'src/new.ts' })
    expect(await mounted.find({ type: 'Text', text: 'Patch omitted: no complete hunk fits the capture limit' })).toBeDefined()
    await mounted.unmount()
  })
}
