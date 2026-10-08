import type { RenderElement, ThemeKey } from 'claude-code'
import type {
  CockpitActivity,
  CockpitAgent,
  CockpitAgentTotals,
  CockpitBackgroundTask,
  CockpitChange,
  CockpitGitOperation,
  CockpitTodo,
  CockpitTool,
  CockpitTurnUsage,
  CockpitViewProps,
} from '../types'
import { cleanText, clip, colors, count, duration, humanize, meter, plural, statusColor } from './theme'
import type { CockpitElements } from './theme'

const terminalStatuses = new Set(['completed', 'failed', 'killed'])

export const agentStatusLabel = (agent: CockpitAgent): string => {
  if (agent.status === 'missing') return 'unknown (not listed)'
  return agent.teammateId ? `last reported: ${agent.status}` : agent.status
}

export type AgentRow = { agent: CockpitAgent; depth: number }

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
  const visit = (agent: CockpitAgent, depth: number): void => {
    if (visited.has(agent.id)) return
    visited.add(agent.id)
    rows.push({ agent, depth })
    for (const child of children.get(agent.id) ?? []) visit(child, depth + 1)
  }
  for (const agent of children.get(undefined) ?? []) visit(agent, 0)
  // Cycles have no root. Keep those agents visible without walking the cycle twice.
  for (const agent of bounded) visit(agent, 0)
  return rows
}

export const visibleWindow = <T,>(
  items: readonly T[],
  selected: number,
  limit: number,
): readonly T[] => {
  const size = Math.max(1, Math.floor(limit))
  const anchor = Math.max(0, Math.min(items.length - 1, selected))
  const start = Math.max(0, Math.min(items.length - size, anchor - Math.floor(size / 2)))
  return items.slice(start, start + size)
}

// A finished call with a PostToolUse time reports execution alone. Otherwise
// the time includes any permission prompt and hook time.
export const toolDuration = (tool: CockpitTool, now: number): number | undefined => {
  if (tool.outcome !== 'running' && tool.runMs !== undefined) return tool.runMs
  const end = tool.finishedAt ?? (tool.outcome === 'running' ? now : undefined)
  if (end === undefined || !Number.isFinite(end) || !Number.isFinite(tool.startedAt)) return undefined
  return Math.max(0, end - tool.startedAt)
}

// The time around the execution: the permission prompt when one was asked, and hooks.
export const waitDuration = (tool: CockpitTool): number | undefined => {
  if (tool.finishedAt === undefined || tool.runMs === undefined) return undefined
  return Math.max(0, tool.finishedAt - tool.startedAt - tool.runMs)
}

export const patchPreview = (patch: string, maxChars = 24000): { source: string; truncated: boolean } => {
  const source = patch.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ' ')
  const limit = Math.max(0, Math.min(24000, Math.floor(maxChars)))
  if (source.length <= limit) return { source, truncated: false }
  // Code needs complete hunks. Do not turn a partial hunk into an apparent complete diff.
  const starts = [...source.matchAll(/^@@ /gm)].map(match => match.index)
  const boundary = starts.filter(index => index <= limit).at(-1)
  return { source: boundary === undefined || boundary === starts[0] ? '' : source.slice(0, boundary), truncated: true }
}

const progress = (items: readonly { status: string }[], noun: string): string | undefined =>
  items.length === 0 ? undefined : `${items.filter(item => item.status === 'completed').length}/${items.length} ${noun}`

export const planProgress = (activity: Pick<CockpitActivity, 'todos' | 'tasks'>): string | undefined =>
  progress(activity.todos.find(list => list.agentId === undefined)?.items ?? [], 'todos')
  ?? progress(activity.tasks, 'tasks')

export const bandSummary = (
  activity: CockpitActivity,
  options: { isWorking: boolean; columns: number },
): { text: string; color: ThemeKey } => {
  const agents = activity.agents.filter(agent => agent.status === 'running' || agent.status === 'waiting').length
  const running = activity.tools.filter(tool => tool.outcome === 'running').length
  const background = activity.background.filter(task => task.endedAt === undefined).length
  const failure = options.isWorking ? null : activity.stopFailure
  const last = activity.turns.filter(turn => turn.agentId === undefined).at(-1)
  const label = failure ? `stopped: ${humanize(failure.error)}`
    : running > 0 ? `${plural(running, 'tool')} running`
    : options.isWorking ? 'thinking' : activity.phase
  const parts = [plural(agents, 'agent'), label, planProgress(activity), background > 0 ? `${count(background)} background` : undefined]
  if (options.columns >= 64 && last !== undefined) parts.push(`last turn ${duration(last.durationMs)}`)
  return { text: parts.filter(Boolean).join(' · '), color: failure ? colors.red : statusColor(activity.phase) }
}

// Stored answers are already cleaned. `clip` would also turn their newlines into spaces.
const excerpt = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`

const agentName = (agent: CockpitAgent): string => cleanText(agent.name || agent.description || agent.id)

const actorName = (props: CockpitViewProps, id: string | undefined): string => {
  if (!id) return 'Main session'
  const agent = props.activity.agents.find(item => item.id === id)
  return agent ? agentName(agent) : `Unknown agent ${cleanText(id)}`
}

const paneWidth = (props: CockpitViewProps): number => Math.max(24, Math.floor(props.columns) - 4)
const listLimit = (props: CockpitViewProps): number => Math.max(8, Math.min(24, Math.floor(props.rows) - 10))
const age = (now: number, timestamp: number): string =>
  Number.isFinite(timestamp) && Number.isFinite(now) ? `${duration(now - timestamp)} ago` : 'unknown'

const neighboringIndex = (length: number, selected: number, direction: number): number =>
  length > 0 ? (Math.max(0, selected) + direction + length) % length : 0

const todoMark: Record<CockpitTodo['status'], string> = { completed: '✓', in_progress: '▸', pending: '○' }
const todoColor: Record<CockpitTodo['status'], ThemeKey> = { completed: colors.green, in_progress: colors.cyan, pending: colors.muted }

const todoRows = (ui: CockpitElements, key: string, items: readonly CockpitTodo[], columns: number, limit = 8): RenderElement => {
  const { Box, Text } = ui
  // Keep the active item in view: open work first, finished work last.
  const order = { in_progress: 0, pending: 1, completed: 2 }
  const shown = items.slice().sort((left, right) => order[left.status] - order[right.status]).slice(0, limit)
  return (
    <Box flexDirection="column">
      {shown.map((todo, index) => (
        <Text key={`${key}:${index}`} color={todoColor[todo.status]} wrap="wrap">
          {clip(`${todoMark[todo.status]} ${todo.status === 'in_progress' ? todo.activeForm : todo.content}`, columns)}
        </Text>
      ))}
      {items.length > shown.length && <Text color={colors.muted}>{items.length - shown.length} more</Text>}
    </Box>
  )
}

const planSection = (ui: CockpitElements, props: CockpitViewProps, columns: number): RenderElement | null => {
  const { Box, Text } = ui
  const todos = props.activity.todos.find(list => list.agentId === undefined)?.items ?? []
  const tasks = props.activity.tasks
  if (todos.length === 0 && tasks.length === 0) return null
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={colors.accent}>Plan · {[progress(todos, 'todos'), progress(tasks, 'tasks')].filter(Boolean).join(' · ')}</Text>
      {todos.length > 0 && todoRows(ui, 'ops:plan-todo', todos, columns)}
      {tasks.slice(0, 8).map(task => (
        <Text key={`ops:plan-task:${task.id}`} color={todoColor[task.status]} wrap="wrap">
          {clip(`${todoMark[task.status]} #${task.id} ${task.subject}${task.owner ? ` · ${task.owner}` : ''}`, columns)}
        </Text>
      ))}
      {tasks.length > 8 && <Text color={colors.muted}>{tasks.length - 8} more tasks</Text>}
    </Box>
  )
}

const totalRows = (ui: CockpitElements, totals: CockpitAgentTotals, columns: number): RenderElement => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      <Text color={colors.magenta} bold>Run totals</Text>
      <Text>{count(totals.tokens)} tokens · {plural(totals.toolUses, 'tool use')} · {duration(totals.durationMs)}</Text>
      {(totals.linesAdded !== undefined || totals.linesRemoved !== undefined) && (
        <Text><Text color={colors.green}>+{count(totals.linesAdded ?? 0)}</Text> <Text color={colors.red}>−{count(totals.linesRemoved ?? 0)}</Text> lines</Text>
      )}
      {totals.models.length > 0 && <Text color={colors.muted} wrap="wrap">{clip(totals.models.join(', '), columns)}</Text>}
    </Box>
  )
}

const usageRows = (ui: CockpitElements, usage: CockpitTurnUsage | undefined, columns: number): RenderElement => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      <Text color={colors.magenta} bold>Last turn usage</Text>
      {usage ? (
        <Box flexDirection="column">
          <Text wrap="wrap">{clip(usage.model, columns)}</Text>
          <Text>Input {count(usage.input_tokens)} · Output {count(usage.output_tokens)}</Text>
          <Text>Cache read {count(usage.cache_read_input_tokens)} · write {count(usage.cache_creation_input_tokens)}</Text>
        </Box>
      ) : <Text color={colors.muted}>Not reported.</Text>}
    </Box>
  )
}

export const renderAgents = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box, Text, Button, Markdown } = ui
  const width = paneWidth(props)
  const wide = width >= 108
  const sidebar = wide ? Math.min(48, Math.floor(width * 0.4)) : width
  const detailWidth = wide ? width - sidebar - 5 : width - 4
  const rows = agentHierarchy(props.activity.agents)
  const selectedIndex = Math.max(0, rows.findIndex(row => row.agent.id === props.activity.selectedAgent))
  const selected = rows[selectedIndex]?.agent
  const visible = visibleWindow(rows, selectedIndex, listLimit(props))
  const active = props.activity.agents.filter(agent => ['pending', 'running', 'waiting'].includes(agent.status)).length
  const completed = props.activity.agents.filter(agent => terminalStatuses.has(agent.status)).length
  const unknown = props.activity.agents.filter(agent => agent.status === 'missing').length
  const recentTools = selected ? props.activity.tools.filter(tool => tool.agentId === selected.id)
    .slice().sort((left, right) => right.startedAt - left.startedAt).slice(0, 4) : []
  const completedUsage = selected?.usage ?? props.activity.turns.slice().reverse()
    .find(turn => turn.agentId === selected?.id && turn.usage)?.usage
  const selectedTodos = selected ? props.activity.todos.find(list => list.agentId === selected.id)?.items ?? [] : []
  const chooseNeighbor = (direction: number): Promise<void> => {
    const next = rows[neighboringIndex(rows.length, selectedIndex, direction)]?.agent
    return next ? props.actions.selectAgent(next.id) : Promise.resolve()
  }

  return (
    <Box flexDirection="column" width="100%" minWidth={0}>
      <Text bold color={colors.accent}>Agent hierarchy</Text>
      <Text color={colors.muted}>{rows.length} observed · {active} active · {completed} finished · {unknown} unknown</Text>
      {planSection(ui, props, width)}
      <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
        <Button key="ops:refresh-agents" label="Refresh agents" hotkey="r" onPress={props.actions.refreshAgents} />
        {rows.length > 1 && <Button key="ops:agent-prev" label="Previous agent" onPress={() => chooseNeighbor(-1)} />}
        {rows.length > 1 && <Button key="ops:agent-next" label="Next agent" onPress={() => chooseNeighbor(1)} />}
      </Box>
      {props.activity.error && <Text color={colors.red} wrap="wrap">{clip(props.activity.error, 280)}</Text>}
      <Box flexDirection={wide ? 'row' : 'column'} gap={1} marginTop={1} alignItems="flex-start">
        <Box flexDirection="column" width={sidebar} minWidth={0} flexShrink={0}>
          {rows.length === 0 && <Text color={colors.muted}>No agents observed.</Text>}
          {visible.map(({ agent, depth }) => (
            <Box key={`ops:agent-row:${agent.id}`} flexDirection="column" marginBottom={1}>
              <Button
                key={`ops:agent:${agent.id}`}
                plain
                label={clip(`${agent.id === selected?.id ? '› ' : '  '}${'  '.repeat(Math.min(4, depth))}${depth > 0 ? '└ ' : ''}${agentName(agent)}${agent.id === props.viewedAgent ? ' ◉' : ''}`, sidebar - 2)}
                variant={agent.id === selected?.id ? 'primary' : 'secondary'}
                onPress={() => props.actions.selectAgent(agent.id)}
              />
              <Text color={statusColor(agent.status)} wrap="wrap">{clip(agent.type, Math.min(80, sidebar - 2))} · {agentStatusLabel(agent)}</Text>
              {agent.parentId && <Text color={colors.muted} wrap="wrap">{clip(`parent: ${actorName(props, agent.parentId)}`, sidebar - 2)}</Text>}
            </Box>
          ))}
          {rows.length > visible.length && <Text color={colors.muted}>Showing {visible.length}/{rows.length}.</Text>}
        </Box>
        <Box flexDirection="column" width={wide ? detailWidth + 4 : '100%'} minWidth={0} borderStyle="round" borderColor={colors.muted} paddingX={1}>
          <Text bold color={colors.cyan}>Selected agent{selected && selected.id === props.viewedAgent ? ' · in view' : ''}</Text>
          {selected ? (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{clip(agentName(selected), 200)}</Text>
              <Text color={colors.muted} wrap="wrap">{clip(`ID: ${selected.id}`, 200)}</Text>
              <Text wrap="wrap">{clip(`Type: ${selected.type}`, detailWidth)}</Text>
              <Text color={statusColor(selected.status)} wrap="wrap">{agentStatusLabel(selected)}</Text>
              <Text wrap="wrap">{clip(`Parent: ${selected.parentId ? actorName(props, selected.parentId) : 'Main session'}`, 200)}</Text>
              {selected.spawnedBy && <Text color={colors.muted} wrap="wrap">{clip(`Spawned by: ${selected.spawnedBy}`, 160)}</Text>}
              <Text color={colors.muted}>Last seen {age(props.now, selected.lastSeenAt)} · duration {selected.durationMs === undefined ? 'unknown' : duration(selected.durationMs)}</Text>
              <Text wrap="wrap">{clip(selected.description, 320)}</Text>
              {selected.teammateId && <Text color={colors.yellow} wrap="wrap">Teammate status is its last report.</Text>}
              {selected.status === 'missing' && <Text color={colors.yellow} wrap="wrap">Not listed on the last refresh.</Text>}
              {selectedTodos.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold color={colors.cyan}>Todos · {progress(selectedTodos, 'done')}</Text>
                  {todoRows(ui, `ops:agent-todo:${selected.id}`, selectedTodos, detailWidth)}
                </Box>
              )}
              <Box flexDirection="column" marginTop={1}>
                <Text bold color={colors.cyan}>Recent tools</Text>
                {recentTools.length === 0 && <Text color={colors.muted}>None captured.</Text>}
                {recentTools.map(tool => (
                  <Box key={`ops:agent-tool-row:${tool.id}`} flexDirection="column">
                    <Button key={`ops:agent-tool:${tool.id}`} plain label={clip(tool.tool, detailWidth)} onPress={async () => {
                      await props.actions.selectAgent(selected.id)
                      await props.actions.selectTool(tool.id)
                      await props.actions.selectView('tools')
                    }} />
                    <Text color={statusColor(tool.outcome)}>{tool.outcome}{tool.retrospective ? ' · server tool' : ''}</Text>
                  </Box>
                ))}
              </Box>
              <Box marginTop={1} flexDirection="column">
                {selected.totals ? totalRows(ui, selected.totals, detailWidth) : usageRows(ui, completedUsage, detailWidth)}
              </Box>
              {selected.answer && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold color={colors.cyan}>Last answer</Text>
                  <Markdown key={`ops:agent-answer:${selected.id}`} text={excerpt(selected.answer, 1200)} />
                </Box>
              )}
            </Box>
          ) : <Text color={colors.muted}>Select an agent after one is observed.</Text>}
        </Box>
      </Box>
    </Box>
  )
}

const backgroundStatus = (task: CockpitBackgroundTask): ThemeKey =>
  task.endedAt !== undefined ? colors.muted : statusColor(task.status === 'pending' ? 'pending' : 'running')

const backgroundSection = (ui: CockpitElements, props: CockpitViewProps, columns: number): RenderElement | null => {
  const { Box, Text } = ui
  const tasks = props.activity.background
  const crons = props.activity.crons
  if (tasks.length === 0 && crons.length === 0) return null
  const live = tasks.filter(task => task.endedAt === undefined)
  // In-flight work first, then the most recently ended.
  const shown = [...live, ...tasks.filter(task => task.endedAt !== undefined).reverse()].slice(0, 6)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={colors.accent}>Background · {count(live.length)} in flight{props.activity.backgroundAt === null ? '' : ` · reported ${age(props.now, props.activity.backgroundAt)}`}</Text>
      {shown.map(task => (
        <Text key={`ops:background:${task.id}`} color={backgroundStatus(task)} wrap="wrap">
          {clip(`${task.type} · ${task.status} · ${task.description}${task.startedAt === undefined ? '' : ` · ${duration((task.endedAt ?? props.now) - task.startedAt)}`}`, columns)}
        </Text>
      ))}
      {tasks.length > shown.length && <Text color={colors.muted}>{tasks.length - shown.length} more</Text>}
      {crons.length > 0 && <Text color={colors.muted} wrap="wrap">{clip(`Scheduled: ${crons.map(cron => `${cron.schedule}${cron.recurring ? '' : ' (once)'}`).join(', ')}`, columns)}</Text>}
    </Box>
  )
}

const toolStatus = (tool: CockpitTool): string =>
  `${tool.outcome}${tool.approval === 'asked' ? ' · approval asked' : ''}`

export const renderTools = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box, Text, Button } = ui
  const width = paneWidth(props)
  const wide = width >= 108
  const timelineWidth = wide ? Math.floor(width * 0.57) : width
  const detailWidth = wide ? width - timelineWidth - 5 : width - 4
  const allTools = props.activity.tools.slice().sort((left, right) => right.startedAt - left.startedAt)
  const filtered = props.activity.selectedAgent === null ? allTools : allTools.filter(tool => tool.agentId === props.activity.selectedAgent)
  const selectedIndex = Math.max(0, filtered.findIndex(tool => tool.id === props.activity.selectedTool))
  const selected = filtered[selectedIndex]
  const visible = visibleWindow(filtered, selectedIndex, listLimit(props))
  const filters = visibleWindow(props.activity.agents, props.activity.agents.findIndex(agent => agent.id === props.activity.selectedAgent), 6)
  const longest = Math.max(1, ...visible.map(tool => toolDuration(tool, props.now) ?? 0))
  const groups = new Map<string | undefined, CockpitTool[]>()
  for (const tool of visible) {
    const group = groups.get(tool.agentId) ?? []
    group.push(tool)
    groups.set(tool.agentId, group)
  }
  const setFilter = async (id: string | null): Promise<void> => {
    await props.actions.selectAgent(id)
    await props.actions.selectTool(null)
  }
  const chooseNeighbor = (direction: number): Promise<void> => {
    const next = filtered[neighboringIndex(filtered.length, selectedIndex, direction)]
    return next ? props.actions.selectTool(next.id) : Promise.resolve()
  }
  const selectedWait = selected ? waitDuration(selected) : undefined

  return (
    <Box flexDirection="column" width="100%" minWidth={0}>
      <Text bold color={colors.accent}>Tool timeline</Text>
      <Text color={colors.muted}>{allTools.length} captured · {allTools.filter(tool => tool.outcome === 'running').length} running</Text>
      {backgroundSection(ui, props, width)}
      <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
        <Button key="ops:tools-all" label="All agents" variant={props.activity.selectedAgent === null ? 'primary' : 'secondary'} onPress={() => setFilter(null)} />
        {filters.map(agent => <Button key={`ops:tools-agent:${agent.id}`} label={clip(agentName(agent), Math.min(22, width - 6))} variant={agent.id === props.activity.selectedAgent ? 'primary' : 'secondary'} onPress={() => setFilter(agent.id)} />)}
        {props.activity.agents.length > filters.length && <Button key="ops:tools-next-agent" label="Next filter" onPress={() => {
          const index = props.activity.agents.findIndex(agent => agent.id === props.activity.selectedAgent)
          const next = props.activity.agents[index < 0 ? 0 : neighboringIndex(props.activity.agents.length, index, 1)]
          return next ? setFilter(next.id) : Promise.resolve()
        }} />}
      </Box>
      <Text color={colors.cyan} wrap="wrap">{clip(props.activity.selectedAgent === null ? 'Grouped by agent · newest first' : `Agent filter: ${actorName(props, props.activity.selectedAgent)}`, 200)}</Text>
      {filtered.length > 1 && <Box flexDirection="row" flexWrap="wrap" gap={1}>
        <Button key="ops:tool-prev" label="Newer tool" onPress={() => chooseNeighbor(-1)} />
        <Button key="ops:tool-next" label="Older tool" onPress={() => chooseNeighbor(1)} />
      </Box>}
      <Box flexDirection={wide ? 'row' : 'column'} gap={1} marginTop={1} alignItems="flex-start">
        <Box flexDirection="column" width={timelineWidth} minWidth={0} flexShrink={0}>
          {filtered.length === 0 && <Text color={colors.muted}>No captured tools for this filter.</Text>}
          {[...groups].map(([id, tools]) => (
            <Box key={`ops:tool-group:${id ?? 'main'}`} flexDirection="column" marginBottom={1}>
              <Text bold color={colors.magenta} wrap="wrap">{clip(actorName(props, id), timelineWidth - 2)}</Text>
              {tools.map(tool => {
                const elapsed = toolDuration(tool, props.now)
                return (
                  <Box key={`ops:tool-row:${tool.id}`} flexDirection="column" marginBottom={1}>
                    <Button key={`ops:tool:${tool.id}`} plain label={clip(`${tool.id === selected?.id ? '› ' : '  '}${tool.tool}`, timelineWidth - 2)} onPress={() => props.actions.selectTool(tool.id)} />
                    <Text color={tool.approval === 'asked' && tool.outcome === 'running' ? colors.yellow : statusColor(tool.outcome)}>{toolStatus(tool)} · {elapsed === undefined ? 'duration unknown' : duration(elapsed)}{tool.outcome === 'running' ? ' elapsed' : ''}</Text>
                    <Text color={statusColor(tool.outcome)}>{meter(elapsed === undefined ? 0 : elapsed / longest * 100, width < 60 ? 10 : 18)} <Text color={colors.muted}>{age(props.now, tool.startedAt)}</Text></Text>
                    {tool.target && <Text color={colors.muted} wrap="wrap">{clip(tool.target, Math.min(160, timelineWidth - 2))}</Text>}
                    {tool.retrospective && <Text color={colors.muted}>server tool</Text>}
                  </Box>
                )
              })}
            </Box>
          ))}
          {filtered.length > visible.length && <Text color={colors.muted}>Showing {visible.length}/{filtered.length}.</Text>}
        </Box>
        <Box flexDirection="column" width={wide ? detailWidth + 4 : '100%'} minWidth={0} borderStyle="round" borderColor={colors.muted} paddingX={1}>
          <Text bold color={colors.cyan}>Selected tool</Text>
          {selected ? (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{clip(selected.tool, 200)}</Text>
              <Text color={statusColor(selected.outcome)}>{toolStatus(selected)}</Text>
              <Text color={colors.muted} wrap="wrap">{clip(`ID: ${selected.id}`, 200)}</Text>
              <Text wrap="wrap">{clip(`Agent: ${actorName(props, selected.agentId)}`, 200)}</Text>
              <Text color={colors.muted}>Started {age(props.now, selected.startedAt)}</Text>
              <Text>{selected.runMs !== undefined && selected.outcome !== 'running' ? 'Ran' : 'Duration'} {toolDuration(selected, props.now) === undefined ? 'unknown' : duration(toolDuration(selected, props.now) ?? 0)}</Text>
              {selectedWait !== undefined && <Text color={selected.approval === 'asked' ? colors.yellow : colors.muted}>{selected.approval === 'asked' ? 'Approval and hooks' : 'Hooks'} {duration(selectedWait)}</Text>}
              <Text wrap="wrap">{selected.target ? clip(`Target: ${selected.target}`, 240) : 'Target not reported'}</Text>
              {selected.retrospective && <Text color={colors.muted} wrap="wrap">Server tool, reported after the response.</Text>}
            </Box>
          ) : <Text color={colors.muted}>Select a captured tool.</Text>}
        </Box>
      </Box>
    </Box>
  )
}

const changeLabels = (change: CockpitChange): string => [
  change.source === 'git' ? 'git snapshot' : 'observed edit',
  change.staged ? 'staged' : undefined,
  change.untracked ? 'untracked' : undefined,
  change.truncated ? 'truncated' : undefined,
].filter(Boolean).join(' · ')

export const gitOperationLines = (operation: CockpitGitOperation): string[] => [
  operation.commit && `${humanize(operation.commit.kind)} ${operation.commit.sha.slice(0, 10)}${operation.commit.branch ? ` on ${operation.commit.branch}` : ''}`,
  operation.push && `pushed ${operation.push.branch}`,
  operation.branch && `${humanize(operation.branch.action)} ${operation.branch.ref}`,
  operation.pr && `PR #${operation.pr.number} ${humanize(operation.pr.action)}`,
].filter((line): line is string => Boolean(line)).map(line => cleanText(line))

const gitSection = (ui: CockpitElements, props: CockpitViewProps, columns: number): RenderElement | null => {
  const { Box, Text, Link } = ui
  const operations = props.review.gitOps.slice(-6).reverse()
  if (operations.length === 0) return null
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={colors.magenta}>Git activity</Text>
      {operations.map(operation => (
        <Box key={`ops:git:${operation.id}`} flexDirection="column">
          <Text wrap="wrap">{clip(`${gitOperationLines(operation).join(' · ')} · ${age(props.now, operation.at)}`, columns)}</Text>
          {operation.pr?.url && <Link key={`ops:git-pr:${operation.id}`} href={operation.pr.url} label={clip(operation.pr.url, columns)} />}
        </Box>
      ))}
    </Box>
  )
}

export const renderChanges = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box, Text, Button, Code } = ui
  const width = paneWidth(props)
  const wide = width >= 108
  const sidebar = wide ? Math.min(40, Math.floor(width * 0.32)) : width
  const selectedIndex = Math.max(0, props.review.changes.findIndex(change => change.path === props.review.selectedPath))
  const selected = props.review.changes[selectedIndex]
  const visible = visibleWindow(props.review.changes, selectedIndex, listLimit(props))
  const preview = patchPreview(selected?.patch ?? '')
  const selectedFindings = props.review.findings.filter(finding => selected && finding.path === selected.path)
  const rankedFindings = selected ? [...selectedFindings, ...props.review.findings.filter(finding => finding.path !== selected.path)] : props.review.findings
  const findings = rankedFindings.slice(0, 10)
  const checks = props.review.checks.slice(-6).reverse()
  const chooseNeighbor = (direction: number): Promise<void> => {
    const next = props.review.changes[neighboringIndex(props.review.changes.length, selectedIndex, direction)]
    return next ? props.actions.selectChange(next.path) : Promise.resolve()
  }

  return (
    <Box flexDirection="column" width="100%" minWidth={0}>
      <Text bold color={colors.accent}>Changes & checks</Text>
      <Text color={colors.muted} wrap="wrap">{clip(`Branch: ${props.review.branch ?? 'unknown'} · ${props.review.changes.length} files · refreshed ${props.review.refreshedAt === null ? 'never' : age(props.now, props.review.refreshedAt)}`, 200)}</Text>
      <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
        <Button key="ops:refresh-changes" label={props.review.loading ? 'Refreshing git…' : 'Refresh git'} hotkey="r" onPress={props.actions.refreshChanges} />
        {props.review.changes.length > 1 && <Button key="ops:file-prev" label="Previous file" onPress={() => chooseNeighbor(-1)} />}
        {props.review.changes.length > 1 && <Button key="ops:file-next" label="Next file" onPress={() => chooseNeighbor(1)} />}
      </Box>
      {props.review.error && <Text color={colors.red} wrap="wrap">{clip(props.review.error, 320)}</Text>}
      {gitSection(ui, props, width)}
      <Box flexDirection={wide ? 'row' : 'column'} gap={1} marginTop={1} alignItems="flex-start">
        <Box flexDirection="column" width={sidebar} minWidth={0} flexShrink={0}>
          <Text bold color={colors.magenta}>Files</Text>
          {visible.length === 0 && <Text color={colors.muted}>No changes captured.</Text>}
          {visible.map(change => (
            <Box key={`ops:file-row:${change.path}`} flexDirection="column" marginBottom={1}>
              <Button key={`ops:file:${change.path}`} plain label={clip(`${change.path === selected?.path ? '› ' : '  '}${change.path}`, sidebar - 2)} onPress={() => props.actions.selectChange(change.path)} />
              {change.patch.length > 0 ? <Text><Text color={colors.green}>+{count(change.additions)}</Text> <Text color={colors.red}>−{count(change.deletions)}</Text></Text> : <Text color={colors.muted}>Line counts unavailable</Text>}
              <Text color={change.truncated ? colors.yellow : colors.muted} wrap="wrap">{changeLabels(change)}</Text>
            </Box>
          ))}
          {props.review.changes.length > visible.length && <Text color={colors.muted}>Showing {visible.length}/{props.review.changes.length}.</Text>}
        </Box>
        <Box flexDirection="column" width={wide ? width - sidebar - 1 : '100%'} minWidth={0}>
          <Text bold color={colors.cyan}>Selected file patch</Text>
          {selected ? (
            <Box flexDirection="column">
              <Text bold wrap="wrap">{clip(selected.path, 240)}</Text>
              <Text color={colors.muted} wrap="wrap">{changeLabels(selected)}</Text>
              {(selected.truncated || preview.truncated) && <Text color={colors.yellow} wrap="wrap">Truncated patch.</Text>}
              {selected.patch.length > 0 && <Box flexDirection="row" flexWrap="wrap" gap={1} marginY={1}>
                <Button key="ops:copy-patch" label="Copy patch" onPress={() => props.actions.copyPatch(selected.path)} />
                <Button key="ops:quote-patch" label="Quote patch" onPress={() => props.actions.quotePatch(selected.path)} />
              </Box>}
              {preview.source ? <Code source={preview.source} path={selected.path} format="diff" wrap="wrap" /> : <Text color={colors.muted} wrap="wrap">{preview.truncated ? 'No complete hunk fits the preview limit. Copy or quote the captured patch to inspect it.' : selected.truncated ? 'Patch omitted: no complete hunk fits the capture limit.' : 'No text patch captured.'}</Text>}
            </Box>
          ) : <Text color={colors.muted}>Select a file after a change is captured.</Text>}
          <Box flexDirection="column" marginTop={1}>
            <Text bold color={colors.magenta}>Reported findings</Text>
            <Text color={colors.muted} wrap="wrap">{props.review.findings.length} reported{selected ? ` · ${selectedFindings.length} for this file` : ''}</Text>
            {findings.map(finding => (
              <Box key={`ops:finding:${finding.id}`} flexDirection="column" borderStyle="single" borderColor={colors.muted} paddingX={1} marginTop={1}>
                <Text bold wrap="wrap">{clip(finding.summary, 360)}</Text>
                <Text color={colors.muted} wrap="wrap">{clip(`${finding.path}${finding.line === undefined ? '' : `:${finding.line}`}`, 240)}</Text>
                <Text color={finding.outcome === 'fixed' ? colors.green : colors.yellow} wrap="wrap">{clip([finding.category, finding.verdict, finding.outcome].filter(Boolean).join(' · ') || 'Classification not reported', 180)}</Text>
              </Box>
            ))}
            {rankedFindings.length > findings.length && <Text color={colors.muted}>Showing {findings.length}/{rankedFindings.length}.</Text>}
          </Box>
          <Box flexDirection="column" marginTop={1}>
            <Text bold color={colors.cyan}>Observed checks</Text>
            <Text wrap="wrap">{props.review.checks.filter(check => check.status === 'running').length} running · {props.review.checks.filter(check => check.status === 'passed').length} passed · {props.review.checks.filter(check => check.status === 'failed').length} failed</Text>
            {checks.map(check => (
              <Box key={`ops:check:${check.id}`} flexDirection="column" marginTop={1}>
                <Text bold wrap="wrap">{clip(check.label, 160)}</Text>
                <Text color={statusColor(check.status)}>{check.status} · {check.durationMs === undefined ? 'duration unknown' : duration(check.durationMs)}</Text>
                <Text color={colors.muted} wrap="wrap">{check.passed === undefined && check.failed === undefined ? 'Pass/fail counts unknown' : `${count(check.passed)} passed · ${count(check.failed)} failed`}</Text>
              </Box>
            ))}
            {props.review.checks.length > checks.length && <Text color={colors.muted}>Showing the latest {checks.length}/{props.review.checks.length}.</Text>}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
