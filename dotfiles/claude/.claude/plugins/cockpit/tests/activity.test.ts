import { describe, expect, test } from 'claude-code/testing'
import type { CockpitActivity } from '../types'
import {
  activityHistory, activityLoad, bongoCat, catColumns, catHead, catPose, catSays, LANE, timeBudget, timelineLanes, timelineScale,
} from '../hooks/activity'
import { sparkline } from '../hooks/layout'
import { initialActivity, initialContext } from '../hooks/state'
import { colors } from '../hooks/theme'
import { agent, themeKeys, tool } from './kit'

describe('Bongo Cat', () => {
  test('the pose acts out the phase, and more work drums faster', () => {
    expect([0, 1, 2, 3].map(frame => catPose('idle', frame, 0))).toEqual(['rest', 'rest', 'rest', 'rest'])
    expect([0, 1].map(frame => catPose('error', frame, 0))).toEqual(['up', 'up'])
    expect([0, 1, 2, 3].map(frame => catPose('thinking', frame, 0))).toEqual(['right', 'up', 'up', 'up'])
    expect([0, 1, 2, 3].map(frame => catPose('tools', frame, 1))).toEqual(['left', 'up', 'right', 'up'])
    expect([0, 1].map(frame => catPose('tools', frame, 2))).toEqual(['left', 'right'])
    expect([0, 1].map(frame => catPose('tools', frame, 3))).toEqual(['both', 'up'])
  })

  test('every frame keeps its size, uses theme keys, and draws in braille', () => {
    for (const [columns, rows] of [[40, 11], [34, 10], [28, 8]] as const) {
      for (const phase of ['idle', 'thinking', 'tools', 'error'] as const) {
        for (const frame of [0, 1, 2, 3, 7, Number.NaN]) {
          const grid = bongoCat(phase, frame, 3, columns)
          expect(grid).toHaveLength(rows)
          expect(grid.every(row => row.length === columns)).toBe(true)
          for (const glyph of grid.flat()) {
            if (glyph.color !== undefined) expect(themeKeys.has(glyph.color)).toBe(true)
            expect(glyph.char).toMatch(/^[ \u2801-\u28ff zZ!?]$/)
          }
        }
      }
    }
    expect(bongoCat('tools', 0, 1, Number.NaN)).toHaveLength(11)
  })

  test('the cat sizes to the pane, and the bubble points at its head', () => {
    expect([80, 44, 43, 36, 35, 24, 10].map(catColumns)).toEqual([40, 40, 34, 34, 28, 24, 20])
    expect(catHead(40)).toBe(24)
    expect(catHead(28)).toBe(16)
  })

  test('like the original, the table edge falls to the right in front of two bongos', () => {
    const grid = bongoCat('tools', 1, 1)
    const cells = (color: string) => grid.flatMap((row, index) => row.flatMap((glyph, column) => glyph.color === color ? [{ row: index, column }] : []))
    const table = cells(colors.muted)
    const leftEdge = table.reduce((best, cell) => cell.column < best.column ? cell : best)
    const rightEdge = table.reduce((best, cell) => cell.column > best.column ? cell : best)
    expect(leftEdge.column).toBe(0)
    expect(rightEdge.column).toBe(39)
    expect(rightEdge.row - leftEdge.row).toBeGreaterThanOrEqual(3)
    const drums = cells(colors.yellow)
    expect(drums.some(cell => cell.column < 16)).toBe(true)
    expect(drums.some(cell => cell.column > 17 && cell.column < 28)).toBe(true)
    expect(grid[0]?.some(glyph => glyph.char !== ' ')).toBe(true)
  })

  test('a raised paw shows its toe beans and a hit shows impact lines on that side', () => {
    const sides = (phase: 'idle' | 'thinking' | 'tools' | 'error', frame: number, load: number, color: string) => {
      const found = bongoCat(phase, frame, load).flatMap(row => row.flatMap((glyph, column) => glyph.color === color ? [column] : []))
      return [found.some(column => column < 17), found.some(column => column >= 17)]
    }
    expect(sides('tools', 1, 1, colors.magenta)).toEqual([true, true])
    expect(sides('tools', 1, 1, colors.accent)).toEqual([false, false])
    expect(sides('tools', 0, 1, colors.accent)).toEqual([true, false])
    expect(sides('tools', 0, 1, colors.magenta)).toEqual([false, true])
    expect(sides('tools', 2, 1, colors.accent)).toEqual([false, true])
    expect(sides('tools', 0, 3, colors.accent)).toEqual([true, true])
    expect(sides('tools', 0, 3, colors.magenta)).toEqual([false, false])
  })

  test('it sleeps on the drums when idle and startles at an error', () => {
    const asleep = bongoCat('idle', 0, 0).flat()
    expect(asleep.map(glyph => glyph.char).join('')).toContain('z')
    expect(asleep.some(glyph => glyph.char === 'Z')).toBe(true)
    expect(asleep.some(glyph => glyph.color === colors.accent || glyph.color === colors.magenta)).toBe(false)
    expect(bongoCat('idle', 0, 0)).not.toEqual(bongoCat('idle', 2, 0))
    const startled = bongoCat('error', 0, 0).flat()
    expect(startled.find(glyph => glyph.char === '!')?.color).toBe(colors.red)
    expect(startled.filter(glyph => glyph.color === colors.red).length).toBeGreaterThan(1)
    expect(bongoCat('thinking', 4, 0).flat().find(glyph => glyph.char === '?')?.color).toBe(colors.cyan)
    expect(bongoCat('tools', 0, 1)).not.toEqual(bongoCat('tools', 2, 1))
  })

  test('the bubble names the lead call, the thought, the stop, or the nap', () => {
    const base = initialActivity()
    const busy: CockpitActivity = {
      ...base, working: true,
      tools: [tool('sub', { agentId: 'a', tool: 'Grep', startedAt: 9000 }), tool('own', { tool: 'Bash', target: 'npm', startedAt: 4000 })],
    }
    expect(catSays(busy, 16000)).toEqual({ text: 'Bash npm · 12s +1', color: colors.cyan })
    expect(catSays({ ...base, working: true, turnStartedAt: 1000 }, 3000).text).toBe('thinking · 2.0s')
    expect(catSays({ ...base, stopFailure: { error: 'overloaded', at: 1 } }, 2).text).toBe('stopped: overloaded')
    expect(catSays({ ...base, turns: [{ id: 't', durationMs: 1, reason: 'answer', finishedAt: 0 }] }, 120000).text).toBe('zzz · idle 2m')
    expect(activityLoad({ ...busy, agents: [agent('a'), agent('b', { status: 'completed' })] })).toBe(3)
  })
})

describe('timeline', () => {
  test('the scale picks a cell size that covers the session or the chosen span', () => {
    expect(timelineScale('fit', 1000000 - 720000, 1000000, 45)).toEqual({ cellMs: 20000, start: 1000000 - 900000 })
    expect(timelineScale('fit', undefined, 1000000, 60)).toEqual({ cellMs: 1000, start: 1000000 - 60000 })
    expect(timelineScale('5m', 0, 1000000, 50)).toEqual({ cellMs: 10000, start: 1000000 - 500000 })
    expect(timelineScale('60m', 0, 1000000, 40).cellMs).toBe(90000)
  })

  test('lanes show the model, tools, approval, errors, and delegated agents, blank outside a lane', () => {
    const activity: CockpitActivity = {
      ...initialActivity(),
      turns: [{ id: 't', durationMs: 30000, reason: 'answer', finishedAt: 40000 }],
      tools: [
        tool('asked', { tool: 'Bash', startedAt: 20000, finishedAt: 32000, runMs: 2000, outcome: 'success', approval: 'asked' }),
        tool('failed', { tool: 'Bash', startedAt: 50000, finishedAt: 55000, outcome: 'error' }),
        tool('spawn', { tool: 'Agent', startedAt: 60000, finishedAt: 80000, outcome: 'success' }),
        tool('read', { agentId: 'a1', startedAt: 65000, finishedAt: 66000, outcome: 'success' }),
      ],
      agents: [agent('a1', { name: 'Worker', status: 'completed', startedAt: 60000, completedAt: 80000, lastSeenAt: 90000 })],
    }
    const lanes = timelineLanes(activity, 100000, 0, 10000, 10, 6, 15000)
    expect(lanes.map(lane => lane.label)).toEqual(['main', 'Worker'])
    expect(lanes[0]?.cells).toEqual([LANE.absent, LANE.model, LANE.approval, LANE.tool, LANE.idle, LANE.error, LANE.agent, LANE.agent, LANE.idle, LANE.idle])
    expect(lanes[1]?.cells).toEqual([-1, -1, -1, -1, -1, -1, LANE.tool, LANE.model, -1, -1])
  })

  test('the budget splits session time into busy, tools, agents, approval, and concurrency', () => {
    const activity: CockpitActivity = {
      ...initialActivity(),
      working: true, turnStartedAt: 90000,
      turns: [{ id: 't', durationMs: 30000, reason: 'answer', finishedAt: 40000 }],
      tools: [
        tool('asked', { tool: 'Bash', startedAt: 20000, finishedAt: 32000, runMs: 2000, outcome: 'success', approval: 'asked' }),
        tool('failed', { tool: 'Bash', startedAt: 50000, finishedAt: 55000, outcome: 'error' }),
        tool('spawn', { tool: 'Agent', startedAt: 60000, finishedAt: 80000, outcome: 'success' }),
        tool('read', { agentId: 'a1', startedAt: 65000, finishedAt: 66000, outcome: 'success' }),
      ],
      agents: [agent('a1', { status: 'completed', durationMs: 20000 })],
      samples: [{ at: 0, level: 1 }, { at: 10000, level: 3 }, { at: 20000, level: 0 }],
    }
    const context = { ...initialContext(), usage: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }
    expect(timeBudget(activity, context, 100000)).toEqual({
      sessionMs: 100000, busyMs: 40000, toolMs: 8000,
      topTools: [{ tool: 'Bash', ms: 7000 }, { tool: 'Read', ms: 1000 }],
      agentMs: 20000, agents: 1, approvals: 1, approvalMs: 10000,
      peak: 3, average: 2, calls: 4, failures: 1,
    })
  })
})

describe('activity history', () => {
  test('history holds each level until the next sample and keeps the peak of a bucket', () => {
    const samples = [{ at: 0, level: 0 }, { at: 6000, level: 2 }, { at: 7000, level: 1 }, { at: 21000, level: 0 }]
    expect(activityHistory(samples, 24000, 40, 5000)).toEqual([0, 2, 1, 1, 1])
    expect(activityHistory(samples, 24000, 2, 5000)).toEqual([1, 1])
    expect(activityHistory(samples, 40000, 40, 5000)).toEqual([0, 2, 1, 1, 1, 0, 0, 0, 0])
    expect(activityHistory([], 24000, 40)).toEqual([])
  })

  test('sparklines scale to the peak and ignore bad values', () => {
    expect(sparkline([], 40)).toBe('')
    expect(sparkline([0, 1, 2, 4], 40)).toBe('▁▃▅█')
    expect(sparkline([0, Number.NaN, -1], 40)).toBe('▁▁▁')
    expect(sparkline([0, 1, 2, 4], 2)).toHaveLength(2)
  })
})
