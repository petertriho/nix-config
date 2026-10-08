import type { RenderElement, ThemeKey } from 'claude-code'
import type { CockpitAgent, CockpitTodo, CockpitViewProps } from '../types'
import { actions, card, field, heading, line, listLimit, muted, neighboringIndex, section, spread, viewWidth, visibleWindow } from './layout'
import type { Segment } from './summary'
import {
  agentElapsed, agentTokens, cacheHit, isLive, mainTurns, runningTools, sessionStatus, tokenTotals, toolDuration,
  toolLabel, toolStats,
} from './summary'
import type { CockpitElements } from './theme'
import {
  ago, brief, cleanText, clip, colors, compact, count, duration, meter, padStart, percent, plural, shortModel, statusColor,
  statusGlyph,
} from './theme'

export const agentStatusLabel = (agent: CockpitAgent): string => {
  if (agent.status === 'missing') return 'unknown (not listed)'
  return agent.teammateId ? `last reported: ${agent.status}` : agent.status
}

export type AgentRow = { agent: CockpitAgent; depth: number; last: boolean }

export const agentHierarchy = (agents: readonly CockpitAgent[]): AgentRow[] => {
  const bounded = agents.slice(0, 100)
  const ids = new Set(bounded.map(agent => agent.id))
  const children = new Map<string | undefined, CockpitAgent[]>()
  for (const agent of bounded) {
    const parent = agent.parentId && ids.has(agent.parentId) ? agent.parentId : undefined
    const siblings = children.get(parent) ?? []
    siblings.push(agent)
    children.set(parent, siblings)
  }
  const rows: AgentRow[] = []
  const visited = new Set<string>()
  const visit = (agent: CockpitAgent, depth: number, last: boolean): void => {
    if (visited.has(agent.id)) return
    visited.add(agent.id)
    rows.push({ agent, depth, last })
    const kids = (children.get(agent.id) ?? []).filter(child => !visited.has(child.id))
    kids.forEach((child, index) => visit(child, depth + 1, index === kids.length - 1))
  }
  const roots = children.get(undefined) ?? []
  roots.forEach((agent, index) => visit(agent, 0, index === roots.length - 1))
  // Cycles have no root. Keep those agents visible without walking the cycle twice.
  for (const agent of bounded) visit(agent, 0, true)
  return rows
}

export const agentName = (agent: CockpitAgent): string => cleanText(agent.name || agent.description || agent.id)

export const actorName = (props: CockpitViewProps, id: string | undefined): string => {
  if (!id) return 'main'
  const agent = props.activity.agents.find(item => item.id === id)
  return agent ? agentName(agent) : `agent ${cleanText(id)}`
}

// Stored answers are already cleaned. `clip` would also turn their newlines into spaces.
const excerpt = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`

const todoMark: Record<CockpitTodo['status'], string> = { completed: '✓', in_progress: '▸', pending: '○' }
const todoColor: Record<CockpitTodo['status'], ThemeKey> = { completed: colors.green, in_progress: colors.cyan, pending: colors.muted }

/** The plan in its own order, windowed around the item in progress. */
const checklist = (
  ui: CockpitElements, key: string, items: readonly { status: CockpitTodo['status']; text: string }[], columns: number, limit = 8,
): RenderElement[] => {
  const current = Math.max(0, items.findIndex(item => item.status === 'in_progress'))
  const shown = visibleWindow(items, current, limit)
  const start = items.indexOf(shown[0] as typeof items[number])
  const rows = shown.map((item, index) =>
    line(ui, `${key}:${start + index}`, [
      { text: `${todoMark[item.status]} `, color: todoColor[item.status] },
      { text: clip(item.text, columns - 2), color: item.status === 'completed' ? colors.muted : undefined, bold: item.status === 'in_progress' },
    ]))
  if (start > 0) rows.unshift(muted(ui, `${key}:before`, `  ${start} done above`))
  const after = items.length - start - shown.length
  if (after > 0) rows.push(muted(ui, `${key}:after`, `  ${after} more`))
  return rows
}

const progressDetail = (done: number, total: number, columns: number): Segment[] => [
  { text: `${done}/${total} `, color: done === total ? colors.green : colors.accent },
  { text: meter(total === 0 ? 0 : done / total * 100, Math.max(6, Math.min(16, columns))), color: done === total ? colors.green : colors.cyan },
]

const planSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const todos = props.activity.todos.find(list => list.agentId === undefined)?.items ?? []
  const tasks = props.activity.tasks
  if (todos.length === 0 && tasks.length === 0) return null
  const items = todos.length > 0
    ? todos.map(todo => ({ status: todo.status, text: todo.status === 'in_progress' ? todo.activeForm : todo.content }))
    : tasks.map(task => ({ status: task.status, text: `#${task.id} ${task.subject}${task.owner ? ` · ${task.owner}` : ''}` }))
  const done = items.filter(item => item.status === 'completed').length
  return section(ui, 'agents:plan', [
    heading(ui, 'agents:plan:title', todos.length > 0 ? 'Plan' : 'Tasks', progressDetail(done, items.length, width - 20), width),
    ...checklist(ui, 'agents:plan:item', items, width),
    todos.length > 0 && tasks.length > 0 ? muted(ui, 'agents:plan:tasks', `Tasks ${tasks.filter(task => task.status === 'completed').length}/${tasks.length} done`) : null,
  ])
}

const sessionSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement => {
  const { activity } = props
  const status = sessionStatus(activity, activity.working)
  const turns = mainTurns(activity)
  const totals = tokenTotals(turns.map(turn => turn.usage))
  const hit = cacheHit(totals)
  const failures = activity.tools.filter(tool => tool.outcome === 'error' || tool.outcome === 'denied').length
  const agents = activity.agents
  const agentTotal = agents.reduce((total, agent) => total + (agentTokens(agent) ?? 0), 0)
  const average = turns.length > 0 ? turns.reduce((total, turn) => total + turn.durationMs, 0) / turns.length : undefined
  const since = status.since === undefined ? '' : ` · ${brief(props.now - status.since)}`
  const turnClock = activity.working && activity.turnStartedAt !== null && status.label !== 'thinking'
    ? ` · turn ${brief(props.now - activity.turnStartedAt)}` : ''
  return section(ui, 'agents:session', [
    heading(ui, 'agents:session:title', 'Session', [{ text: shortModel(activity.model || 'model unknown'), color: colors.muted }], width),
    line(ui, 'agents:session:status', [
      { text: `${status.glyph} `, color: status.color },
      { text: clip(`${status.label}${since}${turnClock}`, width - 2), color: status.color, bold: true },
    ]),
    line(ui, 'agents:session:turns', [
      { text: plural(turns.length, 'turn') },
      { text: average === undefined ? '' : ` · avg ${duration(average)}`, color: colors.muted },
      { text: ` · ${plural(activity.tools.length, 'tool call')}` },
      { text: failures > 0 ? ` · ${failures} failed` : '', color: colors.red },
    ]),
    totals.input + totals.output + totals.cacheRead > 0 ? line(ui, 'agents:session:tokens', [
      { text: 'in ', color: colors.muted }, { text: compact(totals.input) },
      { text: ' · out ', color: colors.muted }, { text: compact(totals.output) },
      { text: ' · cache ', color: colors.muted }, { text: compact(totals.cacheRead + totals.cacheWrite) },
      { text: hit === undefined ? '' : ` · ${percent(hit)} hit`, color: hit !== undefined && hit < 50 ? colors.yellow : colors.green },
    ]) : null,
    agents.length > 0 ? line(ui, 'agents:session:agents', [
      { text: plural(agents.length, 'agent') },
      { text: ` · ${agents.filter(isLive).length} live`, color: colors.cyan },
      { text: agentTotal > 0 ? ` · ${compact(agentTotal)} tokens` : '', color: colors.muted },
    ]) : null,
  ])
}

const rowDetail = (props: CockpitViewProps, agent: CockpitAgent): Segment[] => {
  const elapsed = agentElapsed(agent, props.now)
  const time = elapsed === undefined ? '' : brief(elapsed)
  if (isLive(agent)) {
    const current = runningTools(props.activity).find(tool => tool.agentId === agent.id)
    return [
      { text: current ? `▸ ${clip(current.tool, 12)} ` : `${agent.status} `, color: colors.cyan },
      { text: padStart(time, 5), color: colors.muted },
    ]
  }
  const tokens = agentTokens(agent)
  return [
    { text: tokens === undefined ? `${agent.status} ` : `${compact(tokens)} `, color: tokens === undefined ? statusColor(agent.status) : colors.muted },
    { text: padStart(time, 5), color: colors.muted },
  ]
}

const agentList = (ui: CockpitElements, props: CockpitViewProps, width: number, selected: CockpitAgent | undefined): RenderElement => {
  const { Box, Button, Text } = ui
  const rows = agentHierarchy(props.activity.agents)
  const selectedIndex = Math.max(0, rows.findIndex(row => row.agent.id === selected?.id))
  const visible = visibleWindow(rows, selectedIndex, listLimit(props))
  const live = props.activity.agents.filter(isLive).length
  const done = props.activity.agents.filter(agent => agent.status === 'completed').length
  const failed = props.activity.agents.filter(agent => agent.status === 'failed' || agent.status === 'killed').length
  const chooseNeighbor = (direction: number): Promise<void> => {
    const next = rows[neighboringIndex(rows.length, selectedIndex, direction)]?.agent
    return next ? props.actions.selectAgent(next.id) : Promise.resolve()
  }
  return section(ui, 'agents:list', [
    heading(ui, 'agents:list:title', 'Agents', [
      { text: `${live} live`, color: live > 0 ? colors.cyan : colors.muted },
      { text: ` · ${done} done`, color: colors.muted },
      { text: failed > 0 ? ` · ${failed} failed` : '', color: colors.red },
    ], width),
    rows.length === 0 ? muted(ui, 'agents:list:empty', 'No subagents yet. They appear here when the session starts one.') : null,
    ...visible.map(({ agent, depth, last }) => {
      const indent = depth === 0 ? '' : `${'  '.repeat(Math.min(3, depth - 1))}${last ? '└ ' : '├ '}`
      const marker = agent.id === selected?.id ? '›' : ' '
      const viewing = agent.id === props.viewedAgent ? ' ◉' : ''
      const detail = rowDetail(props, agent)
      const detailWidth = detail.reduce((total, segment) => total + [...segment.text].length, 0)
      const nameWidth = Math.max(6, width - detailWidth - [...indent].length - 5 - viewing.length)
      return spread(ui, `agents:row:${agent.id}`, (
        <Box flexDirection="row">
          <Text color={agent.id === selected?.id ? colors.accent : colors.muted}>{marker} {indent}</Text>
          <Text color={statusColor(agent.status)}>{statusGlyph(agent.status)} </Text>
          <Button key={`agents:select:${agent.id}`} plain label={`${clip(agentName(agent), nameWidth)}${viewing}`} onPress={() => props.actions.selectAgent(agent.id)} />
        </Box>
      ), detail)
    }),
    rows.length > visible.length ? muted(ui, 'agents:list:more', `Showing ${visible.length} of ${rows.length}.`) : null,
    actions(ui, 'agents:list:actions', [
      { key: 'agents:refresh', label: 'Refresh', hotkey: 'r', onPress: props.actions.refreshAgents },
      { key: 'agents:prev', label: 'Previous', hotkey: 'k', onPress: () => chooseNeighbor(-1), hidden: rows.length < 2 },
      { key: 'agents:next', label: 'Next', hotkey: 'j', onPress: () => chooseNeighbor(1), hidden: rows.length < 2 },
    ]),
  ])
}

const agentDetail = (ui: CockpitElements, props: CockpitViewProps, agent: CockpitAgent, width: number): RenderElement => {
  const { Markdown } = ui
  const inner = width - 4
  const tools = props.activity.tools.filter(tool => tool.agentId === agent.id)
  const recent = tools.slice().sort((left, right) => right.startedAt - left.startedAt).slice(0, 4)
  const mix = toolStats(tools, props.now).sort((left, right) => right.calls - left.calls).slice(0, 4)
  const todos = props.activity.todos.find(list => list.agentId === agent.id)?.items ?? []
  const elapsed = agentElapsed(agent, props.now)
  const tokens = agentTokens(agent)
  const usage = agent.usage
  const totals = agent.totals
  const timing = isLive(agent)
    ? `${elapsed === undefined ? 'running' : `running ${duration(elapsed)}`}`
    : `${agentStatusLabel(agent)}${agent.completedAt === undefined ? '' : ` ${ago(props.now, agent.completedAt)}`}${elapsed === undefined ? '' : ` · ran ${duration(elapsed)}`}`
  return card(ui, `agents:detail:${agent.id}`, [
    spread(ui, 'agents:detail:title', line(ui, 'agents:detail:name', [
      { text: `${statusGlyph(agent.status)} `, color: statusColor(agent.status) },
      { text: clip(agentName(agent), inner - 18), bold: true },
    ]), [{ text: clip(agent.type, 16), color: colors.magenta }]),
    agent.name && agent.description && agent.description !== agent.name ? muted(ui, 'agents:detail:description', clip(agent.description, inner * 2)) : null,
    field(ui, 'agents:detail:status', 'Status', [{ text: timing, color: statusColor(agent.status) }]),
    field(ui, 'agents:detail:parent', 'Parent', [{ text: actorName(props, agent.parentId) }, { text: agent.id === props.viewedAgent ? ' · in view' : '', color: colors.accent }]),
    tokens !== undefined ? field(ui, 'agents:detail:tokens', 'Tokens', [
      { text: count(tokens) },
      { text: totals ? ` · ${plural(totals.toolUses, 'tool use')}` : usage ? ` · in ${compact(usage.input_tokens)} out ${compact(usage.output_tokens)}` : '', color: colors.muted },
    ]) : null,
    totals && (totals.linesAdded !== undefined || totals.linesRemoved !== undefined) ? field(ui, 'agents:detail:lines', 'Lines', [
      { text: `+${count(totals.linesAdded ?? 0)}`, color: colors.green }, { text: ' ' }, { text: `−${count(totals.linesRemoved ?? 0)}`, color: colors.red },
    ]) : null,
    totals && totals.models.length > 0 ? field(ui, 'agents:detail:models', 'Models', [{ text: totals.models.map(shortModel).join(', '), color: colors.muted }])
      : usage ? field(ui, 'agents:detail:model', 'Model', [{ text: shortModel(usage.model), color: colors.muted }]) : null,
    mix.length > 0 ? field(ui, 'agents:detail:mix', 'Tools', mix.flatMap((stat, index) => [
      { text: index > 0 ? ' · ' : '', color: colors.muted }, { text: stat.tool }, { text: ` ${stat.calls}`, color: colors.muted },
    ])) : null,
    agent.teammateId ? muted(ui, 'agents:detail:teammate', 'A teammate status is its last report.') : null,
    agent.status === 'missing' ? muted(ui, 'agents:detail:missing', 'Not listed on the last refresh.') : null,
    todos.length > 0 ? heading(ui, 'agents:detail:todos', 'Todos', progressDetail(todos.filter(todo => todo.status === 'completed').length, todos.length, 10), inner) : null,
    ...(todos.length > 0 ? checklist(ui, `agents:detail:todo:${agent.id}`, todos.map(todo => ({ status: todo.status, text: todo.status === 'in_progress' ? todo.activeForm : todo.content })), inner, 5) : []),
    recent.length > 0 ? heading(ui, 'agents:detail:recent', 'Recent', [{ text: `${tools.length} calls`, color: colors.muted }], inner) : null,
    ...recent.map(tool => {
      const elapsed = toolDuration(tool, props.now)
      return spread(ui, `agents:detail:tool:${tool.id}`, line(ui, `agents:detail:tool:${tool.id}:label`, [
        { text: `${statusGlyph(tool.outcome)} `, color: statusColor(tool.outcome) },
        { text: clip(toolLabel(tool), inner - 10) },
      ]), [{ text: elapsed === undefined ? '' : brief(elapsed), color: colors.muted }])
    }),
    agent.answer ? heading(ui, 'agents:detail:answer', 'Answer', [], inner) : null,
    agent.answer ? <Markdown key={`agents:answer:${agent.id}`} text={excerpt(agent.answer, 1200)} /> : null,
    tools.length > 0 ? actions(ui, 'agents:detail:actions', [{ key: 'agents:show-tools', label: 'Show its tools', hotkey: 't', onPress: async () => {
      await props.actions.selectAgent(agent.id)
      await props.actions.selectTool(null)
      await props.actions.selectView('tools')
    } }]) : null,
  ])
}


export const renderAgents = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box } = ui
  const width = viewWidth(props)
  const wide = width >= 100
  const left = wide ? Math.floor((width - 2) / 2) : width
  const right = wide ? width - left - 2 : width
  const rows = agentHierarchy(props.activity.agents)
  const selected = rows.find(row => row.agent.id === props.activity.selectedAgent)?.agent ?? rows[0]?.agent
  const error = props.activity.error
  const main = [
    sessionSection(ui, props, left),
    planSection(ui, props, left),
    agentList(ui, props, left, selected),
    error ? line(ui, 'agents:error', [{ text: clip(error, 280), color: colors.red }], true) : null,
  ].filter((child): child is RenderElement => Boolean(child))
  const detail = selected ? agentDetail(ui, props, selected, right) : null
  return wide ? (
    <Box flexDirection="row" gap={2} width="100%" alignItems="flex-start">
      <Box flexDirection="column" gap={1} width={left} flexShrink={0}>{main}</Box>
      <Box flexDirection="column" width={right} flexShrink={0}>{detail ?? muted(ui, 'agents:detail:none', 'Select an agent to see its run.')}</Box>
    </Box>
  ) : (
    <Box flexDirection="column" gap={1} width="100%">
      {main}
      {detail}
    </Box>
  )
}
