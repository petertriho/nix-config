import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { TmuxWorker } from '../types'
import { errorText, firstLine, initialSnapshot, isLive, newlyWaiting, parseWorkers } from './data'
import { bandView, paneView } from './views'
import type { Actions } from './views'

const PANE = 'tmux-workers'
const TICK_MS = 500
// The list runs every 2 s while this session has live workers, and every 10 s
// otherwise. A new worker folder changes the mtime of the state folder, and the
// list then runs at the next tick. The plugin has no tool.call hook, because
// Claude Code turns off code mode in a session with a plugin that has one.
const LIVE_POLL_MS = 2000
const IDLE_POLL_MS = 10000

const snapshot = atom({ plugin: 'tmux-workers', key: 'snapshot' } as const, initialSnapshot(), {
  shape: 'snapshot-1',
})
const pulse = atom({ plugin: 'tmux-workers', key: 'pulse' } as const, { frame: 0 })

let timer: Timer | undefined
let ticking = false
let polling: Promise<void> | undefined
let lastPoll = Number.NEGATIVE_INFINITY
let lastLogged: string | null = null
let stateRoot: string | undefined
let lastRootMtime: number | undefined

const poll = async ($: EngineInterface): Promise<void> => {
  try {
    lastPoll = await $.clock.now()
    const sessionId = await $.session.id()
    const run = await $.process.run(['tmux-worker', 'list', '--json', '--lead', sessionId], { timeoutMs: 10000 })
    if (run.exitCode !== 0) {
      throw new Error(firstLine(run.stderr) || `tmux-worker list exited with ${run.exitCode}.`)
    }
    const workers = parseWorkers(run.stdout, sessionId)
    const previous = await read($, snapshot)
    for (const worker of newlyWaiting(previous.workers, workers)) {
      $.ui.toast(`tmux worker ${worker.name} is waiting for input.`)
    }
    await update($, snapshot, () => ({ sessionId, workers, refreshedAt: lastPoll, error: null }))
    lastLogged = null
  } catch (error) {
    const message = errorText(error)
    // One debug line for each new error, because the list runs every few seconds.
    if (message !== lastLogged) $.ui.log(`tmux-workers: ${message}`, { to: 'debug' })
    lastLogged = message
    // A state write that fails here has nothing left to report to.
    await update($, snapshot, previous => ({ ...previous, error: message })).catch(() => undefined)
  }
}

/** Runs one list at a time. A call while a list runs waits for that list. */
const refresh = ($: EngineInterface): Promise<void> => {
  polling ??= poll($).finally(() => {
    polling = undefined
  })
  return polling
}

/** True when the mtime of the state folder changed since the previous tick. */
const rootChanged = async ($: EngineInterface): Promise<boolean> => {
  if (stateRoot === undefined) return false
  // The folder is missing until the first spawn. That reads as mtime 0.
  const mtime = (await $.fs.stat(stateRoot).catch(() => undefined))?.mtimeMs ?? 0
  const changed = lastRootMtime !== undefined && mtime !== lastRootMtime
  lastRootMtime = mtime
  return changed
}

const onTick = async ($: EngineInterface): Promise<void> => {
  if (ticking) return
  ticking = true
  try {
    const [state, now] = await Promise.all([read($, snapshot), $.clock.now()])
    const hasLive = state.workers.some(isLive)
    const changed = await rootChanged($)
    if (changed || now - lastPoll >= (hasLive ? LIVE_POLL_MS : IDLE_POLL_MS)) await refresh($)
    if (state.workers.some(worker => worker.status === 'working')) {
      await update($, pulse, previous => ({ frame: (previous.frame + 1) % 1000000 }))
    }
  } catch (error) {
    $.ui.log(`tmux-workers timer: ${errorText(error)}`, { to: 'debug' })
  } finally {
    ticking = false
  }
}

const isPaneOpen = async ($: EngineInterface): Promise<boolean> =>
  (await $.ui.panes()).some(pane => pane.id === PANE)

const openPane = async ($: EngineInterface): Promise<void> => {
  const opened = await $.ui.open({ id: PANE, title: 'tmux workers', focus: true, closeOnEscape: true, rows: 16, columns: 48 })
  if (!opened.isPlaced) $.ui.toast('The tmux workers pane waits for a terminal with more room.')
  void refresh($)
}

/** Opens the pane, or closes it when it is open. Resolves true when the pane is open after. */
const togglePane = async ($: EngineInterface): Promise<boolean> => {
  if (await isPaneOpen($)) {
    await $.ui.close({ id: PANE })
    return false
  }
  await openPane($)
  return true
}

const switchTo = async ($: EngineInterface, worker: TmuxWorker): Promise<void> => {
  if (worker.status === 'stopped') {
    $.ui.toast(`${worker.name} is stopped. Its window is closed.`)
    return
  }
  // switch-client takes a pane id (it has a %) as a session, window, and pane.
  const target = worker.pane !== '' ? worker.pane : `${worker.windowId}.`
  try {
    const run = await $.process.run(['tmux', 'switch-client', '-t', target], { timeoutMs: 5000 })
    if (run.exitCode !== 0) {
      $.ui.toast(`Cannot switch to ${worker.name}: ${firstLine(run.stderr) || 'its window is gone.'}`)
      void refresh($)
    }
  } catch (error) {
    $.ui.toast(`Cannot switch to ${worker.name}: ${errorText(error)}`)
  }
}

const actionsFor = ($: EngineInterface): Actions => ({
  togglePane: () => {
    togglePane($).catch(error => $.ui.log(`tmux-workers pane: ${errorText(error)}`, { to: 'debug' }))
  },
  select: worker => {
    void switchTo($, worker)
  },
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      // A worker shows no band: tmux-worker refuses to start workers from a worker.
      if ((await $.env.get('TMUX_WORKER_ID')) !== undefined) return result
      await $.command.register({
        name: 'tmux-workers',
        description: 'Show or hide the pane with the tmux workers of this session.',
        immediate: true,
      })
      // The same folder as tmux-worker: ${XDG_STATE_HOME:-~/.local/state}/tmux-worker.
      const home = await $.env.get('HOME')
      const stateHome = (await $.env.get('XDG_STATE_HOME')) || (home === undefined ? undefined : `${home}/.local/state`)
      stateRoot = stateHome === undefined ? undefined : `${stateHome}/tmux-worker`
      lastRootMtime = undefined
      timer?.cancel()
      lastPoll = Number.NEGATIVE_INFINITY
      lastLogged = null
      timer = $.clock.every(TICK_MS, () => {
        void onTick($)
      })
      void refresh($)
    } catch (error) {
      $.ui.log(`tmux-workers start: ${errorText(error)}`, { to: 'debug' })
    }
    return result
  })

  on('session.end', ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('command.run', { command: 'tmux-workers' }, async $ => {
    const isOpen = await togglePane($)
    return {
      text: isOpen ? 'Opened the tmux workers pane.' : 'Closed the tmux workers pane.',
      isTextDisplayOnly: true,
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.maxRows < 1) return next(e)
    const [state, beat] = await Promise.all([read($, snapshot), read($, pulse)])
    if (state.error !== null || !state.workers.some(isLive)) return next(e)
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const base = await next(e)
    return (
      <Box flexDirection="column">
        {base}
        {bandView(ui, state.workers, { columns: e.props.bodyColumns, frame: beat.frame, actions: actionsFor($) })}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [state, beat, now] = await Promise.all([read($, snapshot), read($, pulse), $.clock.now()])
    return paneView($.ui.resolve(e), state, {
      columns: e.props.bodyColumns,
      frame: beat.frame,
      now,
      actions: actionsFor($),
    })
  })
}
