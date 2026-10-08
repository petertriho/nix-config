import type { RenderElement } from 'claude-code'
import type { CockpitBackgroundTask, CockpitTool, CockpitViewProps } from '../types'
import { actorName, agentName } from './agents'
import { actions, card, field, heading, line, listLimit, muted, neighboringIndex, section, spread, viewWidth, visibleWindow } from './layout'
import type { Segment } from './summary'
import { approvalWait, runningTools, toolDuration, toolLabel, toolStats, waitDuration } from './summary'
import type { CockpitElements } from './theme'
import { ago, bar, brief, clip, colors, duration, padEnd, padStart, plural, statusColor, statusGlyph } from './theme'

const outcomeColor = (tool: CockpitTool) =>
  tool.outcome === 'running' && tool.approval === 'asked' ? colors.yellow : statusColor(tool.outcome)

const failed = (tool: CockpitTool): boolean => tool.outcome === 'error' || tool.outcome === 'denied'

const summary = (ui: CockpitElements, props: CockpitViewProps, tools: readonly CockpitTool[], width: number): RenderElement => {
  const running = tools.filter(tool => tool.outcome === 'running').length
  const failures = tools.filter(failed).length
  const ran = tools.filter(tool => tool.tool !== 'Agent').reduce((total, tool) => total + (toolDuration(tool, props.now) ?? 0), 0)
  const wait = approvalWait(tools)
  return section(ui, 'tools:summary', [
    heading(ui, 'tools:title', 'Tools', [
      { text: plural(tools.length, 'call'), color: colors.muted },
      { text: running > 0 ? ` · ${running} running` : '', color: colors.cyan },
      { text: failures > 0 ? ` · ${failures} failed` : '', color: colors.red },
    ], width),
    line(ui, 'tools:time', [
      { text: 'Tool time ', color: colors.muted }, { text: duration(ran) },
      ...(wait.asked > 0 ? [
        { text: ' · ', color: colors.muted },
        { text: `${plural(wait.asked, 'approval')}`, color: colors.yellow },
        { text: wait.measured > 0 ? ` · ${duration(wait.totalMs)} waiting on you` : '', color: colors.yellow },
      ] : []),
    ], true),
  ])
}

const runningSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const running = runningTools(props.activity)
  if (running.length === 0) return null
  return section(ui, 'tools:running', [
    heading(ui, 'tools:running:title', 'Running now', [{ text: `${running.length}`, color: colors.cyan }], width),
    ...running.slice(0, 6).map(tool => {
      const actor = clip(actorName(props, tool.agentId), 14)
      const elapsed = brief(props.now - tool.startedAt)
      return spread(ui, `tools:running:${tool.id}`, line(ui, `tools:running:${tool.id}:label`, [
        { text: tool.approval === 'asked' ? '? ' : '▸ ', color: outcomeColor(tool) },
        { text: clip(toolLabel(tool), width - actor.length - elapsed.length - 6), bold: true },
      ]), [
        { text: `${actor} `, color: colors.magenta },
        { text: elapsed, color: tool.approval === 'asked' ? colors.yellow : colors.cyan },
      ])
    }),
    running.some(tool => tool.approval === 'asked') ? muted(ui, 'tools:running:approval', '? asked for approval: the time includes the prompt.') : null,
  ])
}

const statsSection = (ui: CockpitElements, props: CockpitViewProps, tools: readonly CockpitTool[], width: number): RenderElement | null => {
  const stats = toolStats(tools, props.now)
  if (stats.length === 0) return null
  const nameWidth = Math.min(16, Math.max(8, ...stats.map(stat => stat.tool.length)))
  const fixed = nameWidth + 6 + 5 + 7
  const barWidth = Math.max(0, width - fixed - 1)
  // A subagent's run would dwarf every tool, so Agent calls get no bar.
  const longest = Math.max(1, ...stats.filter(stat => stat.tool !== 'Agent').map(stat => stat.totalMs))
  return section(ui, 'tools:stats', [
    heading(ui, 'tools:stats:title', 'By tool', [{ text: 'where the time goes', color: colors.muted }], width),
    line(ui, 'tools:stats:columns', [{ text: `${padEnd('', nameWidth)}${padStart('calls', 6)}${padStart('fail', 5)}${padStart('time', 7)}`, color: colors.muted }]),
    ...stats.slice(0, 8).map(stat => line(ui, `tools:stat:${stat.tool}`, [
      { text: padEnd(clip(stat.tool, nameWidth), nameWidth), color: stat.tool === 'Agent' ? colors.magenta : undefined },
      { text: padStart(`${stat.calls}`, 6), color: colors.muted },
      { text: padStart(stat.failures > 0 ? `${stat.failures}` : '·', 5), color: stat.failures > 0 ? colors.red : colors.muted },
      { text: padStart(brief(stat.totalMs), 7) },
      { text: barWidth > 0 && stat.tool !== 'Agent' ? ` ${bar(Math.min(1, stat.totalMs / longest), barWidth)}` : '', color: colors.cyan },
    ])),
    stats.length > 8 ? muted(ui, 'tools:stats:more', `${stats.length - 8} more tools`) : null,
  ])
}

const filterRow = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const { Box, Button } = ui
  const agents = props.activity.agents
  if (agents.length === 0) return null
  const setFilter = async (id: string | null): Promise<void> => {
    await props.actions.selectAgent(id)
    await props.actions.selectTool(null)
  }
  const index = agents.findIndex(agent => agent.id === props.activity.selectedAgent)
  const shown = visibleWindow(agents, index, 3)
  return (
    <Box key="tools:filters" flexDirection="row" flexWrap="wrap" columnGap={2}>
      <Button key="tools:filter:all" plain dimColor={props.activity.selectedAgent !== null} label={`${props.activity.selectedAgent === null ? '● ' : ''}All`} onPress={() => setFilter(null)} />
      {shown.map(agent => (
        <Button key={`tools:filter:${agent.id}`} plain dimColor={agent.id !== props.activity.selectedAgent}
          label={`${agent.id === props.activity.selectedAgent ? '● ' : ''}${clip(agentName(agent), Math.min(18, width - 8))}`}
          onPress={() => setFilter(agent.id)} />
      ))}
      {agents.length > shown.length && <Button key="tools:filter:next" plain dimColor label="more ›" onPress={() => {
        const next = agents[index < 0 ? 0 : neighboringIndex(agents.length, index, 1)]
        return next ? setFilter(next.id) : Promise.resolve()
      }} />}
    </Box>
  )
}

const recentSection = (
  ui: CockpitElements, props: CockpitViewProps, filtered: readonly CockpitTool[], selected: CockpitTool | undefined, width: number,
): RenderElement => {
  const { Box, Button, Text } = ui
  const selectedIndex = Math.max(0, filtered.findIndex(tool => tool.id === selected?.id))
  const visible = visibleWindow(filtered, selectedIndex, Math.min(12, listLimit(props)))
  const showActor = props.activity.selectedAgent === null
  const chooseNeighbor = (direction: number): Promise<void> => {
    const next = filtered[neighboringIndex(filtered.length, selectedIndex, direction)]
    return next ? props.actions.selectTool(next.id) : Promise.resolve()
  }
  return section(ui, 'tools:recent', [
    heading(ui, 'tools:recent:title', 'Calls', [
      { text: props.activity.selectedAgent === null ? 'all actors' : clip(actorName(props, props.activity.selectedAgent), 24), color: colors.magenta },
      { text: ' · newest first', color: colors.muted },
    ], width),
    filterRow(ui, props, width),
    filtered.length === 0 ? muted(ui, 'tools:recent:empty', 'No tool calls for this filter yet.') : null,
    ...visible.map(tool => {
      const elapsed = toolDuration(tool, props.now)
      const actor = showActor && tool.agentId ? clip(actorName(props, tool.agentId), 10) : ''
      const right: Segment[] = [
        { text: actor ? `${actor} ` : '', color: colors.magenta },
        { text: padStart(elapsed === undefined ? '?' : brief(elapsed), 5), color: tool.outcome === 'running' ? colors.cyan : colors.muted },
        { text: padStart(tool.outcome === 'running' ? '' : ago(props.now, tool.startedAt).replace(' ago', ''), 5), color: colors.muted },
      ]
      const rightWidth = right.reduce((total, segment) => total + [...segment.text].length, 0)
      return spread(ui, `tools:row:${tool.id}`, (
        <Box flexDirection="row">
          <Text color={tool.id === selected?.id ? colors.accent : colors.muted}>{tool.id === selected?.id ? '› ' : '  '}</Text>
          <Text color={outcomeColor(tool)}>{statusGlyph(tool.outcome)} </Text>
          <Text color={colors.yellow}>{tool.approval === 'asked' ? '? ' : ''}</Text>
          <Button key={`tools:select:${tool.id}`} plain label={clip(toolLabel(tool), Math.max(8, width - rightWidth - 6))} onPress={() => props.actions.selectTool(tool.id)} />
        </Box>
      ), right)
    }),
    filtered.length > visible.length ? muted(ui, 'tools:recent:more', `Showing ${visible.length} of ${filtered.length}.`) : null,
    filtered.length > 1 ? actions(ui, 'tools:recent:actions', [
      { key: 'tools:prev', label: 'Newer', hotkey: 'k', onPress: () => chooseNeighbor(-1) },
      { key: 'tools:next', label: 'Older', hotkey: 'j', onPress: () => chooseNeighbor(1) },
    ]) : null,
  ])
}

const toolDetail = (ui: CockpitElements, props: CockpitViewProps, tool: CockpitTool, width: number): RenderElement => {
  const elapsed = toolDuration(tool, props.now)
  const wait = waitDuration(tool)
  const inner = width - 4
  return card(ui, `tools:detail:${tool.id}`, [
    spread(ui, 'tools:detail:title', line(ui, 'tools:detail:name', [
      { text: `${statusGlyph(tool.outcome)} `, color: outcomeColor(tool) },
      { text: clip(tool.tool, inner - 14), bold: true },
    ]), [{ text: tool.outcome, color: outcomeColor(tool) }]),
    field(ui, 'tools:detail:actor', 'Actor', [{ text: actorName(props, tool.agentId), color: tool.agentId ? colors.magenta : undefined }]),
    tool.target ? field(ui, 'tools:detail:target', 'Target', [{ text: clip(tool.target, 240) }]) : null,
    field(ui, 'tools:detail:started', 'Started', [{ text: ago(props.now, tool.startedAt) }]),
    field(ui, 'tools:detail:time', tool.outcome === 'running' ? 'Elapsed' : tool.runMs !== undefined ? 'Ran' : 'Took', [
      { text: elapsed === undefined ? 'unknown' : duration(elapsed) },
    ]),
    wait !== undefined ? field(ui, 'tools:detail:wait', tool.approval === 'asked' ? 'Approval' : 'Hooks', [
      { text: duration(wait), color: tool.approval === 'asked' ? colors.yellow : colors.muted },
      { text: tool.approval === 'asked' ? ' with hooks' : '', color: colors.muted },
    ]) : tool.approval === 'asked' ? field(ui, 'tools:detail:asked', 'Approval', [{ text: 'asked', color: colors.yellow }]) : null,
    tool.retrospective ? muted(ui, 'tools:detail:server', 'Server tool, reported after the response.') : null,
  ])
}

const backgroundColor = (task: CockpitBackgroundTask) =>
  task.endedAt !== undefined ? colors.muted : statusColor(task.status === 'pending' ? 'pending' : 'running')

const backgroundSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const tasks = props.activity.background
  const crons = props.activity.crons
  if (tasks.length === 0 && crons.length === 0) return null
  const live = tasks.filter(task => task.endedAt === undefined)
  // In-flight work first, then the most recently ended.
  const shown = [...live, ...tasks.filter(task => task.endedAt !== undefined).reverse()].slice(0, 6)
  return section(ui, 'tools:background', [
    heading(ui, 'tools:background:title', 'Background', [
      { text: `${live.length} running`, color: live.length > 0 ? colors.cyan : colors.muted },
      { text: props.activity.backgroundAt === null ? '' : ` · ${ago(props.now, props.activity.backgroundAt)}`, color: colors.muted },
    ], width),
    ...shown.map(task => {
      const time = task.startedAt === undefined ? '' : brief((task.endedAt ?? props.now) - task.startedAt)
      const right: Segment[] = [
        { text: `${clip(task.type.replace(/^local_/, ''), 10)} `, color: colors.muted },
        { text: padStart(time, 4), color: colors.muted },
      ]
      return spread(ui, `tools:background:${task.id}`, line(ui, `tools:background:${task.id}:label`, [
        { text: task.endedAt === undefined ? '● ' : '○ ', color: backgroundColor(task) },
        { text: clip(task.description, width - 20), color: task.endedAt === undefined ? undefined : colors.muted },
        { text: task.endedAt === undefined ? '' : ` · ${task.status}`, color: colors.muted },
      ]), right)
    }),
    tasks.length > shown.length ? muted(ui, 'tools:background:more', `${tasks.length - shown.length} more`) : null,
    ...crons.slice(0, 4).map(cron => line(ui, `tools:cron:${cron.id}`, [
      { text: '⏲ ', color: colors.accent }, { text: cron.schedule },
      { text: cron.recurring ? ' · recurring' : ' · once', color: colors.muted },
    ])),
  ])
}

export const renderTools = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box } = ui
  const width = viewWidth(props)
  const wide = width >= 100
  const left = wide ? Math.floor((width - 2) * 0.55) : width
  const right = wide ? width - left - 2 : width
  const all = props.activity.tools.slice().sort((a, b) => b.startedAt - a.startedAt)
  const filtered = props.activity.selectedAgent === null ? all : all.filter(tool => tool.agentId === props.activity.selectedAgent)
  const selected = filtered.find(tool => tool.id === props.activity.selectedTool) ?? filtered[0]
  const scope = props.activity.selectedAgent === null ? all : filtered
  const main = [
    summary(ui, props, scope, left),
    runningSection(ui, props, left),
    recentSection(ui, props, filtered, selected, left),
  ]
  const side = [
    selected ? toolDetail(ui, props, selected, right) : null,
    statsSection(ui, props, scope, right),
    backgroundSection(ui, props, right),
  ]
  const keep = (items: (RenderElement | null)[]) => items.filter((item): item is RenderElement => Boolean(item))
  return wide ? (
    <Box flexDirection="row" gap={2} width="100%" alignItems="flex-start">
      <Box flexDirection="column" gap={1} width={left} flexShrink={0}>{keep(main)}</Box>
      <Box flexDirection="column" gap={1} width={right} flexShrink={0}>{keep(side)}</Box>
    </Box>
  ) : (
    <Box flexDirection="column" gap={1} width="100%">
      {keep([...main, ...side])}
    </Box>
  )
}

