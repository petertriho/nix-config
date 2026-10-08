import { expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import type { On, RenderElement, RenderPropsOf, RenderSurface } from 'claude-code'
import type { CockpitAgent, CockpitTool, CockpitView, CockpitViewProps } from '../types'
import {
  agentHierarchy,
  agentStatusLabel,
  bandSummary,
  gitOperationLines,
  patchPreview,
  planProgress,
  renderAgents,
  renderChanges,
  renderTools,
  toolDuration,
  visibleWindow,
  waitDuration,
} from '../hooks/operations'
import { initialActivity, initialContext, initialReview } from '../hooks/state'

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

test('operations: a PostToolUse time replaces the wall time and leaves the wait apart', () => {
  const asked = tool('asked', { outcome: 'success', finishedAt: 16000, runMs: 1200, approval: 'asked' })
  expect(toolDuration(asked, 20000)).toBe(1200)
  expect(waitDuration(asked)).toBe(13800)
  // A running call has no execution time yet: its elapsed time includes the prompt.
  expect(toolDuration(tool('live', { runMs: 50 }), 3500)).toBe(2500)
  expect(waitDuration(tool('live'))).toBeUndefined()
})

test('operations: the band counts with plurals, shows the plan, background work and a stop failure', () => {
  const activity = {
    ...initialActivity(),
    agents: [agent('one')],
    tools: [tool('only')],
    todos: [{ items: [
      { content: 'Read', status: 'completed' as const, activeForm: 'Reading' },
      { content: 'Write', status: 'in_progress' as const, activeForm: 'Writing' },
      { content: 'Test', status: 'pending' as const, activeForm: 'Testing' },
    ], updatedAt: 1 }],
    background: [
      { id: 'b1', type: 'shell', status: 'running', description: 'Watch', updatedAt: 1 },
      { id: 'b2', type: 'shell', status: 'ended', description: 'Done', updatedAt: 1, endedAt: 2 },
    ],
  }
  expect(bandSummary(activity, { isWorking: true, columns: 80 }).text).toBe('1 agent · 1 tool running · 1/3 todos · 1 background')
  expect(planProgress({ todos: [], tasks: [{ id: '1', subject: 'Ship', status: 'completed' }] })).toBe('1/1 tasks')
  const failed = { ...initialActivity(), stopFailure: { error: 'rate_limit', at: 1 } }
  expect(bandSummary(failed, { isWorking: false, columns: 80 })).toEqual({ text: '0 agents · stopped: rate limit', color: 'error' })
  expect(bandSummary(failed, { isWorking: true, columns: 80 }).text).toBe('0 agents · thinking')
})

test('operations: git operations read as short lines', () => {
  expect(gitOperationLines({
    id: 'g', at: 0,
    commit: { sha: '0123456789abcdef', kind: 'committed', branch: 'main' },
    push: { branch: 'main' },
    pr: { number: 7, action: 'auto-merge-enabled' },
  })).toEqual(['committed 0123456789 on main', 'pushed main', 'PR #7 auto-merge-enabled'])
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
    reactor: { frame: 0, phase: 'idle' },
    viewedAgent: null,
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
          expect(await mounted.find({ type: 'Text', text: 'server tool' })).toBeDefined()
        } else {
          expect((await mounted.find({ type: 'Code' }))?.props.format).toBe('diff')
          expect(await mounted.find({ type: 'Text', text: 'Missing return value' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: 'Finding on an unchanged file' })).toBeDefined()
          expect(await mounted.find({ type: 'Text', text: '0 running · 1 passed · 0 failed' })).toBeDefined()
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
    expect(await mounted.find({ type: 'Text', text: 'reported after the response' })).toBeDefined()
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
  const state = new Map<string, unknown>([
    ['activity', props.activity], ['review', props.review], ['context', props.context],
    ['preferences', props.preferences], ['reactor', props.reactor],
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
  mock.store(on)
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

for (const surface of ['terminal', 'mobile'] as const) {
  test(`operations: agents show the plan, run totals, todos and last answer on ${surface}`, async ($, on) => {
    const { props } = fixture('agents')
    props.activity.selectedAgent = 'finished'
    props.viewedAgent = 'finished'
    props.activity.todos = [
      { items: [{ content: 'Plan', status: 'completed', activeForm: 'Planning' }, { content: 'Build', status: 'in_progress', activeForm: 'Building' }], updatedAt: 1 },
      { agentId: 'finished', items: [{ content: 'Check', status: 'pending', activeForm: 'Checking' }], updatedAt: 1 },
    ]
    props.activity.tasks = [{ id: '4', subject: 'Release', status: 'pending', owner: 'lead' }]
    props.activity.agents = props.activity.agents.map(item => item.id === 'finished' ? {
      ...item,
      totals: { tokens: 45000, toolUses: 1, durationMs: 130000, linesAdded: 12, linesRemoved: 3, models: ['test-model'] },
      answer: '## Report\n\nAll **done**.',
    } : item)
    on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderAgents($.ui.resolve(e), props))
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'ops:test', props: paneProps(80) })
    expect(await mounted.find({ type: 'Text', text: 'Plan · 1/2 todos · 0/1 tasks' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: '▸ Building' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: '#4 Release · lead' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Selected agent · in view' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Todos · 0/1 done' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: '45,000 tokens · 1 tool use · 2m 10s' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: '+12' })).toBeDefined()
    expect((await mounted.find({ type: 'Markdown' }))?.props.text).toBe('## Report\n\nAll **done**.')
    expect(await mounted.find({ type: 'Text', text: 'Last turn usage' })).toBeUndefined()
    await mounted.unmount()
  })

  test(`operations: tools show approval, execution time, wait and background work on ${surface}`, async ($, on) => {
    const { props } = fixture('tools')
    props.activity.tools = [
      tool('asked', { tool: 'Bash', outcome: 'success', startedAt: 1000, finishedAt: 5000, runMs: 1500, approval: 'asked' }),
      tool('pending', { tool: 'Bash', startedAt: 5500, approval: 'asked' }),
    ]
    props.activity.selectedTool = 'asked'
    props.activity.background = [
      { id: 'shell-1', type: 'shell', status: 'running', description: 'Watch tests', startedAt: 2000, updatedAt: 2000 },
      { id: 'agent-1', type: 'subagent', status: 'ended', description: 'Survey', startedAt: 1000, endedAt: 3000, updatedAt: 3000 },
    ]
    props.activity.backgroundAt = 4000
    props.activity.crons = [{ id: 'c1', schedule: '*/5 * * * *', recurring: true }]
    on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderTools($.ui.resolve(e), props))
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'ops:test', props: paneProps(80) })
    expect(await mounted.find({ type: 'Text', text: 'running · approval asked' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Ran 1.5s' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Approval and hooks 2.5s' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Background · 1 in flight · reported 2.0s ago' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'shell · running · Watch tests · 4.0s' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'subagent · ended · Survey · 2.0s' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'Scheduled: */5 * * * *' })).toBeDefined()
    await mounted.unmount()
  })

  test(`operations: changes show git activity with a PR link on ${surface}`, async ($, on) => {
    const { props } = fixture('changes')
    props.review.gitOps = [
      { id: 'g1', at: 1000, commit: { sha: 'abcdef0123456789', kind: 'committed', branch: 'feature/cockpit' } },
      { id: 'g2', at: 2000, pr: { number: 12, action: 'created', url: 'https://example.test/pull/12' } },
    ]
    on('ui.render', { component: 'Pane', requestId: 'ops:test' }, ($, e) => renderChanges($.ui.resolve(e), props))
    const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId: 'ops:test', props: paneProps(80) })
    expect(await mounted.find({ type: 'Text', text: 'committed abcdef0123 on feature/cockpit · 5.0s ago' })).toBeDefined()
    expect(await mounted.find({ type: 'Text', text: 'PR #12 created · 4.0s ago' })).toBeDefined()
    expect((await mounted.find({ type: 'Link' }))?.props.href).toBe('https://example.test/pull/12')
    await mounted.unmount()
  })
}
