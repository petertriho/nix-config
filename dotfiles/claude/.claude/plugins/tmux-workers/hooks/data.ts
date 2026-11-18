import type { TmuxWorker, WorkerStatus, WorkersSnapshot } from '../types'
import { cells, colors } from './theme'

/** The statuses in the order of the pane and the band. */
export const STATUSES = ['waiting', 'working', 'error', 'dead', 'idle', 'stopped'] as const satisfies readonly WorkerStatus[]

export const initialSnapshot = (): WorkersSnapshot => ({ sessionId: null, workers: [], refreshedAt: null, error: null })

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const epochMs = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value * 1000 : 0

const isStatus = (value: unknown): value is WorkerStatus =>
  (STATUSES as readonly unknown[]).includes(value)

/** The workers of one lead session in what `tmux-worker list --json` printed. */
export const parseWorkers = (stdout: string, leadSession: string): TmuxWorker[] => {
  const parsed: unknown = JSON.parse(stdout.trim() === '' ? '[]' : stdout)
  if (!Array.isArray(parsed)) throw new Error('tmux-worker list --json printed no array.')
  return parsed.flatMap((item: unknown): TmuxWorker[] => {
    if (typeof item !== 'object' || item === null) return []
    const record = item as Record<string, unknown>
    const id = text(record.id)
    if (record.lead_session !== leadSession || id === '') return []
    return [{
      id,
      name: text(record.name) || id,
      session: text(record.session),
      window: text(record.window),
      windowId: text(record.window_id),
      pane: text(record.pane),
      target: text(record.target),
      cwd: text(record.cwd),
      // A status that this version does not know shows as dead, so that it stands out.
      status: isStatus(record.status) ? record.status : 'dead',
      since: epochMs(record.since),
      turn: typeof record.turn === 'number' && Number.isFinite(record.turn) ? record.turn : 0,
      lastText: text(record.last_text),
      created: epochMs(record.created),
    }]
  })
}

/** Waiting first, then working, failed, idle, and stopped. Older first in one status. */
export const sortWorkers = (workers: readonly TmuxWorker[]): TmuxWorker[] =>
  [...workers].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.created - b.created)

export const isLive = (worker: TmuxWorker): boolean => worker.status !== 'stopped'

/** The workers that started to wait since the previous list. Each new waiting event has a new since. */
export const newlyWaiting = (previous: readonly TmuxWorker[], next: readonly TmuxWorker[]): TmuxWorker[] =>
  next.filter(worker => {
    if (worker.status !== 'waiting') return false
    const before = previous.find(one => one.id === worker.id)
    return before === undefined || before.status !== 'waiting' || before.since !== worker.since
  })

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

export type Mark = { glyph: string; color: (typeof colors)[keyof typeof colors] }

export const markOf = (status: WorkerStatus, frame: number): Mark => {
  switch (status) {
    case 'working':
      return { glyph: SPINNER[Math.abs(Math.floor(frame)) % SPINNER.length] ?? SPINNER[0], color: colors.accent }
    case 'waiting':
      return { glyph: '?', color: colors.yellow }
    case 'idle':
      return { glyph: '✓', color: colors.green }
    case 'error':
    case 'dead':
      return { glyph: '✗', color: colors.red }
    case 'stopped':
      return { glyph: '·', color: colors.muted }
  }
}

/** For example "1 waiting · 2 working · 1 idle", in the sort order, without zero counts. */
export const countsText = (workers: readonly TmuxWorker[]): string => {
  const parts = STATUSES
    .map(status => [status, workers.filter(worker => worker.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
  return parts.length === 0 ? 'no workers' : parts.join(' · ')
}

/** The home folder as ~. */
export const shortPath = (path: string): string => path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~')

export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export const firstLine = (value: string): string =>
  value.split('\n').map(line => line.trim()).find(line => line !== '') ?? ''

/**
 * The chips that fit in a number of cells, and how many are left out. A chip is
 * the mark, a space, the name, and a gap. A "+N" count keeps room while chips are left.
 */
export const fitChips = (
  workers: readonly TmuxWorker[],
  columns: number,
  nameCells: number,
): { shown: TmuxWorker[]; hidden: number } => {
  const shown: TmuxWorker[] = []
  let used = 0
  for (const [index, worker] of workers.entries()) {
    const width = 2 + Math.min(cells(worker.name), nameCells) + 1
    const left = workers.length - index - 1
    const reserve = left > 0 ? 1 + String(left).length : 0
    if (used + width + reserve > columns) break
    shown.push(worker)
    used += width
  }
  return { shown, hidden: workers.length - shown.length }
}
