import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { CommandRunInput, On, RenderPropsOf } from 'claude-code'

import { cells, colors } from '../hooks/theme'

const LEAD = 'lead-1'
const themeKeys = new Set<string>(Object.values(colors))

type Row = {
  id: string
  name: string
  status: string
  lead?: string
  since?: number
  created?: number
  last?: string
}

const listJson = (rows: readonly Row[]): string =>
  JSON.stringify(rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    lead_session: row.lead ?? LEAD,
    session: 'datahex-db',
    window: row.name,
    window_id: `@${index + 10}`,
    pane: `%${index + 10}`,
    target: `datahex-db:${row.name}`,
    cwd: `/Users/someone/Work/datahex-db/worktrees/${row.name}`,
    status: row.status,
    since: row.since ?? 1000,
    turn: 1,
    last_text: row.last ?? '',
    created: row.created ?? 900 + index,
  })))

type World = {
  rows: Row[]
  rootMtime: number
  stats: string[]
  listExit: number
  listStderr: string
  switchExit: number
  workerId: string | undefined
  processes: string[][]
  toasts: string[]
  logs: string[]
  commands: string[]
  opened: string[]
  closed: string[]
  clock: MockClock
  seed: (key: string, value: unknown) => void
}

const setup = (on: On): World => {
  const values = new Map<string, { value: unknown; version: number }>()
  const open = new Set<string>()
  const world: World = {
    rows: [], rootMtime: 1, stats: [], listExit: 0, listStderr: '', switchExit: 0, workerId: undefined,
    processes: [], toasts: [], logs: [], commands: [], opened: [], closed: [],
    clock: mock.clock(on, { now: 2000000 }),
    seed: (key, value) => { values.set(key, { value, version: (values.get(key)?.version ?? 0) + 1 }) },
  }
  on('state.get', (_$, e) => {
    const held = values.get(e.key)
    return { value: { value: held?.value, version: held?.version ?? 0 } }
  })
  on('state.set', (_$, e) => {
    const version = values.get(e.key)?.version ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false, version } }
    values.set(e.key, { value: e.value, version: version + 1 })
    return { value: { isSet: true, version: version + 1 } }
  })
  on('session.id', () => ({ value: LEAD }))
  on('env.get', (_$, e) => ({
    value: e.name === 'TMUX_WORKER_ID' ? world.workerId : e.name === 'HOME' ? '/home/test' : undefined,
  }))
  on('fs.stat', (_$, e) => {
    world.stats.push(e.path)
    return { value: { kind: 'dir' as const, size: 0, mtimeMs: world.rootMtime, isLink: false } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', (_$, e) => {
    world.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', (_$, e) => {
    world.opened.push(e.id)
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    world.closed.push(e.id)
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: 'tmux workers', isShown: true, isFocused: true, isPlaced: true })),
  }))
  on('ui.toast', (_$, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_$, e) => {
    world.logs.push(e.text)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    world.processes.push(argv)
    const ok = argv[0] === 'tmux-worker' ? world.listExit : world.switchExit
    const stdout = argv[0] === 'tmux-worker' && ok === 0 ? listJson(world.rows) : ''
    const stderr = ok === 0 ? '' : argv[0] === 'tmux-worker' ? world.listStderr : "can't find pane: %10"
    return { value: { exitCode: ok, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="native-content">Native content remains.</Text>
  })
  return world
}

const start = async ($: Engine, world: World): Promise<void> => {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await world.clock.advance(0)
}

const lists = (world: World): number => world.processes.filter(argv => argv[0] === 'tmux-worker').length

const bandProps = (hasSurvey = false): RenderPropsOf['AbovePrompt'] => ({
  hasSurvey, isCollapsed: false, isWorking: false, maxRows: 4, bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 4 }, view: {},
})

const paneProps = (columns: number): RenderPropsOf['Pane'] => ({
  title: 'tmux workers', isFocused: true, bodyColumns: columns,
  placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {},
})

const mountBand = ($: Engine, hasSurvey = false) => $.ui.mount({
  plugin: 'tmux-workers', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: bandProps(hasSurvey),
})

const mountPane = ($: Engine, columns: number) => $.ui.mount({
  plugin: 'tmux-workers', surface: 'terminal', component: 'Pane', requestId: 'tmux-workers',
  props: paneProps(columns), viewport: { columns: columns + 2, rows: 64, isFullscreen: true },
})

const command = (): CommandRunInput => ({
  command: 'tmux-workers', args: '', origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 100 },
})

const buttonKeys = async (ui: { findAll: (query: { type: string }) => Promise<{ key: string | undefined }[]> }, prefix: string) =>
  (await ui.findAll({ type: 'Button' })).map(button => button.key ?? '').filter(key => key.startsWith(prefix))

describe('tmux-workers', () => {
  test('the band shows a chip for each live worker of this lead only', async ($, on) => {
    const world = setup(on)
    world.rows = [
      { id: 'a1', name: 'db-fix', status: 'working' },
      { id: 'b2', name: 'api-review', status: 'waiting' },
      { id: 'c3', name: 'old', status: 'stopped' },
      { id: 'd4', name: 'other', status: 'idle', lead: 'lead-2' },
    ]
    await start($, world)
    expect(world.processes[0]).toEqual(['tmux-worker', 'list', '--json', '--lead', LEAD])
    const band = await mountBand($)
    expect(await band.find({ type: 'Text', text: 'Native content remains.' })).toBeDefined()
    expect(await band.find({ key: 'tmux-workers-open' })).toBeDefined()
    expect(await buttonKeys(band, 'tmux-workers-chip:')).toEqual(['tmux-workers-chip:b2', 'tmux-workers-chip:a1'])
    await band.unmount()
  })

  test('the band stays away without live workers, during a survey, and after a list failure', async ($, on) => {
    const world = setup(on)
    world.rows = [{ id: 'c3', name: 'old', status: 'stopped' }]
    await start($, world)
    let band = await mountBand($)
    expect(await band.find({ key: 'tmux-workers-open' })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'Native content remains.' })).toBeDefined()
    await band.unmount()

    world.rows = [{ id: 'a1', name: 'db-fix', status: 'working' }]
    await world.clock.advance(10000)
    band = await mountBand($)
    expect(await band.find({ key: 'tmux-workers-open' })).toBeDefined()
    await band.unmount()
    band = await mountBand($, true)
    expect(await band.find({ key: 'tmux-workers-open' })).toBeUndefined()
    await band.unmount()

    world.listExit = 1
    world.listStderr = 'tmux-worker: state folder unreadable'
    await world.clock.advance(2000)
    await world.clock.advance(2000)
    band = await mountBand($)
    expect(await band.find({ key: 'tmux-workers-open' })).toBeUndefined()
    await band.unmount()
    expect(world.logs).toEqual(['tmux-workers: tmux-worker: state folder unreadable'])
  })

  test('a chip press switches the tmux client to the pane of the worker', async ($, on) => {
    const world = setup(on)
    world.rows = [{ id: 'a1', name: 'db-fix', status: 'idle' }]
    await start($, world)
    const band = await mountBand($)
    await band.press({ key: 'tmux-workers-chip:a1' })
    expect(world.processes.at(-1)).toEqual(['tmux', 'switch-client', '-t', '%10'])
    expect(world.toasts).toEqual([])

    world.switchExit = 1
    await band.press({ key: 'tmux-workers-chip:a1' })
    expect(world.toasts).toEqual(["Cannot switch to db-fix: can't find pane: %10"])
    await band.unmount()
  })

  test('a worker that starts to wait raises one toast for each wait', async ($, on) => {
    const world = setup(on)
    world.rows = [{ id: 'a1', name: 'db-fix', status: 'working', since: 1000 }]
    await start($, world)
    expect(world.toasts).toEqual([])
    world.rows = [{ id: 'a1', name: 'db-fix', status: 'waiting', since: 1010 }]
    await world.clock.advance(2000)
    await world.clock.advance(2000)
    expect(world.toasts).toEqual(['tmux worker db-fix is waiting for input.'])
    world.rows = [{ id: 'a1', name: 'db-fix', status: 'waiting', since: 1030 }]
    await world.clock.advance(2000)
    expect(world.toasts).toHaveLength(2)
  })

  test('the command and the band label open and close the pane', async ($, on) => {
    const world = setup(on)
    world.rows = [{ id: 'a1', name: 'db-fix', status: 'idle' }]
    await start($, world)
    expect(world.commands).toEqual(['tmux-workers'])
    expect((await $.command.run(command())).text).toBe('Opened the tmux workers pane.')
    expect((await $.command.run(command())).text).toBe('Closed the tmux workers pane.')
    const band = await mountBand($)
    await band.press({ key: 'tmux-workers-open' })
    await world.clock.advance(0)
    expect(world.opened).toEqual(['tmux-workers', 'tmux-workers'])
    expect(world.closed).toEqual(['tmux-workers'])
    await band.unmount()
  })

  test('the pane lists the workers in status order at each width', async ($, on) => {
    const world = setup(on)
    world.rows = [
      { id: 'i1', name: 'docs', status: 'idle', last: 'Done. The docs build passes.' },
      { id: 'w1', name: 'db-fix', status: 'working' },
      { id: 'q1', name: 'api-review', status: 'waiting' },
      { id: 's1', name: 'old', status: 'stopped' },
      { id: 'e1', name: 'broken', status: 'error' },
    ]
    await start($, world)
    for (const columns of [24, 48, 100]) {
      const ui = await mountPane($, columns)
      expect(await ui.find({ type: 'Text', text: 'TMUX WORKERS' })).toBeDefined()
      expect(await buttonKeys(ui, 'tmux-workers-go:')).toEqual([
        'tmux-workers-go:q1', 'tmux-workers-go:w1', 'tmux-workers-go:e1', 'tmux-workers-go:i1',
      ])
      expect(await ui.find({ type: 'Text', text: /old stopped/ })).toBeDefined()
      for (const element of await ui.findAll({})) {
        const color = element.props.color
        if (color !== undefined) expect(themeKeys.has(color as string)).toBe(true)
        if (element.type === 'Text') expect(cells(element.text)).toBeLessThanOrEqual(columns)
      }
      await ui.unmount()
    }
  })

  test('a pane press switches to the worker', async ($, on) => {
    const world = setup(on)
    world.rows = [{ id: 'a1', name: 'db-fix', status: 'waiting' }]
    await start($, world)
    const ui = await mountPane($, 48)
    await ui.press({ key: 'tmux-workers-go:a1' })
    expect(world.processes.at(-1)).toEqual(['tmux', 'switch-client', '-t', '%10'])
    await ui.unmount()
  })

  test('a worker session runs no list and registers no command', async ($, on) => {
    const world = setup(on)
    world.workerId = 'w1'
    await start($, world)
    await world.clock.advance(20000)
    expect(world.processes).toEqual([])
    expect(world.commands).toEqual([])
  })

  test('the list runs every 10 s without live workers, and at once for a new worker folder', async ($, on) => {
    const world = setup(on)
    await start($, world)
    expect(lists(world)).toBe(1)
    await world.clock.advance(2000)
    expect(lists(world)).toBe(1)
    expect(world.stats.at(-1)).toBe('/home/test/.local/state/tmux-worker')
    world.rootMtime = 2
    await world.clock.advance(500)
    expect(lists(world)).toBe(2)
    await world.clock.advance(1000)
    expect(lists(world)).toBe(2)
    await world.clock.advance(10000)
    expect(lists(world)).toBe(3)
  })

  test('a live worker makes the list run every 2 s', async ($, on) => {
    const world = setup(on)
    world.rows = [{ id: 'a1', name: 'db-fix', status: 'working' }]
    await start($, world)
    await world.clock.advance(6000)
    expect(lists(world)).toBe(4)
  })

  test('a snapshot that an earlier version stored is declined', async ($, on) => {
    const world = setup(on)
    world.seed('snapshot', { workers: [{ name: 'stale' }] })
    const ui = await mountPane($, 48)
    expect(await ui.find({ type: 'Text', text: 'No tmux workers for this session.' })).toBeDefined()
    await ui.unmount()
  })
})
