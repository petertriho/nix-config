/** What tmux-worker list reports, plus stopped for a worker that tmux-worker stop closed. */
export type WorkerStatus = 'waiting' | 'working' | 'error' | 'dead' | 'idle' | 'stopped'

/** One worker of this lead session, from `tmux-worker list --json`. Times are epoch milliseconds. */
export type TmuxWorker = {
  id: string
  name: string
  session: string
  window: string
  windowId: string
  pane: string
  target: string
  cwd: string
  status: WorkerStatus
  /** The time of the last turn event, or the spawn time before the first event. 0 when unknown. */
  since: number
  turn: number
  /** The first line of the last reply of the worker. */
  lastText: string
  created: number
}

export type WorkersSnapshot = {
  sessionId: string | null
  workers: TmuxWorker[]
  refreshedAt: number | null
  /** The last list failure. The band hides while it is set. */
  error: string | null
}

export type WorkersPulse = { frame: number }

declare module 'claude-code' {
  interface PluginState {
    'tmux-workers': {
      snapshot: Shaped<WorkersSnapshot>
      pulse: WorkersPulse
    }
  }
}
