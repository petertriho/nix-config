import type { Elements, RenderSurface } from 'claude-code'

import type { TmuxWorker, WorkersSnapshot } from '../types'
import { countsText, fitChips, isLive, markOf, shortPath, sortWorkers } from './data'
import { brief, cells, clip, clipStart, colors } from './theme'

export type Ui = Elements[RenderSurface]

export type Actions = {
  togglePane: () => void
  select: (worker: TmuxWorker) => void
}

const BAND_LABEL = 'tmux'
const BAND_NAME_CELLS = 20

/** One row: "tmux", then a chip for each live worker, then "+N" for the chips that do not fit. */
export const bandView = (
  ui: Ui,
  workers: readonly TmuxWorker[],
  options: { columns: number; frame: number; actions: Actions },
) => {
  const { Box, Button, Text } = ui
  const live = sortWorkers(workers.filter(isLive))
  const { shown, hidden } = fitChips(live, options.columns - cells(BAND_LABEL) - 1, BAND_NAME_CELLS)
  return (
    <Box flexDirection="row" columnGap={1}>
      <Button key="tmux-workers-open" plain dimColor label={BAND_LABEL} onPress={options.actions.togglePane} />
      {shown.map(worker => {
        const mark = markOf(worker.status, options.frame)
        return (
          <Button
            key={`tmux-workers-chip:${worker.id}`}
            plain
            label={`${worker.name} (${worker.status})`}
            onPress={() => options.actions.select(worker)}
          >
            <Text color={mark.color}>{mark.glyph}</Text>
            {` ${clip(worker.name, BAND_NAME_CELLS)}`}
          </Button>
        )
      })}
      {hidden > 0 ? <Text dimColor>{`+${hidden}`}</Text> : null}
    </Box>
  )
}

const workerRow = (
  ui: Ui,
  worker: TmuxWorker,
  options: { columns: number; frame: number; now: number; actions: Actions },
) => {
  const { Box, Button, Text } = ui
  const mark = markOf(worker.status, options.frame)
  const isStopped = worker.status === 'stopped'
  const state = worker.since > 0 ? `${worker.status} ${brief(options.now - worker.since)}` : worker.status
  const nameCells = Math.max(4, options.columns - 2 - cells(state) - 1)
  const body = options.columns - 2
  return (
    <Box key={`tmux-workers-row:${worker.id}`} flexDirection="column">
      {isStopped ? (
        <Text dimColor>{`${mark.glyph} ${clip(worker.name, nameCells)} ${state}`}</Text>
      ) : (
        <Button
          key={`tmux-workers-go:${worker.id}`}
          plain
          label={`Switch to ${worker.name}`}
          onPress={() => options.actions.select(worker)}
        >
          <Text color={mark.color}>{mark.glyph}</Text>
          {' '}
          <Text bold>{clip(worker.name, nameCells)}</Text>
          {' '}
          <Text dimColor>{state}</Text>
        </Button>
      )}
      <Box flexDirection="column" paddingLeft={2}>
        <Text dimColor>{clip(worker.target, body)}</Text>
        <Text dimColor>{clipStart(shortPath(worker.cwd), body)}</Text>
        {worker.lastText !== '' ? <Text dimColor={isStopped}>{clip(worker.lastText, body)}</Text> : null}
      </Box>
    </Box>
  )
}

/** The header with the counts, then one block for each worker of this session. */
export const paneView = (
  ui: Ui,
  snapshot: WorkersSnapshot,
  options: { columns: number; frame: number; now: number; actions: Actions },
) => {
  const { Box, Text } = ui
  const workers = sortWorkers(snapshot.workers)
  const columns = Math.max(12, Math.floor(options.columns))
  return (
    <Box flexDirection="column" rowGap={1}>
      <Box flexDirection="column">
        <Text bold>TMUX WORKERS</Text>
        <Text dimColor>{clip(countsText(workers), columns)}</Text>
        {workers.some(isLive) ? <Text dimColor>{clip('Select a worker to switch to its window.', columns)}</Text> : null}
      </Box>
      {snapshot.error !== null ? (
        <Text color={colors.red}>{clip(`tmux-worker list failed: ${snapshot.error}`, columns)}</Text>
      ) : null}
      {workers.length === 0 && snapshot.error === null ? (
        <Text dimColor>{clip('No tmux workers for this session.', columns)}</Text>
      ) : null}
      {workers.map(worker => workerRow(ui, worker, { ...options, columns }))}
    </Box>
  )
}
