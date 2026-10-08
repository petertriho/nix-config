import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, RenderPropsOf } from 'claude-code'
import type { CockpitView, CockpitViewProps } from '../types'
import { renderActivity } from '../hooks/activity'
import { agentHierarchy, agentStatusLabel, renderAgents } from '../hooks/agents'
import { changeGroups, gitOperationLines, patchPreview, renderChanges } from '../hooks/changes'
import { compactionLine, contextGauge, costPerTurn, rankedEstimates, renderContext } from '../hooks/context'
import { renderTools } from '../hooks/tools'
import { paneFooter, tabMark, tabRows, visibleWindow } from '../hooks/layout'
import type { CockpitElements } from '../hooks/theme'
import { agent, breakdown, colorsOf, elementsOf, PATCH, shownText, testElements, themeKeys, viewFixture } from './kit'

const renderers: Record<CockpitView, (ui: CockpitElements, props: CockpitViewProps) => RenderElement> = {
  agents: renderAgents, tools: renderTools, changes: renderChanges, context: renderContext, activity: renderActivity,
}

const paneProps = (columns: number): RenderPropsOf['Pane'] => ({
  title: 'Views test', isFocused: true, bodyColumns: columns, placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 }, view: {},
})

/** Renders a view with recording elements; `press` runs a Button's handler and draws again. */
const draw = (view: CockpitView, columns = 80, change?: (props: CockpitViewProps) => void) => {
  const fixture = viewFixture(view, columns)
  change?.(fixture.props)
  let { ui, controls } = testElements('terminal')
  let tree = renderers[view](ui, fixture.props)
  return {
    ...fixture,
    text: () => shownText(tree),
    tree: () => tree,
    has: (key: string) => controls.has(key),
    press: async (key: string) => {
      const control = controls.get(key)
      expect(control, `button ${key}`).toBeDefined()
      await control?.onPress?.()
      ;({ ui, controls } = testElements('terminal'))
      tree = renderers[view](ui, fixture.props)
    },
  }
}

describe('every view on every surface', () => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    test(`views validate on ${surface} at 40, 80, and 140 columns`, { timeoutMs: 30000 }, async ($, on) => {
      const cases = (['agents', 'tools', 'changes', 'context', 'activity'] as const).flatMap(view => [40, 80, 140].map(columns => {
        const fixture = viewFixture(view, columns)
        const requestId = `views:${view}:${columns}`
        on('ui.render', { component: 'Pane', requestId }, ($, e) => renderers[view]($.ui.resolve(e), fixture.props))
        return { view, columns, requestId, calls: fixture.calls }
      }))
      for (const { view, columns, requestId, calls } of cases) {
        const mounted = await $.ui.mount({ plugin: 'cockpit', surface, component: 'Pane', requestId, props: paneProps(columns) })
        const tree = await mounted.drawn()
        expect(tree.type).toBe('Box')
        for (const color of colorsOf(tree)) expect(themeKeys.has(color as string), `${view} color ${String(color)}`).toBe(true)
        expect(elementsOf(tree, 'Raster')).toEqual([])
        expect(elementsOf(tree, 'Svg')).toEqual([])
        expect(shownText(tree)).not.toMatch(/undefined|NaN|\[object/)
        expect(calls).toEqual([])
        await mounted.unmount()
      }
    })
  }

  test('empty sessions explain what will appear instead of drawing blanks', () => {
    for (const view of ['agents', 'tools', 'changes', 'context', 'activity'] as const) {
      const { text } = draw(view, 80, props => {
        props.activity = { ...props.activity, agents: [], tools: [], turns: [], todos: [], tasks: [], background: [], crons: [], samples: [], working: false, turnStartedAt: null, phase: 'idle' }
        props.review = { ...props.review, changes: [], findings: [], checks: [], gitOps: [] }
        props.context = { ...props.context, usage: null, costs: [], fills: [], compactions: [] }
        props.mascot = { frame: 0, phase: 'idle' }
      })
      expect(text()).not.toMatch(/undefined|NaN/)
      if (view === 'agents') expect(text()).toContain('No subagents yet.')
      if (view === 'tools') expect(text()).toContain('No tool calls for this filter yet.')
      if (view === 'changes') expect(text()).toContain('No changes yet.')
      if (view === 'context') expect(text()).toContain('Not measured yet')
      if (view === 'activity') expect(text()).toContain('zzz')
    }
  })
})

describe('agents view', () => {
  test('hierarchy keeps parentage, orphans and cycles without duplicate rows', () => {
    const rows = agentHierarchy([
      agent('child', { parentId: 'parent' }), agent('parent'), agent('orphan', { parentId: 'not-observed' }),
      agent('cycle-a', { parentId: 'cycle-b' }), agent('cycle-b', { parentId: 'cycle-a' }),
    ])
    expect(rows.map(row => [row.agent.id, row.depth])).toEqual([['parent', 0], ['child', 1], ['orphan', 0], ['cycle-a', 0], ['cycle-b', 1]])
    expect(agentHierarchy(Array.from({ length: 140 }, (_, index) => agent(`worker-${index}`)))).toHaveLength(100)
    expect(agentStatusLabel(agent('worker', { status: 'missing' }))).toBe('unknown (not listed)')
    expect(agentStatusLabel(agent('external', { teammateId: 'team:worker' }))).toBe('last reported: running')
  })

  test('shows the session, the plan, the agent tree, and the selected run', () => {
    const { text } = draw('agents')
    const shown = text()
    expect(shown).toContain('▸ Bash npm +1 · 12s · turn 10s')
    expect(shown).toContain('1 turn · avg 30.0s · 7 tool calls · 2 failed')
    expect(shown).toContain('in 20 · out 12 · cache 90 · 73% hit')
    expect(shown).toContain('4 agents · 2 live · 122 tokens')
    expect(shown).toContain('✓ Plan\n▸ Building\n○ Ship')
    expect(shown).toContain('Tasks 0/1 done')
    expect(shown).toContain('2 live · 1 done')
    expect(shown).toContain('Status   completed 30s ago · ran 2.2s')
    expect(shown).toContain('Model    test-model')
    expect(shown).toContain('○ Check')
  })

  test('selecting, stepping, and opening an agent\'s tools call the actions', async () => {
    const view = draw('agents')
    await view.press('agents:refresh')
    await view.press('agents:select:child')
    expect(view.text()).toContain('A teammate status is its last report.')
    expect(view.text()).toContain('Grep src')
    await view.press('agents:show-tools')
    await view.press('agents:next')
    expect(view.calls).toEqual(['refresh:agents', 'agent:child', 'agent:child', 'tool:null', 'view:tools', 'agent:missing'])
  })

  test('large lists stay bounded and keep the selection in view', async () => {
    const view = draw('agents', 40, props => {
      props.activity.agents = Array.from({ length: 100 }, (_, index) => agent(`worker-${index}`))
      props.activity.selectedAgent = 'worker-99'
    })
    expect(view.has('agents:select:worker-99')).toBe(true)
    expect(elementsOf(view.tree(), 'Button').length).toBeLessThan(40)
    expect(view.text()).toContain('Showing 20 of 100.')
    await view.press('agents:next')
    expect(view.has('agents:select:worker-0')).toBe(true)
  })
})

describe('tools view', () => {
  test('summarizes time and approvals, then running calls, the log, the detail, and background work', () => {
    const shown = draw('tools').text()
    expect(shown).toContain('7 calls · 2 running · 2 failed')
    expect(shown).toContain('Tool time 28.2s · 2 approvals · 2.5s waiting on you')
    expect(shown).toContain('▸ Grep src External work… 3.0s')
    expect(shown).toContain('Ran      1.5s')
    expect(shown).toContain('Approval 2.5s with hooks')
    expect(shown).toContain('Started  46s ago')
    expect(shown).toMatch(/Bash +2 +· +13s █/)
    expect(shown).toContain('1 running · 5.0s ago')
    expect(shown).toContain('● Watch tests bash  20s')
    expect(shown).toContain('○ Survey · ended')
    expect(shown).toContain('⏲ */5 * * * * · recurring')
  })

  test('filters by agent and selects calls through the actions', async () => {
    const view = draw('tools')
    await view.press('tools:filter:child')
    expect(view.has('tools:select:main')).toBe(false)
    expect(view.has('tools:select:live')).toBe(true)
    await view.press('tools:select:server')
    expect(view.text()).toContain('Server tool, reported after the response.')
    await view.press('tools:filter:all')
    expect(view.has('tools:select:main')).toBe(true)
    expect(view.calls).toEqual(['agent:child', 'tool:null', 'tool:server', 'agent:null', 'tool:null'])
  })
})

describe('changes view', () => {
  test('patch previews keep complete hunks and strip unsafe controls', () => {
    const second = '@@ -10 +10 @@\n-before\n+after\n'
    expect(patchPreview(PATCH)).toEqual({ source: PATCH, truncated: false })
    expect(patchPreview(PATCH + second, PATCH.length + 10)).toEqual({ source: PATCH, truncated: true })
    expect(patchPreview(PATCH, 45)).toEqual({ source: '', truncated: true })
    expect(patchPreview('@@ -1 +1 @@\n-a\n+b\u001b\u0000\t\n').source).toBe('@@ -1 +1 @@\n-a\n+b  \t\n')
  })

  test('git operations read as short lines and files group by Git state', () => {
    expect(gitOperationLines({
      id: 'g', at: 0, commit: { sha: '0123456789abcdef', kind: 'committed', branch: 'main' },
      push: { branch: 'main' }, pr: { number: 7, action: 'auto-merge-enabled' },
    })).toEqual(['committed 01234567 on main', 'pushed main', 'PR #7 auto-merge-enabled'])
    expect(changeGroups(viewFixture('changes').props.review.changes).map(group => [group.key, group.changes.map(change => change.path)])).toEqual([
      ['staged', ['src/staged.ts']], ['changed', ['src/view.ts']], ['untracked', ['src/new.ts']], ['edited', ['src/edited.ts']],
    ])
  })

  test('summarizes the branch, checks, review and git, then files, the diff, and details', () => {
    const view = draw('changes')
    const shown = view.text()
    expect(shown).toContain('⎇ feature/cockpit')
    expect(shown).toContain('4 files +9 −1 · 1 staged · 1 untracked · git 10s ago')
    expect(shown).toContain('Checks ✓ Type check · ✗ npm test · ◌ Lint')
    expect(shown).toContain('Review ⚑ 2 findings · 1 confirmed')
    expect(shown).toContain('PR #12 created · 10s ago')
    expect(shown).toContain('  A src/staged.ts ++++++++++     +8 −0')
    expect(shown).toContain(' ✎2 ⚑1 ')
    expect(shown).toContain('+1 −1 · edited 2× by External work')
    expect(shown).toContain('⚑ L1 Missing return value · CONFIRMED')
    expect(shown).toContain('✗ npm test 3 failed · 6.2s · 15s ago')
    expect(shown).toContain('Finding on an unchanged file')
    expect(shown).toContain('committed abcdef01 on feature/cockpit')
    expect(elementsOf(view.tree(), 'Code')[0]?.props.format).toBe('diff')
    expect(elementsOf(view.tree(), 'Link')[0]?.props.href).toBe('https://example.test/pull/12')
  })

  test('buttons refresh, copy the path or the patch, quote, and select; a file without a patch says why', async () => {
    const view = draw('changes')
    expect(view.text()).toContain('Copy path  Copy patch  Quote patch')
    await view.press('changes:refresh')
    await view.press('changes:copy-path')
    await view.press('changes:copy')
    await view.press('changes:quote')
    await view.press('changes:select:src/edited.ts')
    expect(view.text()).toContain('Patch omitted: no complete hunk fits the capture limit.')
    expect(view.has('changes:copy')).toBe(false)
    expect(view.has('changes:copy-path')).toBe(true)
    await view.press('changes:select:src/new.ts')
    expect(view.text()).toContain('Untracked file: Git shows no patch until it is added.')
    await view.press('changes:copy-path')
    expect(view.calls).toEqual([
      'refresh:changes', 'path:src/view.ts', 'copy:src/view.ts', 'quote:src/view.ts', 'file:src/edited.ts', 'file:src/new.ts', 'path:src/new.ts',
    ])
  })
})

describe('context view', () => {
  test('estimates, cost per turn, and compaction lines', () => {
    const ranked = rankedEstimates(breakdown())
    expect(ranked.memory[0]?.label).toBe('/user/CLAUDE.md')
    expect(ranked.mcp[0]).toEqual({ label: 'first', tokens: 1000, detail: '1/2 loaded; 900 deferred' })
    expect(ranked.skills[0]?.label).toBe('large')
    expect(costPerTurn([{ at: 0, usd: 1 }, { at: 1, usd: 1.5 }, { at: 2, usd: 1.75 }])).toEqual([0.5, 0.25])
    expect(costPerTurn([{ at: 0, usd: 3 }])).toEqual([])
    expect(compactionLine({ at: 0, trigger: 'auto', tokensBefore: 150000, tokensAfter: 20000 }, 1000)).toBe('auto · 150k → 20k (−87%) · 1.0s ago')
    expect(compactionLine({ at: 500, trigger: 'manual', skipped: 'Blocked.' }, 1000)).toBe('manual · skipped: Blocked. · 0.5s ago')
  })

  test('the gauge scales the categories to the live fill and marks the threshold', () => {
    const cells = contextGauge(breakdown(), 50000, 100000, 89500, 20)
    expect(cells).toHaveLength(20)
    expect(cells.filter(cell => cell.glyph === '█')).toHaveLength(10)
    expect(cells[18]?.glyph).toBe('┃')
    expect(cells[19]?.glyph).toBe('░')
    expect(contextGauge(undefined, 25000, 100000, undefined, 8).map(cell => cell.glyph).join('')).toBe('██──────')
    expect(contextGauge(undefined, undefined, undefined, undefined, 8)).toEqual([])
  })

  test('shows the fill, headroom, trend, categories, tokens, cost, limits, and compactions', async () => {
    const view = draw('context')
    const shown = view.text()
    expect(shown).toContain('test-model · 100k window')
    expect(shown).toContain('60,000 tokens · 60% of 100k')
    expect(shown).toContain('30k left before auto-compact at 90k')
    expect(shown).toContain('Trend ▃▆█ +20k per response · ~1.5 responses to compact')
    expect(shown).toContain('Deferred tools*')
    expect(shown).toMatch(/Last turn +20 +12 +80 +10 +73%/)
    expect(shown).toContain('$1.75')
    expect(shown).toContain('Last turn $0.25 · avg')
    expect(shown).toMatch(/five hour +42% .* resets in 2h/)
    expect(shown).toMatch(/seven day +95% .* reset unknown/)
    expect(shown).toContain('user/CLAUDE.md 900')
    expect(shown).toContain('2/4 listed')
    expect(shown).toContain('auto · 150k → 20k (−87%) · 55s ago')
    expect(shown).toContain('manual · skipped: Blocked. · 52s ago')
    await view.press('context:refresh')
    expect(view.calls).toEqual(['refresh:context'])
  })
})

describe('activity view', () => {
  test('the cat says what runs, and the timeline and budget explain the session', async () => {
    const view = draw('activity')
    const shown = view.text()
    expect(shown).toContain('running tools')
    expect(shown).toContain('Bash npm · 12s +1')
    expect(shown).toMatch(/[\u2801-\u28ff]{3}/)
    expect(shown).toContain('2 tools · 2 agents · turn 10s')
    expect(shown).toMatch(/main +/)
    expect(shown).toContain('Coordinator'.slice(0, 5))
    expect(shown).toContain('█ tool  ▒ model  ▓ agent  █ approval  █ error')
    expect(shown).toContain('1m 0s · main busy 40.0s (67%)')
    expect(shown).toContain('2 prompts · 2.5s waiting on you')
    await view.press('activity:span')
    await view.press('activity:animation')
    expect(view.text()).toContain('paused')
    expect(view.calls).toEqual(['span', 'animation'])
  })

  test('bounded windows keep the selected item reachable at each end', () => {
    const items = Array.from({ length: 100 }, (_, index) => index)
    expect(visibleWindow(items, 0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(visibleWindow(items, 99, 8)).toEqual([92, 93, 94, 95, 96, 97, 98, 99])
    expect(visibleWindow(items, 51, 8)).toContain(51)
    expect(visibleWindow([], -1, 8)).toEqual([])
  })
})

describe('header tabs', () => {
  const tabs = [
    { label: 'Agents', badge: '2▸' }, { label: 'Tools', badge: '3▸' }, { label: 'Changes', badge: '4' },
    { label: 'Context', badge: '64%' }, { label: 'Activity' },
  ]

  test('tabs keep three columns apart, give up badges before spacing, and wrap in order', () => {
    expect(tabRows(tabs, 79)).toEqual({ rows: [[0, 1, 2, 3, 4]], badges: true, gap: 3 })
    expect(tabRows(tabs, 60)).toEqual({ rows: [[0, 1, 2, 3, 4]], badges: false, gap: 3 })
    expect(tabRows(tabs, 56)).toEqual({ rows: [[0, 1, 2, 3, 4]], badges: false, gap: 2 })
    expect(tabRows(tabs, 55)).toEqual({ rows: [[0, 1, 2], [3, 4]], badges: true, gap: 3 })
    expect(tabRows(tabs, 30)).toEqual({ rows: [[0, 1], [2, 3], [4]], badges: true, gap: 3 })
    expect(tabRows(tabs, 24)).toEqual({ rows: [[0, 1], [2, 3], [4]], badges: false, gap: 3 })
    for (const columns of [12, 30, 44, 55, 80, 200]) {
      const { rows } = tabRows(tabs, columns)
      expect(rows.flat()).toEqual([0, 1, 2, 3, 4])
    }
  })

  test('the mark sits under the active tab, and only on its row', () => {
    expect(tabMark(tabs, [0, 1, 2], 1, true, 3)).toEqual([{ text: ' '.repeat(15) }, { text: '▔'.repeat(11), color: 'suggestion' }])
    expect(tabMark(tabs, [3, 4], 4, true, 3)).toEqual([{ text: ' '.repeat(17) }, { text: '▔'.repeat(11), color: 'suggestion' }])
    expect(tabMark(tabs, [0, 1, 2], 4, true, 3)).toBeUndefined()
  })
})

describe('pane footer', () => {
  test('the footer names the resize keys for the placement and keeps focus and resize when narrow', () => {
    expect(paneFooter('terminal', 'dock', 120)).toBe('Read-only · 1–5 views · Ctrl+X Tab focus · Ctrl+X ←/→ resize · Esc close')
    expect(paneFooter('terminal', 'inline', 120)).toBe('Read-only · 1–5 views · Ctrl+X Tab focus · Ctrl+X ↑/↓ resize · Esc close')
    expect(paneFooter('terminal', 'dock', 64)).toBe('1–5 views · Ctrl+X Tab focus · Ctrl+X ←/→ resize · Esc close')
    expect(paneFooter('terminal', 'dock', 56)).toBe('1–5 views · Ctrl+X Tab focus · Ctrl+X ←/→ resize')
    expect(paneFooter('terminal', 'dock', 40)).toBe('Ctrl+X Tab focus · Ctrl+X ←/→ resize')
    expect(paneFooter('terminal', 'dock', 20)).toBe('Ctrl+X Tab focus')
    expect(paneFooter('terminal', 'dock', 10)).toBe('Ctrl+X Ta…')
    expect(paneFooter('desktop', 'dock', 120)).toBe('Read-only')
  })
})
