import { describe, expect, test } from 'claude-code/testing'
import type { CockpitActivity, CockpitContext, CockpitReview } from '../types'
import { initialActivity, initialContext, initialReview } from '../hooks/state'
import {
  approvalWait, bandSegments, cacheHit, changeTotals, checkResult, contextColor, contextFill, latestCheck, leadTool,
  planProgress, planState, runningTools, sessionStatus, tokenTotals, toolDuration, toolStats, waitDuration,
} from '../hooks/summary'
import { bar, brief, clipStart, colors, compact, duration, shortModel, usd } from '../hooks/theme'
import { agent, breakdown, tool, USAGE } from './kit'

const text = (segments: readonly { text: string }[]): string => segments.map(segment => segment.text).join('')

describe('tool timing', () => {
  test('duration uses elapsed time only for running tools', () => {
    expect(toolDuration(tool('live'), 3500)).toBe(2500)
    expect(toolDuration(tool('done', { outcome: 'success', finishedAt: 1800 }), 3500)).toBe(800)
    expect(toolDuration(tool('unknown', { outcome: 'error' }), 3500)).toBeUndefined()
    expect(toolDuration(tool('clock-skew', { finishedAt: 500 }), 3500)).toBe(0)
    expect(toolDuration(tool('bad-time', { startedAt: NaN }), 3500)).toBeUndefined()
  })

  test('a PostToolUse time replaces the wall time and leaves the wait apart', () => {
    const asked = tool('asked', { outcome: 'success', finishedAt: 16000, runMs: 1200, approval: 'asked' })
    expect(toolDuration(asked, 20000)).toBe(1200)
    expect(waitDuration(asked)).toBe(13800)
    // A running call has no execution time yet: its elapsed time includes the prompt.
    expect(toolDuration(tool('live', { runMs: 50 }), 3500)).toBe(2500)
    expect(waitDuration(tool('live'))).toBeUndefined()
  })

  test('per-tool statistics rank by total time and count failures and denials', () => {
    const stats = toolStats([
      tool('r1', { outcome: 'success', finishedAt: 1100 }),
      tool('r2', { outcome: 'success', finishedAt: 1100 }),
      tool('b1', { tool: 'Bash', outcome: 'error', finishedAt: 9000, runMs: 5000 }),
      tool('b2', { tool: 'Bash', outcome: 'denied', finishedAt: 2000 }),
    ], 10000)
    expect(stats).toEqual([
      { tool: 'Bash', calls: 2, failures: 2, totalMs: 6000, maxMs: 5000 },
      { tool: 'Read', calls: 2, failures: 0, totalMs: 200, maxMs: 100 },
    ])
  })

  test('approval wait counts asked calls and sums only measured waits', () => {
    expect(approvalWait([
      tool('a', { outcome: 'success', finishedAt: 5000, runMs: 1000, approval: 'asked' }),
      tool('b', { approval: 'asked' }),
      tool('c', { outcome: 'success', finishedAt: 2000, runMs: 500 }),
    ])).toEqual({ asked: 2, totalMs: 3000, measured: 1 })
  })
})

describe('session status', () => {
  const running = [
    tool('sub', { agentId: 'a', tool: 'Grep', startedAt: 5000 }),
    tool('spawn', { tool: 'Agent', target: 'Fix', startedAt: 1000 }),
    tool('own', { tool: 'Bash', target: 'npm', startedAt: 3000 }),
  ]

  test('the main thread leads: its own call, then the agent it waits on, then any call', () => {
    expect(runningTools({ ...initialActivity(), tools: running }).map(item => item.id)).toEqual(['sub', 'own', 'spawn'])
    expect(leadTool(runningTools({ ...initialActivity(), tools: running }))?.id).toBe('own')
    expect(leadTool(running.filter(item => item.id !== 'own'))?.id).toBe('spawn')
    expect(leadTool(running.filter(item => item.id === 'sub'))?.id).toBe('sub')
  })

  test('reports the lead call, a thinking turn, a stop failure, an error, or idle', () => {
    const base = initialActivity()
    expect(sessionStatus({ ...base, tools: running }, true)).toEqual({ glyph: '▸', label: 'Bash npm +2', color: colors.cyan, since: 3000 })
    expect(sessionStatus({ ...base, turnStartedAt: 2000 }, true)).toEqual({ glyph: '▸', label: 'thinking', color: colors.cyan, since: 2000 })
    const failed: CockpitActivity = { ...base, stopFailure: { error: 'rate_limit', at: 1 } }
    expect(sessionStatus(failed, false)).toMatchObject({ label: 'stopped: rate limit', color: colors.red })
    expect(sessionStatus(failed, true).label).toBe('thinking')
    expect(sessionStatus({ ...base, phase: 'error' }, false).label).toBe('last turn failed')
    expect(sessionStatus(base, false)).toEqual({ glyph: '○', label: 'idle', color: colors.muted })
  })
})

describe('plan', () => {
  test('todos lead, tasks follow, and the item in progress is named', () => {
    const todos = [{ items: [
      { content: 'Read', status: 'completed' as const, activeForm: 'Reading' },
      { content: 'Write', status: 'in_progress' as const, activeForm: 'Writing' },
      { content: 'Test', status: 'pending' as const, activeForm: 'Testing' },
    ], updatedAt: 1 }]
    expect(planState({ todos, tasks: [] })).toEqual({ done: 1, total: 3, current: 'Writing', noun: 'todos' })
    expect(planProgress({ todos: [], tasks: [{ id: '1', subject: 'Ship', status: 'completed' }] })).toBe('1/1 tasks')
    expect(planState({ todos: [{ agentId: 'child', items: todos[0]!.items, updatedAt: 1 }], tasks: [] })).toBeUndefined()
  })
})

describe('the band', () => {
  const activity: CockpitActivity = {
    ...initialActivity(),
    working: true, turnStartedAt: 1000,
    tools: [tool('own', { tool: 'Bash', target: 'npm', startedAt: 3000 })],
    agents: [agent('worker')],
    todos: [{ items: [
      { content: 'Read', status: 'completed', activeForm: 'Reading' },
      { content: 'Write', status: 'in_progress', activeForm: 'Writing tests' },
      { content: 'Test', status: 'pending', activeForm: 'Testing' },
    ], updatedAt: 1 }],
    background: [{ id: 'b1', type: 'shell', status: 'running', description: 'Watch', updatedAt: 1 }],
  }
  const review: CockpitReview = {
    ...initialReview(),
    changes: [
      { path: 'a.ts', patch: '', additions: 4, deletions: 1, source: 'git', updatedAt: 1 },
      { path: 'b.ts', patch: '', additions: 1, deletions: 0, source: 'observed', updatedAt: 1 },
    ],
    checks: [{ id: 'c', label: 'npm test', status: 'failed', failed: 2, finishedAt: 4000 }],
  }
  const context: CockpitContext = {
    ...initialContext(),
    usage: { startedAt: 0, context: { window: 200000, tokens: 128000, percent: 64 }, rateLimits: [], cost: { usd: 1.5 } },
  }

  test('a wide band shows every part in priority order', () => {
    expect(text(bandSegments(activity, review, context, { isWorking: true, columns: 200, now: 15000 })))
      .toBe('▸ Bash npm 12s · 1/3 Writing tests · 1 agent · ctx 64% · ✗ npm test 2 failed · 2 files +5 −1 · $1.50 · 1 bg')
  })

  test('a narrow band shortens parts, drops the lowest, and restores what fits', () => {
    expect(text(bandSegments(activity, review, context, { isWorking: true, columns: 40, now: 15000 })))
      .toBe('▸ Bash npm 12s · 1/3 · 1 agent · ctx 64%')
    expect(text(bandSegments(activity, review, context, { isWorking: true, columns: 8, now: 15000 }))).toBe('▸ Bash …')
  })

  test('an idle band names the last turn, and a stop failure leads in red', () => {
    const idle = { ...initialActivity(), turns: [{ id: 't', durationMs: 65000, reason: 'answer', finishedAt: 1 }] }
    expect(text(bandSegments(idle, initialReview(), initialContext(), { isWorking: false, columns: 80, now: 2 }))).toBe('○ idle · last turn 1m')
    const failed = bandSegments({ ...idle, stopFailure: { error: 'rate_limit', at: 1 } }, initialReview(), initialContext(), { isWorking: false, columns: 80, now: 2 })
    expect(failed[0]).toEqual({ text: '✗ stopped: rate limit', color: colors.red })
  })
})

describe('context fill', () => {
  const measured = (tokens: number, percent: number, fills: number[], enabled = true): CockpitContext => ({
    ...initialContext(),
    usage: {
      startedAt: 0, rateLimits: [],
      context: { window: 200000, tokens, percent, breakdown: breakdown({ isAutoCompactEnabled: enabled, autoCompactThreshold: 167000 }) },
    },
    fills: fills.map((value, index) => ({ at: index, tokens: value })),
  })

  test('headroom runs to the auto-compact threshold and growth skips compactions', () => {
    const fill = contextFill(measured(150000, 75, [100000, 120000, 30000, 60000, 90000]))
    expect(fill).toMatchObject({ tokens: 150000, window: 200000, threshold: 167000, headroom: 17000 })
    expect(Math.abs((fill.growth ?? Number.NaN) - (80000 / 3))).toBeLessThan(1e-6)
    expect(Math.abs((fill.responsesLeft ?? Number.NaN) - (17000 / (80000 / 3)))).toBeLessThan(1e-6)
    expect(contextFill(measured(150000, 75, [], false))).toMatchObject({ threshold: undefined, headroom: undefined, responsesLeft: undefined })
    expect(contextFill(initialContext())).toEqual({ tokens: undefined, window: undefined, percent: undefined, threshold: undefined, headroom: undefined, growth: undefined, responsesLeft: undefined })
  })

  test('the warning color starts ten points before the threshold, or at 70% without one', () => {
    expect(contextColor(contextFill(measured(100000, 50, [])))).toBe(colors.muted)
    expect(contextColor(contextFill(measured(150000, 75, [])))).toBe(colors.yellow)
    expect(contextColor(contextFill(measured(170000, 85, [])))).toBe(colors.red)
    expect(contextColor({ percent: 72 })).toBe(colors.yellow)
    expect(contextColor({ percent: 81 })).toBe(colors.red)
    expect(contextColor({})).toBe(colors.muted)
  })
})

describe('changes, checks, and tokens', () => {
  test('change totals count files, lines, staged, and untracked', () => {
    expect(changeTotals({ ...initialReview(), changes: [
      { path: 'a', patch: '', additions: 3, deletions: 1, source: 'git', staged: true, updatedAt: 1 },
      { path: 'b', patch: '', additions: 0, deletions: 0, source: 'git', untracked: true, updatedAt: 1 },
    ] })).toEqual({ files: 2, additions: 3, deletions: 1, staged: 1, untracked: 1 })
  })

  test('the latest check is a running one, else the last to finish', () => {
    const checks = [
      { id: '1', label: 'old', status: 'passed' as const, passed: 3, finishedAt: 5 },
      { id: '2', label: 'new', status: 'failed' as const, failed: 2, finishedAt: 9 },
    ]
    expect(latestCheck({ ...initialReview(), checks })?.label).toBe('new')
    expect(latestCheck({ ...initialReview(), checks: [...checks, { id: '3', label: 'live', status: 'running' }] })?.label).toBe('live')
    expect(checks.map(checkResult)).toEqual(['3 passed', '2 failed'])
    expect(checkResult({ id: '4', label: 'x', status: 'completed' })).toBe('completed')
  })

  test('cache hit is the share of prompt tokens read from the cache', () => {
    const totals = tokenTotals([USAGE, undefined, USAGE])
    expect(totals).toEqual({ input: 40, output: 24, cacheRead: 160, cacheWrite: 20 })
    expect(Math.abs((cacheHit(totals) ?? Number.NaN) - (160 / 220 * 100))).toBeLessThan(1e-6)
    expect(cacheHit(tokenTotals([]))).toBeUndefined()
  })
})

describe('formatting', () => {
  test('numbers, times, money, and model names read compactly', () => {
    expect([950, 1234, 61234, 1400000, undefined].map(value => compact(value))).toEqual(['950', '1.2k', '61k', '1.4M', '?'])
    expect([1500, 45000, 540000, 7200000, 3 * 86400000].map(brief)).toEqual(['1.5s', '45s', '9m', '2h', '3d'])
    expect(duration(3900000)).toBe('1h 5m')
    expect([3.8421, 0.81, 0.0042, 0].map(usd)).toEqual(['$3.84', '$0.81', '$0.0042', '$0.00'])
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
    expect(shortModel('claude-opus-5-5[1m]')).toBe('opus-5-5')
  })

  test('paths keep their end and bars fill in eighths', () => {
    expect(clipStart('src/auth/refresh.ts', 10)).toBe('…efresh.ts')
    expect(clipStart('short.ts', 10)).toBe('short.ts')
    expect(bar(0.5, 4)).toBe('██')
    expect(bar(1 / 16, 4)).toBe('▎')
    expect(bar(Number.NaN, 4)).toBe('')
  })
})
