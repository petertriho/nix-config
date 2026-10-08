import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, Timer } from 'claude-code'
import type {
  CockpitActions, CockpitActivity, CockpitAgent, CockpitChange, CockpitCompaction, CockpitContext, CockpitFinding,
  CockpitPreferences, CockpitReactor, CockpitReview, CockpitTool, CockpitView, CockpitViewProps,
} from '../types'
import {
  agentResult, answerText, applyTaskResult, backgroundLaunch, backgroundSnapshot, cronSnapshot, detectCheck,
  endBackground, gitOperationOf, mergeAgents, mergeBackground, normalizeObservedChanges, parseGitDiff,
  parseGitStatus, summarizeCheck, todosOf, toolTarget, withSample,
} from './data'
import { bandSummary, renderAgents, renderChanges, renderTools } from './operations'
import { activityOf, contextOf, initialActivity, initialContext, initialReview, reviewOf } from './state'
import { clip, colors, humanize } from './theme'
import { renderContext, renderReactor } from './visuals'

const PANE = 'cockpit'
const STORE_KEY = 'preferences'
const VIEWS: CockpitView[] = ['agents', 'tools', 'changes', 'context', 'reactor']

const activity = atom({ plugin: 'cockpit', key: 'activity' } as const, initialActivity())
const review = atom({ plugin: 'cockpit', key: 'review' } as const, initialReview())
const context = atom({ plugin: 'cockpit', key: 'context' } as const, initialContext())
const preferences = atom({ plugin: 'cockpit', key: 'preferences' } as const, {
  view: 'agents', band: true, animation: true, paneOpen: false,
} satisfies CockpitPreferences)
const reactor = atom({ plugin: 'cockpit', key: 'reactor' } as const, {
  frame: 0, phase: 'idle',
} satisfies CockpitReactor)

// Session memory can hold an earlier version's shape. Every update reads it
// filled in, and an updater that returns its input writes nothing.
const normalized = <T,>(fill: (value: T) => T, change: (previous: T) => T) => (previous: T): T => {
  const current = fill(previous)
  const next = change(current)
  return next === current ? previous : next
}
const updateActivity = async ($: EngineInterface, change: (previous: CockpitActivity) => CockpitActivity): Promise<void> => {
  await update($, activity, normalized(activityOf, change))
}
const updateReview = async ($: EngineInterface, change: (previous: CockpitReview) => CockpitReview): Promise<void> => {
  await update($, review, normalized(reviewOf, change))
}
const updateContext = async ($: EngineInterface, change: (previous: CockpitContext) => CockpitContext): Promise<void> => {
  await update($, context, normalized(contextOf, change))
}

const errorText = (error: unknown): string =>
  clip(error instanceof Error ? error.message : 'The operation could not complete.', 240)

// The engine follows host capabilities only through functions in this module.
const observe = async ($: EngineInterface, work: () => Promise<unknown>): Promise<void> => {
  try {
    await work()
  } catch (error) {
    // Never replay or change the operation when its observation fails.
    $.ui.log(`cockpit: ${errorText(error)}`, { to: 'debug' })
  }
}

let initializing: Promise<string> | undefined

const ensureSession = async ($: EngineInterface): Promise<string> => {
  if (initializing !== undefined) {
    await initializing
    return ensureSession($)
  }
  const initialize = async (): Promise<string> => {
    const id = await $.session.id()
    const previous = await read($, activity)
    if (previous.sessionId === id) return id
    const model = await $.session.model()
    await update($, activity, (value): CockpitActivity => ({ ...initialActivity(), sessionId: id, model }))
    await update($, review, (value): CockpitReview => ({ ...initialReview(), sessionId: id }))
    await update($, context, (value): CockpitContext => ({ ...initialContext(), sessionId: id }))
    await update($, reactor, (): CockpitReactor => ({ frame: 0, phase: 'idle' }))
    return id
  }
  const pending = initialize()
  initializing = pending
  try {
    return await pending
  } finally {
    if (initializing === pending) initializing = undefined
  }
}

const resetSession = async ($: EngineInterface): Promise<void> => {
  await update($, activity, initialActivity)
  await update($, review, initialReview)
  await update($, context, initialContext)
  await update($, reactor, (): CockpitReactor => ({ frame: 0, phase: 'idle' }))
}

// Changes to tools, agents or the working flag also record the activity level.
const changeActivity = async (
  $: EngineInterface, sessionId: string, now: number,
  change: (previous: CockpitActivity) => CockpitActivity,
): Promise<void> => {
  await updateActivity($, (previous): CockpitActivity => {
    if (previous.sessionId !== sessionId) return previous
    const next = change(previous)
    return next === previous ? previous : withSample(next, now)
  })
}

const refreshAgents = async ($: EngineInterface): Promise<void> => {
  const id = await ensureSession($)
  try {
    const [incoming, now] = await Promise.all([$.agent.list(), $.clock.now()])
    await changeActivity($, id, now, previous => {
      const merged = mergeAgents(previous.agents, incoming, now)
      const identity = (list: typeof merged) => list.map(agent => ({ ...agent, lastSeenAt: 0 }))
      if (JSON.stringify(identity(previous.agents)) === JSON.stringify(identity(merged))) return previous
      return { ...previous, agents: merged, updatedAt: now, error: null }
    })
  } catch (error) {
    await updateActivity($, (previous): CockpitActivity =>
      previous.sessionId === id ? { ...previous, error: errorText(error) } : previous,
    )
  }
}

const refreshContext = async ($: EngineInterface): Promise<void> => {
  const id = await ensureSession($)
  await updateContext($, previous => ({ ...previous, loading: true, error: null }))
  try {
    const usage = await $.session.usage({ breakdown: 'summary', columns: 80 })
    const now = await $.clock.now()
    await updateContext($, (previous): CockpitContext => previous.sessionId === id
      ? { ...previous, usage, refreshedAt: now, loading: false, error: null } : previous)
  } catch (error) {
    await updateContext($, previous => previous.sessionId === id
      ? { ...previous, loading: false, error: errorText(error) } : previous)
  }
}

const relativePath = (root: string, path: string): string => {
  const prefix = `${root.replace(/\/$/, '')}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

const refreshChanges = async ($: EngineInterface): Promise<void> => {
  const id = await ensureSession($)
  await updateReview($, previous => ({ ...previous, loading: true, error: null }))
  try {
    const repo = await $.session.repo()
    if (repo === null) throw new Error('This session is not inside a Git repository.')
    const init = { cwd: repo.root, timeoutMs: 5000, env: { GIT_OPTIONAL_LOCKS: '0' } }
    const git = ['git', '--no-pager', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false']
    const diff = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames']
    const [status, branch, unstaged, staged] = await Promise.all([
      $.process.run([...git, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=normal'], init),
      $.process.run([...git, 'symbolic-ref', '--quiet', '--short', 'HEAD'], init),
      $.process.run([...git, ...diff], init),
      $.process.run([...git, ...diff, '--cached'], init),
    ])
    if (status.exitCode !== 0 || unstaged.exitCode !== 0 || staged.exitCode !== 0) {
      throw new Error('Git could not read the working tree. Check repository access.')
    }
    const now = await $.clock.now()
    const entries = parseGitStatus(status.stdout)
    const patches = [...parseGitDiff(unstaged.stdout, now), ...parseGitDiff(staged.stdout, now, true)]
    const truncated = unstaged.isStdoutTruncated || staged.isStdoutTruncated
    let remaining = 200000
    const changes: CockpitChange[] = entries.slice(0, 100).map(entry => {
      const matching = patches.filter(change => change.path === entry.path)
      const full = matching.map(change => change.patch).join('\n')
      const patch = full.slice(0, Math.max(0, Math.min(24000, remaining)))
      remaining -= patch.length
      return {
        path: entry.path, source: 'git', updatedAt: now, staged: entry.staged,
        untracked: entry.untracked, patch,
        additions: matching.reduce((total, change) => total + change.additions, 0),
        deletions: matching.reduce((total, change) => total + change.deletions, 0),
        truncated: Boolean(truncated || full.length > patch.length || matching.some(change => change.truncated)),
      }
    })
    await updateReview($, (previous): CockpitReview => {
      if (previous.sessionId !== id) return previous
      const selected = previous.selectedPath === null ? null : relativePath(repo.root, previous.selectedPath)
      return {
        ...previous, changes,
        selectedPath: changes.some(change => change.path === selected) ? selected : changes[0]?.path ?? null,
        branch: branch.exitCode === 0 ? branch.stdout.trim() : 'detached HEAD',
        root: repo.root, refreshedAt: now, loading: false,
        error: status.isStdoutTruncated || truncated ? 'Git output was truncated. Some changes are not shown.' : null,
      }
    })
  } catch (error) {
    await updateReview($, previous => previous.sessionId === id
      ? { ...previous, loading: false, error: errorText(error) } : previous)
  }
}

const rememberChange = async ($: EngineInterface, change: CockpitChange, sessionId: string): Promise<void> => {
  await updateReview($, (previous): CockpitReview => {
    if (previous.sessionId !== sessionId) return previous
    const path = previous.root === null ? change.path : relativePath(previous.root, change.path)
    const next = { ...change, path, patch: change.patch.slice(0, 24000) }
    const changes = [...previous.changes.filter(item => item.path !== path), next].slice(-100)
    let remaining = 200000
    const bounded = changes.reverse().map(item => {
      const patch = item.patch.slice(0, Math.max(0, remaining))
      remaining -= patch.length
      return { ...item, patch, truncated: item.truncated || patch.length !== item.patch.length }
    }).reverse()
    return { ...previous, changes: bounded, selectedPath: previous.selectedPath ?? path }
  })
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

const loadPreferences = async ($: EngineInterface): Promise<void> => {
  const saved = record(await $.store.get(STORE_KEY))
  if (saved === null) return
  await update($, preferences, previous => ({
    ...previous,
    view: VIEWS.includes(saved.view as CockpitView) ? saved.view as CockpitView : previous.view,
    band: typeof saved.band === 'boolean' ? saved.band : previous.band,
    animation: typeof saved.animation === 'boolean' ? saved.animation : previous.animation,
  }))
}

// $.state lasts one session. The store keeps the person's choices for the next.
const savePreferences = ($: EngineInterface): Promise<void> => observe($, async () => {
  const { view, band, animation } = await read($, preferences)
  await $.store.set(STORE_KEY, { view, band, animation })
})

const recordRunTime = async ($: EngineInterface, id: string, ms: number | undefined): Promise<void> => {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return
  await updateActivity($, (previous): CockpitActivity => previous.tools.some(tool => tool.id === id)
    ? { ...previous, tools: previous.tools.map(tool => tool.id === id ? { ...tool, runMs: Math.round(ms) } : tool) }
    : previous)
}

const recordBackground = async (
  $: EngineInterface, tasks: unknown, crons: unknown, endedAgent?: string,
): Promise<void> => {
  const id = await ensureSession($)
  const now = await $.clock.now()
  await updateActivity($, (previous): CockpitActivity => {
    if (previous.sessionId !== id) return previous
    const snapshot = Array.isArray(tasks)
    let background = snapshot ? mergeBackground(previous.background, backgroundSnapshot(tasks, now), now) : previous.background
    if (endedAgent !== undefined) background = endBackground(background, endedAgent, 'completed', now)
    return {
      ...previous, background,
      crons: Array.isArray(crons) ? cronSnapshot(crons) : previous.crons,
      backgroundAt: snapshot ? now : previous.backgroundAt,
    }
  })
}

const selectView = async ($: EngineInterface, view: CockpitView): Promise<void> => {
  await ensureSession($)
  await update($, preferences, previous => ({ ...previous, view }))
  await savePreferences($)
  if (view === 'agents' || view === 'tools') await refreshAgents($)
  if (view === 'changes') await refreshChanges($)
  if (view === 'context') await refreshContext($)
}

const openCockpit = async ($: EngineInterface, view?: CockpitView): Promise<void> => {
  await ensureSession($)
  if (view !== undefined) await selectView($, view)
  const opened = await $.ui.open({ id: PANE, title: 'Cockpit', focus: true, closeOnEscape: true, rows: 24, columns: 58 })
  if (!opened.isPlaced) $.ui.toast('Cockpit is waiting for a surface with enough room.')
  await update($, preferences, previous => ({ ...previous, paneOpen: true }))
}

const actionsFor = ($: EngineInterface, surface: RenderSurface, viewedAgent: string | null): CockpitActions => {
  const patchFor = async (path: string): Promise<string | null> => {
    const state = await read($, review)
    const patch = state.changes.find(change => change.path === path)?.patch
    if (!patch) { $.ui.toast('No patch is available for this file.'); return null }
    return patch
  }
  return {
    selectView: view => selectView($, view),
    refreshAgents: () => refreshAgents($),
    selectAgent: async id => {
      await updateActivity($, previous => ({ ...previous, selectedAgent: id, selectedFor: viewedAgent }))
    },
    selectTool: async id => { await updateActivity($, previous => ({ ...previous, selectedTool: id })) },
    refreshChanges: () => refreshChanges($),
    selectChange: async path => { await updateReview($, previous => ({ ...previous, selectedPath: path })) },
    copyPatch: async path => {
      const patch = await patchFor(path)
      if (patch !== null) {
        const copied = await $.ui.copy({ text: patch, surface })
        $.ui.toast(copied.isCopied ? 'Patch copied.' : 'Clipboard access is not available on this surface.')
      }
    },
    quotePatch: async path => {
      const patch = await patchFor(path)
      if (patch !== null) {
        const longest = Math.max(2, ...(patch.match(/`+/g) ?? []).map(run => run.length))
        const fence = '`'.repeat(longest + 1)
        const filled = await $.prompt.fill({ text: `\n${fence}diff\n${patch}\n${fence}\n`, mode: 'append' })
        $.ui.toast(filled.isFilled ? 'Patch added to the draft. Nothing was submitted.' : 'The prompt cannot accept a draft right now.')
      }
    },
    refreshContext: () => refreshContext($),
    toggleAnimation: async () => {
      await update($, preferences, previous => ({ ...previous, animation: !previous.animation }))
      await savePreferences($)
    },
  }
}

const viewLabels: Record<CockpitView, string> = {
  agents: 'Agents',
  tools: 'Tools',
  changes: 'Changes',
  context: 'Context',
  reactor: 'Reactor',
}

let timer: Timer | undefined
let ticking = false
let lastAgentRefresh = 0

const startTimer = ($: EngineInterface) => {
    if (timer !== undefined) return
    timer = $.clock.every(250, async () => {
      if (ticking) return
      ticking = true
      try {
        const prefs = await read($, preferences)
        if (!prefs.paneOpen) return
        const pane = (await $.ui.panes()).find(item => item.id === PANE)
        if (!pane?.isPlaced || !pane.isShown) return
        await ensureSession($)
        const now = await $.clock.now()
        if (now - lastAgentRefresh >= 2000) {
          lastAgentRefresh = now
          await refreshAgents($)
        }
        const state = await read($, activity)
        if (prefs.view === 'reactor' && prefs.animation) {
          const running = state.tools.filter(tool => tool.outcome === 'running').length
          const agents = state.agents.filter(agent => agent.status === 'running').length
          const phase = running > 0 ? 'tools' : state.working || agents > 0 ? 'thinking' : state.phase
          await update($, reactor, (previous): CockpitReactor => ({ frame: (previous.frame + 1) % 1000000, phase }))
        } else if (state.tools.some(tool => tool.outcome === 'running')) {
          $.ui.invalidate('ui.render')
        }
      } catch (error) {
        $.ui.log(`cockpit timer: ${errorText(error)}`, { to: 'debug' })
      } finally {
        ticking = false
      }
    })
  }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // A store that cannot be read leaves the defaults and skips nothing else.
    await observe($, () => loadPreferences($))
    await observe($, async () => {
      await ensureSession($)
      await $.command.register({
        name: 'cockpit',
        description: 'Open agent, tool, review, context, or reactor views.',
        argumentHint: '[agents|tools|changes|context|reactor|band|close]',
        immediate: true,
      })
      await refreshAgents($)
      const id = await $.session.id()
      const usage = await $.session.usage()
      await updateContext($, (previous): CockpitContext => previous.sessionId === id ? { ...previous, usage } : previous)
      if (e.isInteractive) startTimer($)
    })
    return result
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    await observe($, async () => {
      await resetSession($)
      if (e.reason !== 'clear' && e.reason !== 'resume') {
        timer?.cancel()
        timer = undefined
        await update($, preferences, previous => ({ ...previous, paneOpen: false }))
      }
    })
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    try {
      const args = e.args.trim()
      const cut = args.search(/\s/)
      const command = cut < 0 ? args : args.slice(0, cut)
      const tail = cut < 0 ? '' : args.slice(cut).trim()
      if (command === 'help') {
        return { text: '/cockpit [agents|tools|changes|context|reactor]\n/cockpit band [on|off]\n/cockpit close' }
      }
      if (command === 'close') {
        await $.ui.close({ id: PANE })
        await update($, preferences, previous => ({ ...previous, paneOpen: false }))
        return { text: 'Cockpit closed.' }
      }
      if (command === 'band') {
        if (tail !== '' && tail !== 'on' && tail !== 'off') {
          return { text: 'Use /cockpit band [on|off].', exitCode: 1 }
        }
        await update($, preferences, previous => ({
          ...previous,
          band: tail === '' ? !previous.band : tail === 'on',
        }))
        await savePreferences($)
        const prefs = await read($, preferences)
        return { text: `Cockpit band ${prefs.band ? 'enabled' : 'hidden'}.` }
      }
      if (command !== '' && !VIEWS.includes(command as CockpitView)) {
        return { text: 'Unknown cockpit view. Use /cockpit help.', exitCode: 1 }
      }
      if (tail !== '') {
        return { text: 'Cockpit views take no arguments. Use /cockpit help.', exitCode: 1 }
      }
      await openCockpit($, command === '' ? undefined : command as CockpitView)
      startTimer($)
      return { text: 'Cockpit opened. Use the view buttons or /cockpit help.' }
    } catch (error) {
      return { text: `Cockpit: ${errorText(error)}`, exitCode: 1 }
    }
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE && !('deny' in result)) {
      await observe($, () => update($, preferences, previous => ({ ...previous, paneOpen: false })))
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await observe($, async () => {
      const id = await ensureSession($)
      const now = await $.clock.now()
      await changeActivity($, id, now, previous => ({
        ...previous, working: true, phase: 'thinking', stopFailure: null, updatedAt: now,
      }))
    })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    let sessionId: string | undefined
    await observe($, async () => {
      sessionId = await ensureSession($)
      if (e.agentId === undefined) {
        await updateActivity($, (previous): CockpitActivity => ({ ...previous, model: e.model, phase: 'thinking' }))
      }
    })
    const result = yield* next(e)
    await observe($, async () => {
      if (sessionId === undefined || await $.session.id() !== sessionId) return
      const now = await $.clock.now()
      const retrospective: CockpitTool[] = (result.serverToolUses ?? []).map(tool => ({
        id: tool.id,
        tool: tool.name,
        agentId: e.agentId,
        startedAt: tool.startedAt,
        finishedAt: tool.endedAt ?? now,
        outcome: tool.endedAt === undefined ? 'interrupted' : 'success',
        retrospective: true,
      }))
      if (retrospective.length > 0) {
        await updateActivity($, (previous): CockpitActivity => ({
          ...previous,
          tools: [...previous.tools.filter(tool => !retrospective.some(server => server.id === tool.id)), ...retrospective].slice(-200),
          updatedAt: now,
        }))
      }
    })
    return result
  }).catch(async function* ($, e, next) { return yield* next(e) })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await observe($, () => refreshAgents($))
    return result
  }).catch(($, e, next) => next(e))

  on('session.receive', async ($, e, next) => {
    const result = await next(e)
    await observe($, () => refreshAgents($))
    return result
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    const id = e.tool_use_id
    // A query from $.tool.check has no call id and decides nothing that runs.
    if (result.decision === 'ask' && id !== undefined) {
      await observe($, () => updateActivity($, (previous): CockpitActivity => ({
        ...previous,
        tools: previous.tools.map(tool => tool.id === id ? { ...tool, approval: 'asked' } : tool),
      })))
    }
    return result
  }).catch(($, e, next) => next(e))

  // PostToolUse is the only source of execution time without the permission
  // prompt. No event marks the moment a person answers the prompt.
  on('classic.PostToolUse', async ($, e, next) => {
    const result = await next(e)
    await observe($, () => recordRunTime($, e.tool_use_id, e.duration_ms))
    return result
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUseFailure', async ($, e, next) => {
    const result = await next(e)
    await observe($, () => recordRunTime($, e.tool_use_id, e.duration_ms))
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    let sessionId: string | undefined
    let startedAt = 0
    const checkLabel = e.tool === 'Bash' && typeof e.command === 'string' ? detectCheck(e.command) : undefined
    await observe($, async () => {
      sessionId = await ensureSession($)
      startedAt = await $.clock.now()
      const tool: CockpitTool = {
        id: e.tool_use_id,
        tool: e.tool,
        agentId: e.agentId,
        target: toolTarget(e.tool, e),
        startedAt,
        outcome: 'running',
      }
      await changeActivity($, sessionId, startedAt, previous => ({
        ...previous,
        tools: [...previous.tools.filter(item => item.id !== tool.id), tool].slice(-200),
        phase: 'tools',
        updatedAt: startedAt,
      }))
      if (checkLabel !== undefined) {
        await updateReview($, (previous): CockpitReview => ({
          ...previous,
          checks: [...previous.checks.filter(check => check.id !== tool.id), { id: tool.id, label: checkLabel, status: 'running' as const }].slice(-40),
        }))
      }
    })
    try {
      const result = await next(e)
      await observe($, async () => {
        if (sessionId === undefined || await $.session.id() !== sessionId) return
        const id = sessionId
        const now = await $.clock.now()
        const output = record(result.result)
        const outcome: CockpitTool['outcome'] = result.deny ? 'denied' : result.isError ? 'error' : output?.interrupted === true ? 'interrupted' : 'success'
        const succeeded = !result.isError && !result.deny
        const todos = succeeded && e.tool === 'TodoWrite' ? todosOf(result) : undefined
        const launch = succeeded ? backgroundLaunch(e.tool, e, result, now) : undefined
        const stopped = succeeded && e.tool === 'TaskStop' && typeof output?.task_id === 'string' ? output.task_id : undefined
        const finished = succeeded && e.tool === 'Agent' ? agentResult(result) : undefined
        const spawned: CockpitAgent | undefined = finished && e.tool === 'Agent' ? {
          id: finished.agentId,
          name: typeof e.name === 'string' ? clip(e.name, 80) : undefined,
          description: clip(e.description, 240),
          type: clip(e.subagent_type ?? 'general-purpose', 80),
          status: 'completed',
          lastSeenAt: now,
          completedAt: now,
        } : undefined
        await changeActivity($, id, now, previous => {
          const tools = previous.tools.map(tool => tool.id === e.tool_use_id ? { ...tool, outcome, finishedAt: now } : tool)
          const phase = tools.some(tool => tool.outcome === 'running') ? 'tools' : previous.working ? 'thinking' : outcome === 'error' ? 'error' : 'idle'
          const tasks = succeeded ? applyTaskResult(previous.tasks, e.tool, e, result) : undefined
          let background = launch ? [...previous.background.filter(task => task.id !== launch.id), launch].slice(-40) : previous.background
          if (stopped !== undefined) background = endBackground(background, stopped, 'stopped', now)
          // An agent can leave the roster before a refresh lists it. Keep its report anyway.
          const agents = finished === undefined ? previous.agents
            : previous.agents.some(agent => agent.id === finished.agentId)
              ? previous.agents.map(agent => agent.id === finished.agentId
                ? { ...agent, totals: finished.totals, answer: finished.answer ?? agent.answer } : agent)
              : spawned ? [...previous.agents, { ...spawned, totals: finished.totals, answer: finished.answer }].slice(-100) : previous.agents
          return {
            ...previous, tools, phase, agents, background,
            tasks: tasks ?? previous.tasks,
            todos: todos === undefined ? previous.todos : [
              ...previous.todos.filter(list => list.agentId !== e.agentId),
              { agentId: e.agentId, items: todos, updatedAt: now },
            ].slice(-20),
            updatedAt: now,
          }
        })
        if (checkLabel !== undefined) {
          // Prefer the execution time, which leaves out a permission prompt.
          const runMs = (await read($, activity)).tools.find(tool => tool.id === e.tool_use_id)?.runMs
          const check = summarizeCheck(e.tool_use_id, checkLabel, result, { error: result.isError, denied: result.deny !== undefined }, runMs ?? Math.max(0, now - startedAt))
          await updateReview($, (previous): CockpitReview => previous.sessionId === id ? {
            ...previous,
            checks: [...previous.checks.filter(item => item.id !== check.id), { ...check, finishedAt: now }].slice(-40),
          } : previous)
        }
        if (succeeded) {
          const changes = normalizeObservedChanges(e.tool, e, result, now)
          if ((e.tool === 'Edit' || e.tool === 'Write') && changes.length === 0
            && typeof output?.filePath === 'string' && output.staged !== true) {
            changes.push({ path: output.filePath, patch: '', additions: 0, deletions: 0, source: 'observed', updatedAt: now })
          }
          for (const change of changes) await rememberChange($, change, id)
        }
        const gitOp = succeeded && e.tool === 'Bash' ? gitOperationOf(e.tool_use_id, result, now) : undefined
        if (gitOp !== undefined) {
          await updateReview($, (previous): CockpitReview => previous.sessionId === id
            ? { ...previous, gitOps: [...previous.gitOps.filter(item => item.id !== gitOp.id), gitOp].slice(-30) } : previous)
        }
        if (succeeded && e.tool === 'ReportFindings' && Array.isArray(e.findings)) {
          const findings: CockpitFinding[] = e.findings.flatMap((value, index) => {
            const finding = record(value)
            if (finding === null || typeof finding.file !== 'string' || typeof finding.summary !== 'string') return []
            return [{
              id: `${e.tool_use_id}:${index}`,
              path: finding.file,
              summary: clip(finding.summary, 1000),
              line: typeof finding.line === 'number' && finding.line > 0 ? finding.line : undefined,
              category: typeof finding.category === 'string' ? clip(finding.category, 40) : undefined,
              verdict: typeof finding.verdict === 'string' ? clip(finding.verdict, 40) : undefined,
              outcome: typeof finding.outcome === 'string' ? clip(finding.outcome, 40) : undefined,
            }]
          })
          await updateReview($, (previous): CockpitReview => previous.sessionId === id
            ? { ...previous, findings: [...previous.findings, ...findings].slice(-100) } : previous)
        }
        if (e.tool === 'Agent' || e.agentId !== undefined) await refreshAgents($)
      })
      return result
    } catch (error) {
      await observe($, async () => {
        if (sessionId === undefined) return
        const now = await $.clock.now()
        await changeActivity($, sessionId, now, previous => ({
          ...previous,
          tools: previous.tools.map(tool => tool.id === e.tool_use_id ? { ...tool, outcome: 'error', finishedAt: now } : tool),
          phase: 'error',
          updatedAt: now,
        }))
      })
      throw error
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    let id: string | undefined
    await observe($, async () => { id = await ensureSession($) })
    const result = await next(e)
    await observe($, async () => {
      if (id === undefined || await $.session.id() !== id) return
      const now = await $.clock.now()
      await changeActivity($, id, now, previous => ({
        ...previous,
        turns: [...previous.turns.filter(turn => turn.id !== e.turnId), {
          id: e.turnId,
          agentId: e.agentId,
          durationMs: e.durationMs,
          reason: e.reason,
          finishedAt: now,
          usage: e.usage,
        }].slice(-100),
        working: e.agentId === undefined ? false : previous.working,
        phase: e.agentId === undefined ? e.reason === 'error' ? 'error' : 'idle' : previous.phase,
        agents: previous.agents.map(agent => agent.id === e.agentId ? {
          ...agent,
          completedAt: now,
          durationMs: e.durationMs,
          usage: e.usage,
          answer: answerText(e.answer) ?? agent.answer,
        } : agent),
        updatedAt: now,
      }))
      await refreshAgents($)
    })
    return result
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    await observe($, () => recordBackground($, e.background_tasks, e.session_crons))
    return result
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    await observe($, async () => {
      await recordBackground($, e.background_tasks, e.session_crons, e.agent_id)
      const answer = answerText(e.last_assistant_message)
      if (answer !== undefined) {
        await updateActivity($, (previous): CockpitActivity => ({
          ...previous,
          agents: previous.agents.map(agent => agent.id === e.agent_id && agent.answer === undefined ? { ...agent, answer } : agent),
        }))
      }
    })
    return result
  }).catch(($, e, next) => next(e))

  on('classic.StopFailure', async ($, e, next) => {
    const result = await next(e)
    // A subagent's failure reaches its spawner as a tool error.
    if (e.agent_id === undefined) {
      await observe($, async () => {
        const id = await ensureSession($)
        const now = await $.clock.now()
        await changeActivity($, id, now, previous => ({
          ...previous,
          stopFailure: { error: e.error, details: e.error_details ? clip(e.error_details, 240) : undefined, at: now },
          working: false,
          phase: 'error',
          updatedAt: now,
        }))
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    // A precompute installs nothing. Its result waits for a later compaction.
    if (e.trigger !== 'precompute') {
      await observe($, async () => {
        const id = await ensureSession($)
        const now = await $.clock.now()
        const entry: CockpitCompaction = result.skip !== undefined
          ? { at: now, trigger: e.trigger, agentId: e.agentId, skipped: clip(result.skip, 240) }
          : { at: now, trigger: e.trigger, agentId: e.agentId, tokensBefore: result.tokensBefore, tokensAfter: result.tokensAfter }
        await updateContext($, (previous): CockpitContext => previous.sessionId === id
          ? { ...previous, compactions: [...previous.compactions, entry].slice(-20) } : previous)
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await observe($, async () => {
      const id = await ensureSession($)
      const now = await $.clock.now()
      const usd = e.cost?.usd
      await updateContext($, (previous): CockpitContext => previous.sessionId === id ? {
        ...previous,
        usage: {
          startedAt: previous.usage?.startedAt ?? now,
          context: { ...e.context, breakdown: previous.usage?.context.breakdown },
          rateLimits: e.rateLimits,
          cost: e.cost,
        },
        costs: usd !== undefined && Number.isFinite(usd) && previous.costs.at(-1)?.usd !== usd
          ? [...previous.costs, { at: now, usd }].slice(-100) : previous.costs,
      } : previous)
    })
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const prefs = await read($, preferences)
    if (e.props.hasSurvey || !prefs.band || e.props.maxRows < 1) return next(e)
    const state = activityOf(await read($, activity))
    const { Box, Text, Button } = $.ui.resolve(e)
    const summary = bandSummary(state, { isWorking: e.props.isWorking, columns: e.props.bodyColumns })
    const base = await next(e)
    return (
      <Box flexDirection="column">
        {base}
        <Box gap={1}>
          <Button key="cockpit-open" label="◉ cockpit" onPress={() => { void observe($, () => openCockpit($)) }} />
          <Text color={summary.color}>{clip(summary.text, Math.max(8, e.props.bodyColumns - 13))}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [stored, r, c, storedPrefs, animation, now] = await Promise.all([
      read($, activity), read($, review), read($, context), read($, preferences),
      read($, reactor), $.clock.now(),
    ])
    // Hot reload keeps session memory, which an earlier version can have shaped.
    const a = activityOf(stored)
    const prefs = VIEWS.includes(storedPrefs.view) ? storedPrefs : { ...storedPrefs, view: 'agents' as const }
    const viewedAgent = e.props.view.agentId ?? null
    // Follow the transcript in view until the person chooses while viewing it.
    const selectedAgent = viewedAgent !== null && viewedAgent !== a.selectedFor ? viewedAgent : a.selectedAgent
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const props: CockpitViewProps = {
      activity: { ...a, selectedAgent },
      review: reviewOf(r),
      context: contextOf(c),
      preferences: prefs,
      reactor: animation,
      actions: actionsFor($, e.surface, viewedAgent),
      viewedAgent,
      columns: Math.max(12, e.props.bodyColumns),
      rows: Math.max(6, e.props.scroll.bodyRows - 5),
      now,
    }
    const content = prefs.view === 'agents' ? renderAgents(ui, props)
      : prefs.view === 'tools' ? renderTools(ui, props)
      : prefs.view === 'changes' ? renderChanges(ui, props)
      : prefs.view === 'context' ? renderContext(ui, props)
      : renderReactor(ui, props)
    const failure = a.stopFailure
    // No backgroundColor: the dock paints its own theme fill, and a plugin cannot
    // paint the terminal's default background over it.
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color={colors.accent}>COCKPIT <Text dimColor> / {viewLabels[prefs.view]}</Text></Text>
        {failure && <Text color={colors.red} wrap="wrap">{clip(`Last turn stopped: ${humanize(failure.error)}${failure.details ? ` · ${failure.details}` : ''}`, 320)}</Text>}
        <Box flexWrap="wrap" gap={1}>
          {VIEWS.map((view, index) => (
            <Button key={`view-${view}`} label={`${prefs.view === view ? '● ' : ''}${viewLabels[view]}`}
              hotkey={String(index + 1) as '1' | '2' | '3' | '4' | '5'}
              onPress={() => props.actions.selectView(view)} />
          ))}
        </Box>
        {content}
        <Text dimColor>{clip('Read-only · Ctrl+X Tab focuses · 1–5 switch · Esc closes', props.columns)}</Text>
      </Box>
    )
  })
}
