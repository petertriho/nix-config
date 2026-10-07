import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type {
  AgentInfo,
  CommandRunInput,
  On,
  PluginState,
  RenderPropsOf,
  RenderSurface,
  SessionUsage,
  TurnCompleteInput,
  TurnStepChunk,
  TurnStepResult,
  TurnUsage,
} from 'claude-code'
import { initialActivity, initialContext, initialImages, initialReview } from '../hooks/state'

type State = PluginState['cockpit']

const PATCH = 'diff --git a/tracked.ts b/tracked.ts\n--- a/tracked.ts\n+++ b/tracked.ts\n@@ -1 +1 @@\n-old\n+new\n'
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+i40YAAAAASUVORK5CYII='
const USAGE: TurnUsage = {
  input_tokens: 20,
  output_tokens: 12,
  cache_read_input_tokens: 80,
  cache_creation_input_tokens: 10,
  model: 'test-model',
}

const command = (args = ''): CommandRunInput => ({
  command: 'cockpit', args, origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 100 },
})

const paneProps = (columns = 80): RenderPropsOf['Pane'] => ({
  title: 'Cockpit', isFocused: true, bodyColumns: columns,
  placement: 'dock', scroll: { offset: 0, bodyRows: 28 }, view: {},
})

const bandProps = (hasSurvey = false): RenderPropsOf['AbovePrompt'] => ({
  hasSurvey, isWorking: false, maxRows: 4, bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 4 }, view: {},
})

const completion = (extra: Partial<Pick<TurnCompleteInput, 'turnId' | 'agentId' | 'durationMs' | 'usage' | 'answer'>> = {}): TurnCompleteInput => ({
  turnId: 'main-turn', answer: 'Original answer.', durationMs: 1500,
  isAborted: false, reason: 'answer', usage: USAGE, ...extra,
})

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

type World = {
  id: string
  usage: SessionUsage
  agents: AgentInfo[]
  clock: MockClock
  permission: 'allow' | 'deny'
  failStateReads: boolean
  commands: string[]
  opened: string[]
  closed: string[]
  usageRequests: (string | undefined)[]
  processes: readonly string[][]
  fsStats: string[]
  fsReads: string[]
  copies: string[]
  drafts: string[]
  submitted: number
  network: number
  spawned: number
  logs: string[]
  get: <K extends keyof State>(key: K) => State[K]
  seed: <K extends keyof State>(key: K, value: State[K]) => void
}

const setup = (on: On): World => {
  const values = new Map<string, { value: unknown; version: number }>()
  const clock = mock.clock(on, { now: 10000 })
  const world: World = {
    id: 'session-1',
    usage: { startedAt: 1000, context: { window: 200000, tokens: 20000, percent: 10 }, rateLimits: [], cost: { usd: 0.42 } },
    agents: [], clock, permission: 'allow', failStateReads: false,
    commands: [], opened: [], closed: [], usageRequests: [], processes: [],
    fsStats: [], fsReads: [], copies: [], drafts: [], submitted: 0,
    network: 0, spawned: 0, logs: [],
    get: key => values.get(key)?.value as State[typeof key],
    seed: (key, value) => { values.set(key, { value, version: (values.get(key)?.version ?? 0) + 1 }) },
  }
  world.seed('activity', { ...initialActivity(), sessionId: world.id, model: 'test-model' })
  world.seed('review', { ...initialReview(), sessionId: world.id })
  world.seed('context', { ...initialContext(), sessionId: world.id, usage: world.usage })
  world.seed('images', { ...initialImages(), sessionId: world.id })
  world.seed('preferences', { view: 'agents', band: true, animation: true, paneOpen: false })
  world.seed('reactor', { frame: 0, phase: 'idle', samples: [] })

  on('state.get', (_$, e) => {
    if (world.failStateReads) throw new Error('State observation refused.')
    const held = values.get(e.key)
    return { value: { value: held?.value, version: held?.version ?? 0 } }
  })
  on('state.set', (_$, e) => {
    const version = values.get(e.key)?.version ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false, version } }
    values.set(e.key, { value: e.value, version: version + 1 })
    return { value: { isSet: true, version: version + 1 } }
  })
  on('session.id', () => ({ value: world.id }))
  on('session.model', () => ({ value: 'test-model' }))
  on('session.cwd', () => ({ value: '/project' }))
  on('session.root', () => ({ value: '/project' }))
  on('session.repo', () => ({ value: { root: '/project', name: 'project', remote: null, internal: false } }))
  on('session.usage', (_$, e) => {
    world.usageRequests.push(e.breakdown)
    return { value: world.usage }
  })
  on('agent.list', () => ({ value: world.agents }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('command.register', (_$, e) => {
    world.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', (_$, e) => {
    world.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    world.closed.push(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: world.opened.filter(id => !world.closed.includes(id)).map(id => ({
    id, title: 'Cockpit', isShown: true, isFocused: true, isPlaced: true,
  })) }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', (_$, e) => { world.logs.push(e.text); return { value: undefined } })
  on('ui.copy', (_$, e) => { world.copies.push(e.text); return { value: { isCopied: true } } })
  on('prompt.fill', (_$, e) => {
    world.drafts.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('prompt.submit', (_$, e) => { world.submitted += 1; return { text: e.text } })
  on('classic.PreToolUse', () => world.permission === 'deny' ? { deny: 'Policy refused this call.' } : { allow: true })
  on('process.run', (_$, e) => {
    world.processes = [...world.processes, [...e.argv]]
    const stdout = e.argv.includes('status') ? ' M tracked.ts\u0000?? new.txt\u0000'
      : e.argv.includes('symbolic-ref') ? 'main\n'
      : e.argv.includes('--cached') ? '' : PATCH
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('process.spawn', async function* () { world.spawned += 1; throw new Error('No process should start.') })
  on('http.fetch', () => { world.network += 1; throw new Error('No network request should start.') })
  on('mcp.call', () => { world.network += 1; throw new Error('No capture should start.') })
  on('fs.stat', (_$, e) => {
    world.fsStats.push(e.path)
    return { value: { kind: 'file', size: 68, mtimeMs: 1000, isLink: false, realPath: '/project/image.png' } }
  })
  on('fs.read', (_$, e) => {
    world.fsReads.push(e.path)
    return { value: { base64: PNG } }
  })
  mock.env(on, { HOME: '/home/test' })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="native-content">Native content remains.</Text>
  })
  return world
}

const mountPane = <P extends RenderSurface>(engine: Engine, surface: P, columns = 80) => engine.ui.mount({
  plugin: 'cockpit', surface, component: 'Pane', requestId: 'cockpit',
  props: paneProps(columns), viewport: { columns: columns + 2, rows: 32, isFullscreen: true },
})

describe('cockpit observer hooks', () => {
  test('passes tool arguments and successful result through exactly once', async ($, on) => {
    const world = setup(on)
    let calls = 0
    let observed: unknown
    const output = { result: { stdout: 'done', stderr: '', interrupted: false }, ref: 12, text: 'done', isReadOnly: true as const }
    on('tool.call', { tool: 'Bash' }, (_$, e) => { calls += 1; observed = e; return output })
    const input = { tool: 'Bash' as const, tool_use_id: 'bash-1', command: 'printf done', description: 'Print a result' }
    expect(await $.tool.call(input)).toEqual(output)
    expect(observed).toEqual(input)
    expect(calls).toBe(1)
    expect(world.get('activity').tools).toMatchObject([{ id: 'bash-1', tool: 'Bash', outcome: 'success' }])
    expect(JSON.stringify(world.get('activity'))).not.toContain('printf done')
  })

  test('preserves an errored tool result without replay', async ($, on) => {
    const world = setup(on)
    let calls = 0
    const output = { result: 'Command failed.', isError: true as const, ref: 13, text: 'Command failed.' }
    on('tool.call', { tool: 'Bash' }, () => { calls += 1; return output })
    expect(await $.tool.call({ tool: 'Bash', tool_use_id: 'bad', command: 'false' })).toEqual(output)
    expect(calls).toBe(1)
    expect(world.get('activity').tools.at(-1)?.outcome).toBe('error')
  })

  test('does not bypass a permission denial or start the refused tool', async ($, on) => {
    const world = setup(on)
    world.permission = 'deny'
    let calls = 0
    on('tool.call', { tool: 'Bash' }, () => { calls += 1; return { result: { stdout: '', stderr: '', interrupted: false } } })
    const result = await $.tool.call({ tool: 'Bash', tool_use_id: 'denied', command: 'printf denied' })
    expect(calls).toBe(0)
    expect(result.isError === true || result.deny !== undefined).toBe(true)
    expect(world.get('activity').tools.at(-1)?.outcome).not.toBe('success')
  })

  test('observation failures do not change or duplicate the tool operation', async ($, on) => {
    const world = setup(on)
    world.failStateReads = true
    let calls = 0
    const output = { result: { stdout: 'unchanged', stderr: '', interrupted: false }, text: 'unchanged', ref: 14 }
    on('tool.call', { tool: 'Bash' }, () => { calls += 1; return output })
    expect(await $.tool.call({ tool: 'Bash', tool_use_id: 'opaque', command: 'printf unchanged' })).toEqual(output)
    expect(calls).toBe(1)
    expect(world.logs.length).toBeGreaterThan(0)
  })

  test('forwards each stream chunk and the response result without another request', async ($, on) => {
    const world = setup(on)
    let requests = 0
    const chunks: TurnStepChunk[] = [
      { kind: 'text', index: 0, text: 'Hello ' },
      { kind: 'text', index: 0, text: 'world.' },
      { kind: 'stop', stopReason: 'end_turn', usage: USAGE },
    ]
    const result: TurnStepResult = {
      turnId: 'step-turn', index: 0, answer: 'Hello world.', toolUses: [], stopReason: 'end_turn', usage: USAGE,
      serverToolUses: [{ id: 'server-1', name: 'advisor', input: {}, startedAt: 8000, endedAt: 9000 }],
    }
    on('turn.step', async function* () { requests += 1; yield* chunks; return result })
    const stream = $.turn.step({ turnId: 'step-turn', index: 0, model: 'test-model', messageCount: 2 })
    const received: TurnStepChunk[] = []
    let returned: TurnStepResult | undefined
    for (;;) {
      const item = await stream.next()
      if (item.done) { returned = item.value; break }
      received.push(item.value)
    }
    expect(received).toEqual(chunks)
    expect(returned).toEqual(result)
    expect(requests).toBe(1)
    expect(world.get('activity').tools.at(-1)).toMatchObject({ id: 'server-1', retrospective: true, startedAt: 8000, finishedAt: 9000 })
  })

  test('keeps main and agent completion metrics separate', async ($, on) => {
    const world = setup(on)
    world.agents = [{ id: 'child', name: 'worker', description: 'Inspect code', type: 'Explore', status: 'running' }]
    on('turn.complete', (_$, e) => ({ text: e.answer, usage: e.usage }))
    await $.turn.start({ text: 'Work.', turnId: 'main-turn' })
    await $.turn.complete(completion({ turnId: 'child-turn', agentId: 'child', durationMs: 300, usage: { ...USAGE, model: 'child-model' } }))
    expect(world.get('activity').working).toBe(true)
    expect(world.get('activity').turns.at(-1)).toMatchObject({ id: 'child-turn', agentId: 'child', usage: { model: 'child-model' } })
    await $.turn.complete(completion())
    expect(world.get('activity').working).toBe(false)
    expect(world.get('activity').turns.filter(turn => turn.agentId === undefined)).toMatchObject([{ id: 'main-turn', durationMs: 1500, usage: USAGE }])
  })

  test('updates local usage and clears unavailable metrics rather than retaining old counts', async ($, on) => {
    const world = setup(on)
    await $.session.measure({ context: { window: 200000, tokens: 120000, percent: 60 }, rateLimits: [{ kind: 'five_hour', percentUsed: 35, resetsAt: '2026-10-07T20:00:00Z' }], cost: { usd: 1.25 }, changed: ['context', 'rateLimits', 'cost'] })
    expect(world.get('context').usage).toMatchObject({ context: { tokens: 120000, percent: 60 }, cost: { usd: 1.25 } })
    await $.session.measure({ context: { window: 200000 }, rateLimits: [], changed: ['context', 'rateLimits', 'cost'] })
    expect(world.get('context').usage?.context.tokens).toBeUndefined()
    expect(world.get('context').usage?.context.percent).toBeUndefined()
    expect(world.get('context').usage?.cost).toBeUndefined()
    expect(world.network).toBe(0)
  })

  test('clear removes session data and a delayed tool cannot repopulate it', async ($, on) => {
    const world = setup(on)
    const gate = deferred<void>()
    on('tool.call', { tool: 'Bash' }, async () => {
      await gate.promise
      return { result: { stdout: 'old result', stderr: '', interrupted: false }, ref: 16 }
    })
    const running = $.tool.call({ tool: 'Bash', tool_use_id: 'old-tool', command: 'printf old' })
    await world.clock.settle()
    await $.session.end({ reason: 'clear', sessionId: world.id, resume: { id: world.id } })
    world.id = 'session-2'
    await $.session.measure({ context: { window: 200000 }, rateLimits: [], changed: ['context'] })
    gate.resolve()
    expect((await running).ref).toBe(16)
    expect(world.get('activity').sessionId).toBe('session-2')
    expect(world.get('activity').tools).toEqual([])
    expect(world.get('review').changes).toEqual([])
    expect(world.get('images').images).toEqual([])
  })

  test('a delayed completion does not attach the old turn to a cleared session', async ($, on) => {
    const world = setup(on)
    const gate = deferred<void>()
    on('turn.complete', async (_$, e) => { await gate.promise; return { text: e.answer, usage: e.usage } })
    const running = $.turn.complete(completion({ turnId: 'old-turn' }))
    await world.clock.settle()
    await $.session.end({ reason: 'clear', sessionId: world.id, resume: { id: world.id } })
    world.id = 'session-2'
    await $.session.measure({ context: { window: 200000 }, rateLimits: [], changed: ['context'] })
    gate.resolve()
    expect((await running).text).toBe('Original answer.')
    expect(world.get('activity').turns).toEqual([])
  })

  test('a delayed stream preserves output but does not attach old server tools after clear', async ($, on) => {
    const world = setup(on)
    const gate = deferred<void>()
    on('turn.step', async function* () {
      yield { kind: 'text', index: 0, text: 'Before clear.' }
      await gate.promise
      return { turnId: 'old-step', index: 0, answer: 'Before clear.', toolUses: [], stopReason: 'end_turn', usage: USAGE,
        serverToolUses: [{ id: 'old-server', name: 'advisor', input: {}, startedAt: 1000, endedAt: 2000 }] }
    })
    const stream = $.turn.step({ turnId: 'old-step', index: 0, model: 'test-model', messageCount: 1 })
    expect((await stream.next()).value).toMatchObject({ kind: 'text', text: 'Before clear.' })
    await $.session.end({ reason: 'clear', sessionId: world.id, resume: { id: world.id } })
    world.id = 'session-2'
    await $.session.measure({ context: { window: 200000 }, rateLimits: [], changed: ['context'] })
    gate.resolve()
    const finished = await stream.next()
    expect(finished.done).toBe(true)
    expect(world.get('activity').tools).toEqual([])
  })
})

describe('cockpit commands and surfaces', () => {
  test('registers its immediate command without automatically opening a pane or starting processes', async ($, on) => {
    const world = setup(on)
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: false })
    expect(world.commands).toEqual(['cockpit'])
    expect(world.opened).toEqual([])
    expect(world.processes).toEqual([])
    expect(world.spawned).toBe(0)
    expect(world.network).toBe(0)
  })

  test('opens, switches, toggles the band, and closes without starting a process', async ($, on) => {
    const world = setup(on)
    await $.command.run(command('tools'))
    expect(world.opened).toEqual(['cockpit'])
    expect(world.get('preferences')).toMatchObject({ view: 'tools', paneOpen: true })
    await $.command.run(command('band off'))
    expect(world.get('preferences').band).toBe(false)
    await $.command.run(command('band on'))
    expect(world.get('preferences').band).toBe(true)
    await $.command.run(command('close'))
    expect(world.closed).toEqual(['cockpit'])
    expect(world.get('preferences').paneOpen).toBe(false)
    expect(world.processes).toEqual([])
    expect(world.spawned).toBe(0)
  })

  test('rejects unknown views and malformed arguments before doing work', async ($, on) => {
    const world = setup(on)
    for (const args of ['unknown', 'tools extra', 'band maybe']) {
      expect((await $.command.run(command(args))).exitCode).toBe(1)
    }
    expect(world.opened).toEqual([])
    expect(world.processes).toEqual([])
    expect(world.fsStats).toEqual([])
    expect(world.network).toBe(0)
  })

  test('mounts every view on narrow and wide terminal and remote surfaces', { timeoutMs: 30000 }, async ($, on) => {
    const world = setup(on)
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      for (const columns of [40, 80, 140]) {
        for (const view of ['agents', 'tools', 'changes', 'context', 'reactor', 'images'] as const) {
          world.seed('preferences', { ...world.get('preferences'), view })
          const ui = await mountPane($, surface, columns)
          expect(await ui.find({ type: 'Text', text: 'COCKPIT' })).toBeDefined()
          expect((await ui.findAll({ type: 'Button' })).length).toBeGreaterThanOrEqual(6)
          const body = await ui.find({ type: 'Box' })
          expect(body?.props.backgroundColor).toBe(surface === 'terminal' ? '#1a1b26' : undefined)
          expect(body?.props.width).toBe(surface === 'terminal' ? columns : undefined)
          expect(body?.props.minHeight).toBe(surface === 'terminal' ? 28 : undefined)
          if (surface !== 'terminal') {
            expect(await ui.find({ type: 'Raster' })).toBeUndefined()
            expect(await ui.find({ type: 'Image' })).toBeUndefined()
          }
          await ui.unmount()
        }
      }
    }
    expect(world.processes).toEqual([])
    expect(world.network).toBe(0)
  })

  test('only docked terminal bodies cover the sidebar fill, with or without focus', async ($, on) => {
    const world = setup(on)
    for (const placement of ['dock', 'inline'] as const) {
      for (const isFocused of [false, true]) {
        const ui = await $.ui.mount({
          plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit',
          props: { ...paneProps(), placement, isFocused },
          viewport: { columns: 82, rows: 32, isFullscreen: placement === 'dock' },
        })
        const body = await ui.find({ type: 'Box' })
        expect(body?.props.backgroundColor).toBe(placement === 'dock' ? '#1a1b26' : undefined)
        expect(body?.props.width).toBe(placement === 'dock' ? 80 : undefined)
        expect(body?.props.minHeight).toBe(placement === 'dock' ? 28 : undefined)
        expect(await ui.find({ key: 'view-reactor' })).toBeDefined()
        await ui.unmount()
      }
    }
    expect(world.processes).toEqual([])
    expect(world.network).toBe(0)
  })

  test('view buttons use the real actions and the context view counts locally', async ($, on) => {
    const world = setup(on)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'view-context' })
    expect(world.get('preferences').view).toBe('context')
    expect(world.usageRequests).toEqual(['summary'])
    expect(world.network).toBe(0)
    expect(world.processes).toEqual([])
    await ui.unmount()
  })

  test('the band preserves engine content and yields to surveys', async ($, on) => {
    setup(on)
    const ordinary = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: bandProps() })
    expect(await ordinary.find({ type: 'Text', text: 'Native content remains.' }), 'ordinary band preserves downstream text').toBeDefined()
    expect(await ordinary.find({ key: 'cockpit-open' }), 'ordinary band shows cockpit controls').toBeDefined()
    await ordinary.unmount()
    const survey = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: bandProps(true) })
    expect(await survey.find({ type: 'Text', text: 'Native content remains.' }), 'survey keeps downstream text').toBeDefined()
    expect(await survey.find({ key: 'cockpit-open' })).toBeUndefined()
    await survey.unmount()
  })

  test('animation advances only while the reactor is active and pauses on request', async ($, on) => {
    const world = setup(on)
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
    await world.clock.advance(1000)
    expect(world.get('reactor').frame).toBe(0)
    await $.command.run(command('reactor'))
    await world.clock.advance(1000)
    const activeFrame = world.get('reactor').frame
    expect(activeFrame).toBeGreaterThan(0)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'reactor-toggle' })
    await world.clock.advance(1000)
    expect(world.get('reactor').frame).toBe(activeFrame)
    await ui.unmount()
    await $.command.run(command('tools'))
    await world.clock.advance(1000)
    expect(world.get('reactor').frame).toBe(activeFrame)
    expect(world.spawned).toBe(0)
  })
})

describe('cockpit explicit read-only actions', () => {
  test('requests only read-only git argument vectors and disables external diff drivers', async ($, on) => {
    const world = setup(on)
    await $.command.run(command('changes'))
    expect(world.processes.length).toBe(4)
    for (const argv of world.processes) {
      expect(argv[0]).toBe('git')
      expect(argv).toContain('--no-pager')
      expect(argv).not.toContain('sh')
      expect(argv).not.toContain('commit')
      expect(argv).not.toContain('push')
      expect(argv).not.toContain('checkout')
      if (argv.includes('diff')) {
        expect(argv).toContain('--no-ext-diff')
        expect(argv).toContain('--no-textconv')
      }
    }
    expect(world.get('review').branch).toBe('main')
    expect(world.get('review').changes.some(change => change.path === 'tracked.ts' && change.patch.includes('+new'))).toBe(true)
    expect(world.get('review').changes.some(change => change.path === 'new.txt' && change.untracked)).toBe(true)
    expect(world.network).toBe(0)
  })

  test('copy and quote actions do not submit a prompt or run a tool', async ($, on) => {
    const world = setup(on)
    world.seed('preferences', { ...world.get('preferences'), view: 'changes' })
    world.seed('review', { ...world.get('review'), selectedPath: 'tracked.ts', changes: [{
      path: 'tracked.ts', patch: PATCH, additions: 1, deletions: 1, source: 'observed', updatedAt: 1000,
    }] })
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'ops:copy-patch' })
    await ui.press({ key: 'ops:quote-patch' })
    expect(world.copies).toEqual([PATCH])
    expect(world.drafts.length).toBe(1)
    expect(world.drafts[0]).toContain(PATCH)
    expect(world.submitted).toBe(0)
    expect(world.processes).toEqual([])
    await ui.unmount()
  })

  test('image URLs and network paths are refused before accessing the filesystem', async ($, on) => {
    const world = setup(on)
    for (const path of ['https://example.test/image.png', '//server/share/image.png', '\\\\server\\image.png', 'data:image/png;base64,AAAA']) {
      await $.command.run(command(`images ${path}`))
      expect(world.get('images').error).not.toBeNull()
    }
    expect(world.fsStats).toEqual([])
    expect(world.fsReads).toEqual([])
    expect(world.network).toBe(0)
    expect(world.spawned).toBe(0)
  })

  test('a selected local PNG is validated before it is shown and has remote fallbacks', async ($, on) => {
    const world = setup(on)
    await $.command.run(command('images /project/image.png'))
    expect(world.fsStats).toEqual(['/project/image.png'])
    expect(world.fsReads).toEqual(['/project/image.png'])
    expect(world.get('images').error).toBeNull()
    expect(world.get('images').images.at(-1)).toMatchObject({ path: '/project/image.png', width: 1, height: 1 })
    const terminal = await mountPane($, 'terminal')
    expect(await terminal.find({ type: 'Image', key: 'selected-image' })).toBeDefined()
    await terminal.unmount()
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const ui = await mountPane($, surface)
      expect(await ui.find({ type: 'Image' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: 'image.png' })).toBeDefined()
      await ui.unmount()
    }
    expect(world.network).toBe(0)
  })

  test('same-path PNG reloads change the image generation even at the same clock time', async ($, on) => {
    const world = setup(on)
    await $.command.run(command('images /project/image.png'))
    expect(world.get('images').images[0]).toMatchObject({ generation: 1 })
    let ui = await mountPane($, 'terminal')
    expect(JSON.stringify(await ui.drawn())).toContain('"generation":1')
    await ui.unmount()

    await $.command.run(command('images /project/image.png'))
    expect(world.get('images').images.length).toBe(1)
    expect(world.get('images').images[0]).toMatchObject({ generation: 2 })
    // Mocked state does not invalidate an existing mounted drawing.
    ui = await mountPane($, 'terminal')
    expect(JSON.stringify(await ui.drawn())).toContain('"generation":2')

    await ui.press({ key: 'images-clear' })
    expect(world.get('images').images).toEqual([])
    await ui.unmount()
    await $.command.run(command('images /project/image.png'))
    expect(world.get('images').images[0]).toMatchObject({ generation: 3 })
    ui = await mountPane($, 'terminal')
    expect(JSON.stringify(await ui.drawn())).toContain('"generation":3')
    expect(world.network).toBe(0)
    await ui.unmount()
  })
})
