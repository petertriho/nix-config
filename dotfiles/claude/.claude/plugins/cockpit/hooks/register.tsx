import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, Timer } from 'claude-code'
import type {
  CockpitActions, CockpitActivity, CockpitAgent, CockpitChange, CockpitCompaction, CockpitContext, CockpitFinding,
  CockpitMascot, CockpitPreferences, CockpitPulse, CockpitReview, CockpitSpan, CockpitStopFailure, CockpitTool, CockpitView,
  CockpitViewProps,
} from '../types'
import { renderActivity, SPAN_ORDER } from './activity'
import { renderAgents } from './agents'
import { renderChanges } from './changes'
import { renderContext } from './context'
import {
  agentResult, answerText, applyCronResult, applyTaskResult, backgroundLaunch, changeState, detectCheck, endBackground,
  endedStatus, firedCrons, gitOperationOf, mergeAgents, normalizeObservedChanges, parseGitDiff, parseGitStatus,
  summarizeCheck, todosOf, toolTarget, withSample,
} from './data'
import { line, paneFooter, tabMark, tabRows } from './layout'
import { activityOf, contextOf, initialActivity, initialContext, initialReview, reviewOf } from './state'
import type { Segment } from './summary'
import {
  bandRows, changeTotals, contextColor, contextFill, isLive, mainTurns, runningTools, sessionStart, sessionStatus,
} from './summary'
import { brief, clip, colors, humanize, meter, percent, shortModel, usd } from './theme'
import { renderTools } from './tools'

const PANE = 'cockpit'
const STORE_KEY = 'preferences'
const VIEWS: CockpitView[] = ['agents', 'tools', 'changes', 'context', 'activity']

const activity = atom({ plugin: 'cockpit', key: 'activity' } as const, initialActivity())
const review = atom({ plugin: 'cockpit', key: 'review' } as const, initialReview())
const context = atom({ plugin: 'cockpit', key: 'context' } as const, initialContext())
const preferences = atom({ plugin: 'cockpit', key: 'preferences' } as const, {
  view: 'agents', band: true, animation: true, span: 'fit', paneOpen: false,
} satisfies CockpitPreferences)
const mascot = atom({ plugin: 'cockpit', key: 'mascot' } as const, {
  frame: 0, phase: 'idle',
} satisfies CockpitMascot)
const pulse = atom({ plugin: 'cockpit', key: 'pulse' } as const, { frame: 0 } satisfies CockpitPulse)

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
    await update($, mascot, (): CockpitMascot => ({ frame: 0, phase: 'idle' }))
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
  await update($, mascot, (): CockpitMascot => ({ frame: 0, phase: 'idle' }))
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
        untracked: entry.untracked, patch, state: changeState(entry.status),
        additions: matching.reduce((total, change) => total + change.additions, 0),
        deletions: matching.reduce((total, change) => total + change.deletions, 0),
        truncated: Boolean(truncated || full.length > patch.length || matching.some(change => change.truncated)),
      }
    })
    await updateReview($, (previous): CockpitReview => {
      if (previous.sessionId !== id) return previous
      const selected = previous.selectedPath === null ? null : relativePath(repo.root, previous.selectedPath)
      // Git knows the state. The session knows who edited the file and how often.
      const history = new Map(previous.changes.map(change => [relativePath(repo.root, change.path), change]))
      return {
        ...previous,
        changes: changes.map(change => {
          const prior = history.get(change.path)
          return prior ? { ...change, edits: prior.edits, agentId: prior.agentId } : change
        }),
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
    const prior = previous.changes.find(item => item.path === path)
    const next = {
      ...change, path, patch: change.patch.slice(0, 24000),
      edits: (prior?.edits ?? 0) + 1, agentId: change.agentId,
      ...(prior?.state === undefined ? {} : { state: prior.state, staged: prior.staged }),
    }
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
  // The activity view replaced the reactor; a saved reactor choice opens it.
  const view = saved.view === 'reactor' ? 'activity' : saved.view
  await update($, preferences, previous => ({
    ...previous,
    view: VIEWS.includes(view as CockpitView) ? view as CockpitView : previous.view,
    band: typeof saved.band === 'boolean' ? saved.band : previous.band,
    animation: typeof saved.animation === 'boolean' ? saved.animation : previous.animation,
    span: SPAN_ORDER.includes(saved.span as CockpitSpan) ? saved.span as CockpitSpan : previous.span,
  }))
}

// $.state lasts one session. The store keeps the person's choices for the next.
const savePreferences = ($: EngineInterface): Promise<void> => observe($, async () => {
  const { view, band, animation, span } = await read($, preferences)
  await $.store.set(STORE_KEY, { view, band, animation, span })
})

const recordTaskEnd = async ($: EngineInterface, id: string, status: string): Promise<void> => {
  const [sessionId, now] = await Promise.all([$.session.id(), $.clock.now()])
  await updateActivity($, (previous): CockpitActivity => {
    if (previous.sessionId !== sessionId) return previous
    const background = endBackground(previous.background, id, status, now)
    return background === previous.background ? previous : { ...previous, background }
  })
}

// Only the classic StopFailure hook names the kind of API error, and a managed
// security plugin keeps classic hooks from installed plugins. The transcript
// ends with the engine's message for the error.
const turnFailure = async ($: EngineInterface, now: number): Promise<CockpitStopFailure> => {
  const last = (await $.session.messages().catch(() => [])).at(-1)
  const details = last?.role === 'assistant' ? last.text.trim() : ''
  return { error: 'API error', details: details === '' ? undefined : clip(details, 240), at: now }
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
    copyPath: async path => {
      if (path === '') return
      // An edit seen before the first Git read keeps the absolute path the tool reported.
      const root = (await read($, review)).root ?? (await $.session.repo())?.root ?? null
      const relative = root === null ? path : relativePath(root, path)
      const copied = await $.ui.copy({ text: relative, surface })
      if (!copied.isCopied) $.ui.toast('Clipboard access is not available on this surface.')
      else $.ui.toast(relative.startsWith('/') ? 'The file is outside the repository. Its full path was copied.' : `Copied ${clip(relative, 60)}.`)
    },
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
    cycleSpan: async () => {
      await update($, preferences, previous => ({
        ...previous, span: SPAN_ORDER[(SPAN_ORDER.indexOf(previous.span) + 1) % SPAN_ORDER.length] ?? 'fit',
      }))
      await savePreferences($)
    },
  }
}

const viewLabels: Record<CockpitView, string> = {
  agents: 'Agents',
  tools: 'Tools',
  changes: 'Changes',
  context: 'Context',
  activity: 'Activity',
}

let timer: Timer | undefined
let ticking = false
let tick = 0
let lastAgentRefresh = 0

/** What the cat acts out: tools first, then a working turn or a live agent. */
const mascotPhase = (state: CockpitActivity): CockpitActivity['phase'] =>
  state.tools.some(tool => tool.outcome === 'running') ? 'tools'
    : state.working || state.agents.some(agent => agent.status === 'running') ? 'thinking'
    : state.phase

// Four ticks a second: the cat's frames while the activity view shows, and the
// band spinner while work runs. Elapsed times redraw once a second while work
// runs, in the band as well as the pane.
const startTimer = ($: EngineInterface) => {
  if (timer !== undefined) return
  timer = $.clock.every(250, async () => {
    if (ticking) return
    ticking = true
    tick = (tick + 1) % 1000000
    try {
      const prefs = await read($, preferences)
      const pane = prefs.paneOpen ? (await $.ui.panes()).find(item => item.id === PANE) : undefined
      const shown = pane?.isPlaced === true && pane.isShown
      const state = await read($, activity)
      const busy = state.working || state.tools.some(tool => tool.outcome === 'running')
        || state.agents.some(agent => agent.status === 'running')
      const spinning = busy && prefs.band && prefs.animation
      if (!shown && !spinning && tick % 4 !== 0) return
      if (spinning) await update($, pulse, (previous): CockpitPulse => ({ frame: ((previous?.frame ?? 0) + 1) % 1000000 }))
      if (shown) {
        await ensureSession($)
        const now = await $.clock.now()
        if (now - lastAgentRefresh >= 2000) {
          lastAgentRefresh = now
          await refreshAgents($)
        }
      }
      if (shown && prefs.view === 'activity' && prefs.animation) {
        await update($, mascot, (previous): CockpitMascot => ({ frame: (previous.frame + 1) % 1000000, phase: mascotPhase(state) }))
      }
      if (busy && tick % 4 === 0) $.ui.invalidate('ui.render')
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
        description: 'Open agent, tool, change, context, or activity views.',
        argumentHint: '[agents|tools|changes|context|activity|band|close]',
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
        return { text: [
          '/cockpit [agents|tools|changes|context|activity]', '/cockpit band [on|off]', '/cockpit close', '',
          'Ctrl+X Tab focuses the pane. Then Ctrl+X ← or → resizes a docked pane, and Ctrl+X ↑ or ↓ a pane above the prompt.',
        ].join('\n') }
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
      const view = command === 'reactor' ? 'activity' : command
      if (view !== '' && !VIEWS.includes(view as CockpitView)) {
        return { text: 'Unknown cockpit view. Use /cockpit help.', exitCode: 1 }
      }
      if (tail !== '') {
        return { text: 'Cockpit views take no arguments. Use /cockpit help.', exitCode: 1 }
      }
      await openCockpit($, view === '' ? undefined : view as CockpitView)
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
        ...previous, working: true, turnStartedAt: now, phase: 'thinking', stopFailure: null, updatedAt: now,
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
          startedAt,
          lastSeenAt: now,
          completedAt: now,
        } : undefined
        await changeActivity($, id, now, previous => {
          const tools = previous.tools.map(tool => tool.id === e.tool_use_id ? { ...tool, outcome, finishedAt: now } : tool)
          const phase = tools.some(tool => tool.outcome === 'running') ? 'tools' : previous.working ? 'thinking' : outcome === 'error' ? 'error' : 'idle'
          const tasks = succeeded ? applyTaskResult(previous.tasks, e.tool, e, result) : undefined
          const crons = succeeded ? applyCronResult(previous.crons, e.tool, e, result) : undefined
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
            crons: crons ?? previous.crons,
            todos: todos === undefined ? previous.todos : [
              ...previous.todos.filter(list => list.agentId !== e.agentId),
              { agentId: e.agentId, items: todos, updatedAt: now },
            ].slice(-20),
            updatedAt: now,
          }
        })
        if (checkLabel !== undefined) {
          const check = summarizeCheck(e.tool_use_id, checkLabel, result, { error: result.isError, denied: result.deny !== undefined }, Math.max(0, now - startedAt))
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
          for (const change of changes) await rememberChange($, { ...change, agentId: e.agentId }, id)
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
      // A subagent's failure reaches its spawner as a tool error.
      const failure = e.agentId === undefined && e.reason === 'error' ? await turnFailure($, now) : null
      const ended = e.reason === 'answer' ? 'completed' : e.reason === 'aborted' ? 'killed' : 'failed'
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
        turnStartedAt: e.agentId === undefined ? null : previous.turnStartedAt,
        phase: e.agentId === undefined ? e.reason === 'error' ? 'error' : 'idle' : previous.phase,
        stopFailure: failure ?? previous.stopFailure,
        background: e.agentId === undefined ? previous.background : endBackground(previous.background, e.agentId, ended, now),
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

  // A firing does not name its cron. A one-shot cron is known by its prompt.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'scheduled-trigger') {
      await observe($, async () => {
        const id = await ensureSession($)
        const now = await $.clock.now()
        await updateActivity($, (previous): CockpitActivity => {
          if (previous.sessionId !== id) return previous
          const crons = firedCrons(previous.crons, e.text, now)
          return crons === previous.crons ? previous : { ...previous, crons }
        })
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Outside the classic Stop hook, the notification row is the only report of
  // how a background task ended. A drawing never writes, so a timer records it,
  // and the hook reads no state, so later writes do not redraw the row.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'task-notification' } } }, async ($, e, next) => {
    const id = e.props.task?.id
    const status = endedStatus(e.props.task?.status)
    if (id !== undefined && status !== undefined) $.clock.after(0, () => { void observe($, () => recordTaskEnd($, id, status)) })
    return next(e)
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
      const fill = e.context.tokens
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
        fills: fill !== undefined && Number.isFinite(fill) && previous.fills.at(-1)?.tokens !== fill
          ? [...previous.fills, { at: now, tokens: fill }].slice(-100) : previous.fills,
      } : previous)
    })
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const prefs = await read($, preferences)
    if (e.props.hasSurvey || !prefs.band || e.props.maxRows < 1) return next(e)
    const [stored, r, c, beat, now] = await Promise.all([
      read($, activity), read($, review), read($, context), read($, pulse), $.clock.now(),
    ])
    const ui = $.ui.resolve(e)
    const { Box, Button } = ui
    const frame = beat?.frame
    // The plain one-glyph button and the gap after it take two columns.
    const rows = bandRows(activityOf(stored), reviewOf(r), contextOf(c), {
      isWorking: e.props.isWorking, columns: e.props.bodyColumns - 2, now, agentId: e.props.view.agentId,
      frame: prefs.animation && typeof frame === 'number' && Number.isFinite(frame) ? frame : undefined,
    }).slice(0, e.props.maxRows)
    const base = await next(e)
    return (
      <Box flexDirection="column">
        {base}
        <Box flexDirection="row" columnGap={1}>
          <Button key="cockpit-open" plain label="◉" onPress={() => { void observe($, () => openCockpit($)) }} />
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            {rows.map((row, index) => (
              <Box key={`cockpit-band:${index}`} flexDirection="row" justifyContent="space-between">
                {line(ui, `cockpit-band:${index}:start`, row.start)}
                {row.end.length > 0 ? line(ui, `cockpit-band:${index}:end`, row.end) : null}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [stored, r, c, storedPrefs, frame, now] = await Promise.all([
      read($, activity), read($, review), read($, context), read($, preferences),
      read($, mascot), $.clock.now(),
    ])
    // Hot reload keeps session memory, which an earlier version can have shaped.
    const a = activityOf(stored)
    const prefs: CockpitPreferences = {
      ...storedPrefs,
      view: VIEWS.includes(storedPrefs.view) ? storedPrefs.view : 'agents',
      span: SPAN_ORDER.includes(storedPrefs.span) ? storedPrefs.span : 'fit',
    }
    const viewedAgent = e.props.view.agentId ?? null
    // Follow the transcript in view until the person chooses while viewing it.
    const selectedAgent = viewedAgent !== null && viewedAgent !== a.selectedFor ? viewedAgent : a.selectedAgent
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const props: CockpitViewProps = {
      activity: { ...a, selectedAgent },
      review: reviewOf(r),
      context: contextOf(c),
      preferences: prefs,
      mascot: { frame: Number.isFinite(frame?.frame) ? frame.frame : 0, phase: mascotPhase(a) },
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
      : renderActivity(ui, props)
    const width = Math.max(12, props.columns - 1)
    const status = sessionStatus(props.activity, a.working)
    const fill = contextFill(props.context)
    const cost = props.context.usage?.cost?.usd
    const started = sessionStart(props.activity, props.context)
    const turns = mainTurns(props.activity).length
    const since = status.since === undefined ? '' : ` ${brief(now - status.since)}`
    const statusLine: Segment[] = [
      { text: 'COCKPIT', color: colors.accent, bold: true },
      { text: a.model ? ` ${shortModel(a.model)}` : '', color: colors.muted },
      { text: ' · ', color: colors.muted },
      { text: clip(`${status.glyph} ${status.label}${since}`, Math.max(8, width - 12 - shortModel(a.model).length)), color: status.color, bold: status.color !== colors.muted },
    ]
    const ctxColor = contextColor(fill)
    const meterLine: Segment[] = [
      { text: 'ctx ', color: colors.muted },
      { text: meter(fill.percent ?? 0, Math.max(6, Math.min(16, width - 40))), color: ctxColor === colors.muted ? colors.accent : ctxColor },
      { text: ` ${percent(fill.percent)}`, color: ctxColor === colors.muted ? undefined : ctxColor },
      { text: cost !== undefined && Number.isFinite(cost) ? ` · ${usd(cost)}` : '', color: colors.muted },
      { text: ` · ${turns} ${turns === 1 ? 'turn' : 'turns'}`, color: colors.muted },
      { text: started === undefined ? '' : ` · ${brief(now - started)} session`, color: colors.muted },
    ]
    const live = props.activity.agents.filter(isLive).length
    const running = runningTools(props.activity).length
    const files = changeTotals(props.review).files
    const ctxBadge = fill.percent !== undefined && Number.isFinite(fill.percent) ? percent(fill.percent) : ''
    const badges: Record<CockpitView, Segment> = {
      agents: live > 0 ? { text: `${live}▸`, color: colors.accent } : { text: props.activity.agents.length > 0 ? `${props.activity.agents.length}` : '', color: colors.muted },
      tools: running > 0 ? { text: `${running}▸`, color: colors.accent } : { text: props.activity.tools.length > 0 ? `${props.activity.tools.length}` : '', color: colors.muted },
      changes: { text: files > 0 ? `${files}` : '', color: colors.muted },
      context: { text: ctxBadge, color: ctxColor },
      activity: { text: '' },
    }
    const tabs = VIEWS.map(view => ({ label: viewLabels[view], badge: badges[view].text || undefined }))
    const tabLayout = tabRows(tabs, width)
    const activeTab = VIEWS.indexOf(prefs.view)
    // Each plain tab reads `1: Label`; the active one is at full strength over
    // an accent mark, the rest dim.
    const tabBar = tabLayout.rows.flatMap((row, number) => [
      <Box key={`cockpit:tabs:${number}`} flexDirection="row" columnGap={tabLayout.gap}>
        {row.map(index => {
          const view = VIEWS[index] ?? 'agents'
          const badge = badges[view]
          return (
            <Box key={`cockpit:tab:${view}`} flexDirection="row">
              <Button key={`view-${view}`} plain dimColor={prefs.view !== view} label={viewLabels[view]}
                hotkey={String(index + 1) as '1' | '2' | '3' | '4' | '5'}
                onPress={() => props.actions.selectView(view)} />
              {tabLayout.badges && badge.text !== '' && <Text color={badge.color} dimColor={prefs.view !== view && badge.color === colors.muted}>{` ${badge.text}`}</Text>}
            </Box>
          )
        })}
      </Box>,
      ...[tabMark(tabs, row, activeTab, tabLayout.badges, tabLayout.gap)].flatMap(mark => mark ? [line(ui, `cockpit:tabs:${number}:mark`, mark)] : []),
    ])
    const failure = a.stopFailure
    // No backgroundColor: the dock paints its own theme fill, and a plugin cannot
    // paint the terminal's default background over it.
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {line(ui, 'cockpit:status', statusLine)}
          {line(ui, 'cockpit:meter', meterLine)}
          {tabBar}
          {failure && <Text color={colors.red} wrap="wrap">{clip(`✗ Last turn stopped: ${humanize(failure.error)}${failure.details ? ` · ${failure.details}` : ''}`, 320)}</Text>}
        </Box>
        {content}
        <Text dimColor>{paneFooter(e.surface, e.props.placement, props.columns)}</Text>
      </Box>
    )
  })
}
