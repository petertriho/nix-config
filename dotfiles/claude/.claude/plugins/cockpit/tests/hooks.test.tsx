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
import { initialActivity, initialContext, initialReview } from '../hooks/state'
import { colors } from '../hooks/theme'

type State = PluginState['cockpit']

const themeKeys = new Set<string>(Object.values(colors))

const PATCH = 'diff --git a/tracked.ts b/tracked.ts\n--- a/tracked.ts\n+++ b/tracked.ts\n@@ -1 +1 @@\n-old\n+new\n'
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
  store: Map<string, unknown>
  failStore: boolean
  invalidations: number
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
    network: 0, spawned: 0, logs: [], store: new Map(), failStore: false, invalidations: 0,
    get: key => values.get(key)?.value as State[typeof key],
    seed: (key, value) => { values.set(key, { value, version: (values.get(key)?.version ?? 0) + 1 }) },
  }
  world.seed('activity', { ...initialActivity(), sessionId: world.id, model: 'test-model' })
  world.seed('review', { ...initialReview(), sessionId: world.id })
  world.seed('context', { ...initialContext(), sessionId: world.id, usage: world.usage })
  world.seed('preferences', { view: 'agents', band: true, animation: true, span: 'fit', paneOpen: false })
  world.seed('mascot', { frame: 0, phase: 'idle' })

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
  on('store.get', (_$, e) => {
    if (world.failStore) throw new Error('Store refused.')
    return { value: world.store.get(e.key) }
  })
  on('store.set', (_$, e) => {
    if (world.failStore) throw new Error('Store refused.')
    world.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
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
  on('ui.invalidate', () => { world.invalidations += 1; return { value: undefined } })
  on('ui.log', (_$, e) => { world.logs.push(e.text); return { value: undefined } })
  on('ui.copy', (_$, e) => { world.copies.push(e.text); return { value: { isCopied: true } } })
  on('prompt.fill', (_$, e) => {
    world.drafts.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('prompt.submit', (_$, e) => { world.submitted += 1; return { text: e.text } })
  // No settings hooks run beneath the classic events in a session without them.
  for (const event of ['PostToolUse', 'PostToolUseFailure', 'Stop', 'SubagentStop', 'StopFailure'] as const) {
    on(`classic.${event}`, () => ({}))
  }
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
  on('fs.stat', (_$, e) => { world.fsStats.push(e.path); throw new Error('No file should be read.') })
  on('fs.read', (_$, e) => { world.fsReads.push(e.path); throw new Error('No file should be read.') })
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

const mountPaneWith = (engine: Engine, props: RenderPropsOf['Pane']) => engine.ui.mount({
  plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit',
  props, viewport: { columns: props.bodyColumns + 2, rows: 32, isFullscreen: true },
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

  test('help names the views, the band, and the keys that focus and resize the pane', async ($, on) => {
    setup(on)
    const help = await $.command.run(command('help'))
    expect(help.text).toContain('/cockpit [agents|tools|changes|context|activity]')
    expect(help.text).toContain('Ctrl+X ← or → resizes a docked pane')
    expect(help.text).toContain('Ctrl+X ↑ or ↓ a pane above the prompt')
  })

  test('rejects unknown views and malformed arguments before doing work', async ($, on) => {
    const world = setup(on)
    for (const args of ['unknown', 'tools extra', 'band maybe', 'images', 'images /tmp/screenshot.png']) {
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
        for (const view of ['agents', 'tools', 'changes', 'context', 'activity'] as const) {
          world.seed('preferences', { ...world.get('preferences'), view })
          const ui = await mountPane($, surface, columns)
          expect(await ui.find({ type: 'Text', text: 'COCKPIT' })).toBeDefined()
          expect((await ui.findAll({ type: 'Button' })).length).toBeGreaterThanOrEqual(5)
          const body = await ui.find({ type: 'Box' })
          expect(body?.props.backgroundColor).toBeUndefined()
          for (const element of await ui.findAll({})) {
            for (const prop of ['color', 'borderColor', 'backgroundColor']) {
              const value = element.props[prop]
              if (value !== undefined) expect(themeKeys.has(value as string)).toBe(true)
            }
          }
          expect(await ui.find({ type: 'Raster' })).toBeUndefined()
          expect(await ui.find({ type: 'Svg' })).toBeUndefined()
          await ui.unmount()
        }
      }
    }
    expect(world.processes).toEqual([])
    expect(world.network).toBe(0)
  })

  test('docked and inline bodies leave the background to the engine, with or without focus', async ($, on) => {
    const world = setup(on)
    for (const placement of ['dock', 'inline'] as const) {
      for (const isFocused of [false, true]) {
        const ui = await $.ui.mount({
          plugin: 'cockpit', surface: 'terminal', component: 'Pane', requestId: 'cockpit',
          props: { ...paneProps(), placement, isFocused },
          viewport: { columns: 82, rows: 32, isFullscreen: placement === 'dock' },
        })
        const body = await ui.find({ type: 'Box' })
        expect(body?.props.backgroundColor).toBeUndefined()
        expect(body?.props.width).toBeUndefined()
        expect(body?.props.minHeight).toBeUndefined()
        expect(await ui.find({ key: 'view-activity' })).toBeDefined()
        const resize = placement === 'dock' ? 'Ctrl+X ←/→ resize' : 'Ctrl+X ↑/↓ resize'
        expect(await ui.find({ type: 'Text', text: resize })).toBeDefined()
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

  test('the cat animates only in the activity view and pauses on request', async ($, on) => {
    const world = setup(on)
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
    await world.clock.advance(1000)
    expect(world.get('mascot').frame).toBe(0)
    await $.command.run(command('activity'))
    await world.clock.advance(1000)
    const activeFrame = world.get('mascot').frame
    expect(activeFrame).toBeGreaterThan(0)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'activity:animation' })
    expect(world.get('preferences').animation).toBe(false)
    await world.clock.advance(1000)
    expect(world.get('mascot').frame).toBe(activeFrame)
    await ui.press({ key: 'activity:span' })
    expect(world.get('preferences').span).toBe('5m')
    await ui.unmount()
    await $.command.run(command('tools'))
    await world.clock.advance(1000)
    expect(world.get('mascot').frame).toBe(activeFrame)
    expect(world.spawned).toBe(0)
  })

  test('the header tabs keep their order, mark the active view, and switch with the real action', async ($, on) => {
    const world = setup(on)
    for (const columns of [44, 80, 140]) {
      const ui = await mountPane($, 'terminal', columns)
      const tabs = (await ui.findAll({ type: 'Button' })).map(button => button.key).filter(key => String(key).startsWith('view-'))
      expect(tabs).toEqual(['view-agents', 'view-tools', 'view-changes', 'view-context', 'view-activity'])
      expect((await ui.find({ key: 'view-agents' }))?.props.dimColor).toBe(false)
      expect((await ui.find({ key: 'view-tools' }))?.props.dimColor).toBe(true)
      expect(await ui.find({ type: 'Text', text: '▔▔▔▔▔▔▔▔▔' })).toBeDefined()
      await ui.unmount()
    }
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'view-tools' })
    expect(world.get('preferences').view).toBe('tools')
    await ui.unmount()
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
    await ui.press({ key: 'changes:copy-path' })
    await ui.press({ key: 'changes:copy' })
    await ui.press({ key: 'changes:quote' })
    expect(world.copies).toEqual(['tracked.ts', PATCH])
    expect(world.drafts.length).toBe(1)
    expect(world.drafts[0]).toContain(PATCH)
    expect(world.submitted).toBe(0)
    expect(world.processes).toEqual([])
    await ui.unmount()
  })

  test('copy path gives the path from the repository root, also for an edit seen before a Git read', async ($, on) => {
    const world = setup(on)
    world.seed('preferences', { ...world.get('preferences'), view: 'changes' })
    const observed = (path: string) => ({ path, patch: '', additions: 0, deletions: 0, source: 'observed' as const, updatedAt: 1000 })
    world.seed('review', { ...world.get('review'), selectedPath: '/project/src/a.ts', changes: [observed('/project/src/a.ts'), observed('/elsewhere/b.ts')] })
    let ui = await mountPane($, 'terminal')
    await ui.press({ key: 'changes:copy-path' })
    await ui.press({ key: 'changes:select:/elsewhere/b.ts' })
    await ui.unmount()
    ui = await mountPane($, 'terminal')
    await ui.press({ key: 'changes:copy-path' })
    await ui.unmount()
    expect(world.copies).toEqual(['src/a.ts', '/elsewhere/b.ts'])
    expect(world.processes).toEqual([])
    expect(world.submitted).toBe(0)
  })

  test('a view removed in an earlier version falls back to the agents view', async ($, on) => {
    const world = setup(on)
    // Session memory from before a hot reload can hold the removed images view.
    world.seed('preferences', { ...world.get('preferences'), view: 'images' as unknown as State['preferences']['view'] })
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ key: 'agents:refresh' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).not.toContain('undefined')
    await ui.unmount()
  })
})

describe('cockpit live data', () => {
  test('an asked permission and the PostToolUse time separate the wait from the run', async ($, on) => {
    const world = setup(on)
    let asking = false
    on('tool.check', () => ({ decision: asking ? 'ask' as const : 'allow' as const }))
    on('tool.call', { tool: 'Bash' }, async (_$, e) => {
      asking = true
      await $.tool.check({ tool: 'Bash', input: { command: e.command }, tool_use_id: e.tool_use_id })
      asking = false
      await world.clock.advance(3000)
      await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: e.tool_use_id, duration_ms: 1200 })
      return { result: { stdout: 'Tests: 2 passed', stderr: '', interrupted: false } }
    })
    await $.tool.call({ tool: 'Bash', tool_use_id: 'asked', command: 'npm test' })
    const tool = world.get('activity').tools.find(item => item.id === 'asked')
    expect(tool).toMatchObject({ approval: 'asked', runMs: 1200, outcome: 'success' })
    expect((tool?.finishedAt ?? 0) - (tool?.startedAt ?? 0)).toBe(3000)
    expect(world.get('review').checks.at(-1)).toMatchObject({ status: 'passed', durationMs: 1200 })
    // A query carries no call id, so it marks no tool.
    asking = true
    await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
    expect(world.get('activity').tools.filter(item => item.approval === 'asked')).toHaveLength(1)
  })

  test('TodoWrite and task results build the plan that the band summarizes', async ($, on) => {
    const world = setup(on)
    on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [
      { content: 'Read code', status: 'completed', activeForm: 'Reading code' },
      { content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' },
    ] } }))
    on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: 'Release' } } }))
    on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => ({ result: e.status === 'deleted'
      ? { success: true, taskId: e.taskId, updatedFields: ['status'] }
      : { success: true, taskId: e.taskId, updatedFields: ['status'], statusChange: { from: 'pending', to: 'in_progress' } } }))
    on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: [
      { id: '2', subject: 'Review', status: 'completed', blockedBy: [] },
      { id: '3', subject: 'Deploy', status: 'pending', owner: 'lead', blockedBy: ['2'] },
    ] } }))
    await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'todo-1', todos: [] })
    expect(world.get('activity').todos).toMatchObject([{ items: [{ content: 'Read code', status: 'completed' }, { content: 'Write tests', activeForm: 'Writing tests' }] }])
    await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'task-1', subject: 'Release', description: 'Ship it.' })
    await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'task-2', taskId: '1', status: 'in_progress' })
    expect(world.get('activity').tasks).toEqual([{ id: '1', subject: 'Release', status: 'in_progress' }])
    const band = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: bandProps() })
    expect(await band.find({ type: 'Text', text: '1/2 Writing tests' })).toBeDefined()
    await band.unmount()
    await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'task-3', taskId: '1', status: 'deleted' })
    expect(world.get('activity').tasks).toEqual([])
    await $.tool.call({ tool: 'TaskList', tool_use_id: 'task-4' })
    expect(world.get('activity').tasks.map(task => [task.id, task.status, task.owner])).toEqual([['2', 'completed', undefined], ['3', 'pending', 'lead']])
  })

  test('a finished Agent call keeps run totals and its answer after the roster drops it', async ($, on) => {
    const world = setup(on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: {
      status: 'completed', agentId: 'agent-7', agentType: 'Explore', prompt: 'Find files.',
      content: [{ type: 'text', text: 'Found **3** files.' }, { type: 'text', text: 'Done.' }],
      totalToolUseCount: 4, totalDurationMs: 9000, totalTokens: 12000, modelsUsed: ['test-model'],
      toolStats: { readCount: 3, searchCount: 1, bashCount: 0, editFileCount: 1, linesAdded: 5, linesRemoved: 1, otherToolCount: 0 },
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    } }) as never)
    on('turn.complete', (_$, e) => ({ text: e.answer, usage: e.usage }))
    await $.tool.call({ tool: 'Agent', tool_use_id: 'spawn-7', description: 'Find files', prompt: 'Find files.', subagent_type: 'Explore' })
    expect(world.get('activity').agents.find(agent => agent.id === 'agent-7')).toMatchObject({
      status: 'completed', type: 'Explore', description: 'Find files',
      totals: { tokens: 12000, toolUses: 4, durationMs: 9000, linesAdded: 5, linesRemoved: 1, models: ['test-model'] },
      answer: 'Found **3** files.\nDone.',
    })
    await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'agent-7', agent_type: 'Explore', agent_transcript_path: '', last_assistant_message: 'Ignored: an answer is known.' })
    expect(world.get('activity').agents.find(agent => agent.id === 'agent-7')?.answer).toBe('Found **3** files.\nDone.')
    await $.turn.complete(completion({ turnId: 'agent-turn', agentId: 'agent-7', answer: 'Final report.' }))
    expect(world.get('activity').agents.find(agent => agent.id === 'agent-7')).toMatchObject({ answer: 'Final report.', totals: { tokens: 12000 } })
  })

  test('background work and git operations are recorded without command lines or cron prompts', async ($, on) => {
    const world = setup(on)
    on('tool.call', { tool: 'Bash' }, (_$, e) => e.tool_use_id === 'bg'
      ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'shell-1' } }
      : { result: { stdout: '', stderr: '', interrupted: false, gitOperation: {
        commit: { sha: 'abc123def456', kind: 'committed', branch: 'main' },
        pr: { number: 9, action: 'created', url: 'https://example.test/pull/9' },
      } } })
    on('tool.call', { tool: 'TaskStop' }, () => ({ result: { message: 'Stopped.', task_id: 'mon-1', task_type: 'monitor' } }))
    await $.tool.call({ tool: 'Bash', tool_use_id: 'bg', command: 'npm run watch --secret-flag', description: 'Watch the build', run_in_background: true })
    expect(world.get('activity').background).toMatchObject([{ id: 'shell-1', type: 'shell', status: 'running', description: 'Watch the build' }])
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [
      { id: 'shell-1', type: 'shell', status: 'running', description: 'Watch the build', command: 'npm run watch --secret-flag' },
      { id: 'mon-1', type: 'monitor', status: 'running', description: 'Tail logs', server: 'logs', tool: 'tail' },
    ], session_crons: [{ id: 'cron-1', schedule: '0 9 * * 1-5', recurring: true, prompt: 'private cron prompt' }] })
    expect(world.get('activity').background.map(task => [task.id, task.status])).toEqual([['shell-1', 'running'], ['mon-1', 'running']])
    expect(world.get('activity').crons).toEqual([{ id: 'cron-1', schedule: '0 9 * * 1-5', recurring: true }])
    expect(world.get('activity').backgroundAt).not.toBeNull()
    await $.tool.call({ tool: 'TaskStop', tool_use_id: 'stop-1', task_id: 'mon-1' })
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] })
    expect(world.get('activity').background.map(task => [task.id, task.status, task.endedAt !== undefined])).toEqual([['shell-1', 'ended', true], ['mon-1', 'stopped', true]])
    expect(JSON.stringify(world.get('activity'))).not.toContain('secret-flag')
    expect(JSON.stringify(world.get('activity'))).not.toContain('private cron prompt')
    await $.tool.call({ tool: 'Bash', tool_use_id: 'commit', command: 'git commit -m "message"' })
    expect(world.get('review').gitOps).toMatchObject([{
      id: 'commit', commit: { sha: 'abc123def456', kind: 'committed', branch: 'main' },
      pr: { number: 9, action: 'created', url: 'https://example.test/pull/9' },
    }])
  })

  test('a stop failure shows in the band and the pane until the next turn', async ($, on) => {
    const world = setup(on)
    await $.classic.StopFailure({ error: 'rate_limit', error_details: 'Retry in 30 seconds.' })
    expect(world.get('activity').stopFailure).toMatchObject({ error: 'rate_limit', details: 'Retry in 30 seconds.' })
    const band = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: bandProps() })
    expect(await band.find({ type: 'Text', text: 'stopped: rate limit' })).toBeDefined()
    await band.unmount()
    const pane = await mountPane($, 'terminal')
    expect(await pane.find({ type: 'Text', text: 'Last turn stopped: rate limit · Retry in 30 seconds.' })).toBeDefined()
    await pane.unmount()
    await $.turn.start({ text: 'Again.', turnId: 'next-turn' })
    expect(world.get('activity').stopFailure).toBeNull()
    await $.classic.StopFailure({ error: 'overloaded', agent_id: 'child' })
    expect(world.get('activity').stopFailure).toBeNull()
  })

  test('compactions and cost growth are recorded, and a precompute is not', async ($, on) => {
    const world = setup(on)
    const messages = [{ role: 'user' as const, text: 'Summary.', toolUses: [] }]
    on('session.compact', (_$, e) => e.trigger === 'manual'
      ? { skip: 'A hook blocked it.' }
      : { messages, tokensBefore: 150000, tokensAfter: 20000 })
    await $.session.compact({ trigger: 'auto', messages })
    await $.session.compact({ trigger: 'precompute', messages })
    await $.session.compact({ trigger: 'manual', messages })
    expect(world.get('context').compactions).toMatchObject([
      { trigger: 'auto', tokensBefore: 150000, tokensAfter: 20000 },
      { trigger: 'manual', skipped: 'A hook blocked it.' },
    ])
    for (const usd of [1, 1, 1.5, 2.25]) {
      await $.session.measure({ context: { window: 200000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })
    }
    expect(world.get('context').costs.map(sample => sample.usd)).toEqual([1, 1.5, 2.25])
    world.seed('preferences', { ...world.get('preferences'), view: 'context' })
    const pane = await mountPane($, 'terminal')
    expect(await pane.find({ type: 'Text', text: 'Last turn ' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '$0.75' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'auto · 150k → 20k (−87%)' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'manual · skipped: A hook blocked it.' })).toBeDefined()
    await pane.unmount()
  })

  test('saved preferences load at session start, and choices are saved for the next session', async ($, on) => {
    const world = setup(on)
    world.store.set('preferences', { view: 'context', band: false, animation: false })
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: false })
    expect(world.get('preferences')).toMatchObject({ view: 'context', band: false, animation: false })
    await $.command.run(command('band on'))
    await $.command.run(command('tools'))
    expect(world.store.get('preferences')).toEqual({ view: 'tools', band: true, animation: false, span: 'fit' })
  })

  test('a store that cannot be read or written leaves the defaults and the command works', async ($, on) => {
    const world = setup(on)
    world.failStore = true
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: false })
    expect(world.commands).toEqual(['cockpit'])
    expect((await $.command.run(command('band off'))).exitCode).toBeUndefined()
    expect(world.get('preferences').band).toBe(false)
  })

  test('the pane follows the agent in view until the person chooses another', async ($, on) => {
    const world = setup(on)
    world.agents = [
      { id: 'first', name: 'First worker', description: 'One', type: 'Explore', status: 'running' },
      { id: 'second', name: 'Second worker', description: 'Two', type: 'Explore', status: 'running' },
      { id: 'third', name: 'Third worker', description: 'Three', type: 'Explore', status: 'running' },
    ]
    await $.command.run(command('agents'))
    const viewing = (agentId: string) => mountPaneWith($, { ...paneProps(), view: { agentId } })
    let ui = await viewing('first')
    expect(await ui.find({ key: 'agents:detail:first' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' · in view' })).toBeDefined()
    await ui.press({ key: 'agents:select:second' })
    expect(world.get('activity')).toMatchObject({ selectedAgent: 'second', selectedFor: 'first' })
    await ui.unmount()
    ui = await viewing('first')
    expect(await ui.find({ key: 'agents:detail:second' })).toBeDefined()
    await ui.unmount()
    ui = await viewing('third')
    expect(await ui.find({ key: 'agents:detail:third' })).toBeDefined()
    await ui.unmount()
  })

  test('activity samples record each level change from events, with no timer', async ($, on) => {
    const world = setup(on)
    on('tool.call', { tool: 'Read' }, async () => { await world.clock.advance(2000); return { result: { type: 'text' } } as never })
    await $.turn.start({ text: 'Work.', turnId: 'sampled' })
    await $.tool.call({ tool: 'Read', tool_use_id: 'read-1', file_path: '/project/a.ts' })
    expect(world.get('activity').samples.map(sample => sample.level)).toEqual([1, 2, 1])
    const times = world.get('activity').samples.map(sample => sample.at)
    expect(times[2]! - times[1]!).toBe(2000)
  })

  test('the turn clock starts with a main turn and stops when it completes or fails', async ($, on) => {
    const world = setup(on)
    on('turn.complete', (_$, e) => ({ text: e.answer, usage: e.usage }))
    await $.turn.start({ text: 'Work.', turnId: 'main-turn' })
    expect(world.get('activity').turnStartedAt).toBe(10000)
    await $.turn.complete(completion({ turnId: 'child-turn', agentId: 'child' }))
    expect(world.get('activity').turnStartedAt).toBe(10000)
    await $.turn.complete(completion())
    expect(world.get('activity').turnStartedAt).toBeNull()
    await $.turn.start({ text: 'Again.', turnId: 'failing' })
    await $.classic.StopFailure({ error: 'overloaded' })
    expect(world.get('activity').turnStartedAt).toBeNull()
  })

  test('each measured context fill is kept once, and at most 100 are', async ($, on) => {
    const world = setup(on)
    for (const tokens of [1000, 1000, 2000]) {
      await $.session.measure({ context: { window: 200000, tokens }, rateLimits: [], changed: ['context'] })
    }
    expect(world.get('context').fills.map(fill => fill.tokens)).toEqual([1000, 2000])
    for (let index = 0; index < 120; index += 1) {
      await $.session.measure({ context: { window: 200000, tokens: 3000 + index }, rateLimits: [], changed: ['context'] })
    }
    expect(world.get('context').fills).toHaveLength(100)
    expect(world.get('context').fills.at(-1)?.tokens).toBe(3119)
  })

  test('observed edits count per file, and a git read keeps the counts', async ($, on) => {
    const world = setup(on)
    on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: '/project/tracked.ts', structuredPatch: [
      { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old', '+new'] },
    ] } }) as never)
    await $.command.run(command('changes'))
    const edit = { tool: 'Edit' as const, file_path: '/project/tracked.ts', old_string: 'old', new_string: 'new' }
    await $.tool.call({ ...edit, tool_use_id: 'edit-1' })
    await $.tool.call({ ...edit, tool_use_id: 'edit-2' })
    const edited = () => world.get('review').changes.find(change => change.path === 'tracked.ts')
    expect(edited()).toMatchObject({ edits: 2, state: 'modified' })
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'changes:refresh' })
    await ui.unmount()
    expect(edited()).toMatchObject({ edits: 2, state: 'modified' })
    expect(world.get('review').changes.find(change => change.path === 'new.txt')).toMatchObject({ state: 'untracked' })
    expect(world.processes.every(argv => argv[0] === 'git')).toBe(true)
  })

  test('the old reactor name opens the activity view, from the command and from the store', async ($, on) => {
    const world = setup(on)
    await $.command.run(command('reactor'))
    expect(world.get('preferences').view).toBe('activity')
    world.store.set('preferences', { view: 'reactor', band: true, animation: true, span: 'sideways' })
    world.seed('preferences', { ...world.get('preferences'), view: 'agents', span: '15m' })
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: false })
    expect(world.get('preferences')).toMatchObject({ view: 'activity', span: '15m' })
  })

  test('running work redraws elapsed times each second, even with the pane closed', async ($, on) => {
    const world = setup(on)
    await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
    await world.clock.advance(2000)
    const idle = world.invalidations
    await world.clock.advance(3000)
    expect(world.invalidations).toBe(idle)
    await $.turn.start({ text: 'Work.', turnId: 'busy' })
    const started = world.invalidations
    await world.clock.advance(3000)
    expect(world.invalidations - started).toBeGreaterThanOrEqual(2)
    expect(world.spawned).toBe(0)
  })

  test('state saved by an earlier version is filled in instead of breaking hooks or the pane', async ($, on) => {
    const world = setup(on)
    const legacy: Record<string, unknown> = { ...initialActivity(), sessionId: world.id, samples: [1, 2] }
    for (const key of ['todos', 'tasks', 'background', 'crons', 'backgroundAt', 'stopFailure', 'selectedFor']) delete legacy[key]
    world.seed('activity', legacy as unknown as State['activity'])
    world.seed('review', { ...initialReview(), sessionId: world.id, gitOps: undefined } as unknown as State['review'])
    world.seed('context', { sessionId: world.id, usage: null, refreshedAt: null, loading: false, error: null } as unknown as State['context'])
    on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [{ content: 'Upgrade', status: 'pending', activeForm: 'Upgrading' }] } }))
    await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'legacy-todo', todos: [] })
    expect(world.get('activity').todos).toHaveLength(1)
    expect(world.get('activity').samples.every(sample => typeof sample === 'object')).toBe(true)
    for (const view of ['agents', 'tools', 'changes', 'context', 'activity'] as const) {
      world.seed('preferences', { ...world.get('preferences'), view })
      const ui = await mountPane($, 'terminal')
      expect(await ui.find({ type: 'Text', text: 'COCKPIT' })).toBeDefined()
      await ui.unmount()
    }
    await $.session.measure({ context: { window: 200000 }, rateLimits: [], cost: { usd: 1 }, changed: ['cost'] })
    expect(world.get('context').costs).toHaveLength(1)
    expect(world.logs).toEqual([])
  })
})
