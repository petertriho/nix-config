import type { AgentInfo } from 'claude-code'
import type {
  CockpitActivity, CockpitAgent, CockpitAgentTotals, CockpitBackgroundTask, CockpitChange,
  CockpitCheck, CockpitCron, CockpitGitOperation, CockpitTask, CockpitTodo,
} from '../types'
import { cleanText } from './theme'

const MAX_ITEMS = 100
const MAX_PATH = 4096
const MAX_INPUT = 2 * 1024 * 1024
const MAX_PATCH = 24000
const MAX_PATCH_TOTAL = 200000
const MAX_COUNT = 1_000_000

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

const label = (value: string, limit = 240): string => cleanText(value.slice(0, limit))
const finite = (value: unknown, limit = MAX_COUNT): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(limit, Math.floor(value))
    : undefined
const hunkNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT
    ? value
    : undefined
const pathValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_PATH && !value.includes('\0')
    ? value
    : undefined
const terminal = (status: CockpitAgent['status']): boolean =>
  status === 'completed' || status === 'failed' || status === 'killed'

export const mergeAgents = (
  previous: CockpitAgent[], incoming: AgentInfo[], now: number,
): CockpitAgent[] => {
  const seenAt = finite(now, Number.MAX_SAFE_INTEGER) ?? 0
  const old = new Map(previous.slice(0, MAX_ITEMS).map(agent => [agent.id, agent]))
  const merged: CockpitAgent[] = []
  const seen = new Set<string>()
  for (const agent of incoming.slice(0, MAX_ITEMS)) {
    if (seen.has(agent.id)) continue
    seen.add(agent.id)
    const prior = old.get(agent.id)
    merged.push({
      id: agent.id,
      name: agent.name === undefined ? undefined : label(agent.name, 80),
      description: label(agent.description),
      type: label(agent.type, 80),
      status: agent.status,
      parentId: agent.parentId,
      teammateId: agent.teammateId,
      spawnedBy: agent.spawnedBy,
      lastSeenAt: seenAt,
      completedAt: terminal(agent.status) ? prior?.completedAt ?? seenAt : undefined,
      durationMs: prior?.durationMs,
      usage: prior?.usage,
      totals: prior?.totals,
      answer: prior?.answer,
    })
  }
  for (const agent of previous.slice(0, MAX_ITEMS)) {
    if (seen.has(agent.id)) continue
    seen.add(agent.id)
    merged.push({ ...agent, status: terminal(agent.status) ? agent.status : 'missing' })
  }
  return merged.slice(0, MAX_ITEMS)
}

// Parse only enough shell syntax to identify commands. Never retain arguments.
const commandSegments = (command: string): string[][] => {
  const segments: string[][] = []
  let words: string[] = []
  let word = ''
  let quote = ''
  let escaped = false
  let comment = false
  const pushWord = (): void => {
    if (word) words.push(word)
    word = ''
  }
  const pushSegment = (): void => {
    pushWord()
    if (words.length) segments.push(words)
    words = []
  }
  if (command.length > 8192 || command.includes('<<')) return []
  for (const char of command) {
    if (segments.length >= 16 || words.length >= 100) break
    if (comment) {
      if (char === '\n') { comment = false; pushSegment() }
      continue
    }
    if (escaped) { word += char; escaped = false; continue }
    if (char === '\\' && quote !== "'") { escaped = true; continue }
    if (quote) {
      if (char === quote) quote = ''
      else word += char
      continue
    }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '#' && !word) { comment = true; continue }
    if (';&|\n'.includes(char)) { pushSegment(); continue }
    if (/\s/.test(char)) { pushWord(); continue }
    word += char
  }
  if (!quote && !escaped) pushSegment()
  return segments
}

const commandWords = (words: string[]): string[] => {
  let index = words[0] === 'env' ? 1 : 0
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? '')) index++
  return words.slice(index)
}
const executable = (word: string | undefined): string | undefined => {
  if (!word) return undefined
  const name = word.slice(word.lastIndexOf('/') + 1)
  return /^[A-Za-z0-9_.+-]{1,80}$/.test(name) ? name : undefined
}

export const toolTarget = (tool: string, input: unknown): string | undefined => {
  const value = record(input)
  if (!value) return undefined
  if (['Read', 'Edit', 'Write', 'Glob', 'Grep', 'NotebookEdit'].includes(tool)) {
    const path = pathValue(value.file_path ?? value.notebook_path ?? value.path)
    return path === undefined ? undefined : label(path, 240)
  }
  if (tool === 'Bash' && typeof value.command === 'string') {
    return executable(commandWords(commandSegments(value.command)[0] ?? [])[0])
  }
  if (tool === 'Agent' && typeof value.description === 'string') return label(value.description)
  return undefined
}

const checkWords = (words: string[]): string | undefined => {
    const exe = executable(words[0])
    const args = words.slice(1)
    if (!exe) return undefined
    if (['npm', 'pnpm', 'yarn'].includes(exe)) {
      const script = args[0] === 'run' ? args[1] : args[0]
      if (script && /^(test|lint|typecheck|type-check|check|format|fmt)(?::[A-Za-z0-9_-]{1,40})?$/.test(script)) {
        return `${exe}${args[0] === 'run' ? ' run' : ''} ${script}`
      }
      if (args[0] === 'exec') {
        const nested = checkWords(args.slice(1))
        if (nested) return label(`${exe} exec ${nested}`)
      }
    }
    if (['npx', 'bunx'].includes(exe)) {
      const nested = checkWords(args.filter((arg, index) => index > 0 || !['--yes', '-y', '--no-install'].includes(arg)))
      if (nested) return label(`${exe} ${nested}`)
    }
    if (['pytest', 'py.test', 'jest', 'vitest'].includes(exe)) return exe
    if (/^python(?:3(?:\.\d+)?)?$/.test(exe) && args[0] === '-m' && args[1] === 'pytest') return 'pytest'
    if (exe === 'cargo' && ['test', 'check', 'clippy', 'fmt'].includes(args[0] ?? '')) return `cargo ${args[0]}`
    if (exe === 'go' && ['test', 'vet', 'fmt'].includes(args[0] ?? '')) return `go ${args[0]}`
    if (exe === 'nix') {
      const nixArgs = [...args]
      while (nixArgs[0]?.startsWith('--')) {
        const flag = nixArgs.shift()
        if (['--extra-experimental-features', '--experimental-features', '--option'].includes(flag ?? '')) {
          nixArgs.shift()
          if (flag === '--option') nixArgs.shift()
        } else break
      }
      if (nixArgs[0] === 'flake' && nixArgs[1] === 'check') return 'nix flake check'
      if (['eval', 'build', 'check'].includes(nixArgs[0] ?? '')) return `nix ${nixArgs[0]}`
    }
    if (['tsc', 'eslint', 'prettier', 'mypy', 'black', 'isort', 'rustfmt', 'nixfmt', 'nixpkgs-fmt', 'alejandra'].includes(exe)) return exe
    if (['ruff', 'biome'].includes(exe) && ['check', 'format'].includes(args[0] ?? '')) return `${exe} ${args[0]}`
    return undefined
}

export const detectCheck = (command: string): string | undefined => {
  for (const segment of commandSegments(command)) {
    const detected = checkWords(commandWords(segment))
    if (detected) return detected
  }
  return undefined
}

export type CheckFlags = { error?: boolean; denied?: boolean; interrupted?: boolean }

export const summarizeCheck = (
  id: string, checkLabel: string, result: unknown, flags: CheckFlags = {}, durationMs?: number,
): CockpitCheck => {
  const wrapper = record(result)
  const value = record(wrapper?.result) ?? wrapper
  const check: CockpitCheck = { id, label: label(checkLabel), status: 'completed' }
  const duration = finite(durationMs, Number.MAX_SAFE_INTEGER)
  if (duration !== undefined) check.durationMs = duration
  if (flags.denied || typeof wrapper?.deny === 'string') return { ...check, status: 'denied' }
  if (flags.interrupted || value?.interrupted === true) return { ...check, status: 'interrupted' }
  const nativeError = flags.error || wrapper?.isError === true
  // Summaries usually appear at the end. Output is transient, never returned.
  const output = typeof result === 'string' ? result.slice(-65536) : [
    typeof value?.stdout === 'string' ? value.stdout.slice(-65536) : '',
    typeof value?.stderr === 'string' ? value.stderr.slice(-65536) : '',
  ].join('\n')
  const text = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  let recognizedPass = false
  let recognizedFail = false
  let passed: number | undefined
  let failed: number | undefined
  const counts = (summary: string): void => {
    for (const match of summary.matchAll(/(\d+)\s+(passed|failed)\b/g)) {
      const count = Math.min(MAX_COUNT, Number(match[1]))
      if (match[2] === 'passed') passed = count
      else failed = count
    }
    if ((passed ?? 0) > 0) recognizedPass = true
    if ((failed ?? 0) > 0) recognizedFail = true
  }
  const cargo = [...text.matchAll(/^test result: (ok|FAILED)\.\s*(\d+) passed;\s*(\d+) failed;/gm)]
  if (cargo.length) {
    passed = 0
    failed = 0
    for (const match of cargo) {
      passed = Math.min(MAX_COUNT, passed + Number(match[2]))
      failed = Math.min(MAX_COUNT, failed + Number(match[3]))
      recognizedPass ||= match[1] === 'ok'
      recognizedFail ||= match[1] === 'FAILED'
    }
  } else {
    const summaries = [...text.matchAll(/^\s*Tests\s*:?\s+(.*)$/gm)]
    const testSummary = summaries.at(-1)?.[1]
    if (testSummary !== undefined) counts(testSummary)
    else {
      const pytest = [...text.matchAll(/^\s*(?:=+\s*)?(\d+ (?:passed|failed|skipped|error|errors|xfailed|xpassed).*?\bin \d+(?:\.\d+)?(?:s| seconds).*?)(?:\s*=+)?\s*$/gm)]
      const summary = pytest.at(-1)?.[1]
      if (summary !== undefined) {
        counts(summary)
        if (/\b[1-9]\d* errors?\b/.test(summary)) recognizedFail = true
      }
    }
  }
  if (/^ok[ \t]+\S+[ \t]+(?:\d+(?:\.\d+)?s|\(cached\))(?:[ \t]|$)/m.test(text)) recognizedPass = true
  if (/^(?:FAIL(?:\s|$)|--- FAIL:)/m.test(text)) recognizedFail = true
  if (passed !== undefined) check.passed = passed
  if (failed !== undefined) check.failed = failed
  if (nativeError || recognizedFail) check.status = 'failed'
  else if (typeof value?.backgroundTaskId === 'string') check.status = 'running'
  else if (recognizedPass) check.status = 'passed'
  return check
}

export type GitStatusEntry = {
  path: string
  status: string
  staged: boolean
  untracked: boolean
  originalPath?: string
}

export const parseGitStatus = (porcelain: string): GitStatusEntry[] => {
  const entries: GitStatusEntry[] = []
  const end = Math.min(porcelain.length, MAX_INPUT)
  let offset = 0
  const next = (): string | undefined => {
    const nul = porcelain.indexOf('\0', offset)
    if (nul < 0 || nul >= end) return undefined
    const item = porcelain.slice(offset, nul)
    offset = nul + 1
    return item
  }
  while (offset < end && entries.length < MAX_ITEMS) {
    const entry = next()
    if (entry === undefined) break
    const status = entry.slice(0, 2)
    if (!/^[ MADRCUT?!]{2}$/.test(status) || entry[2] !== ' ') continue
    const originalPath = /[RC]/.test(status) ? next() : undefined
    const path = pathValue(entry.slice(3))
    if (!path || status === '!!') continue
    if (/[RC]/.test(status) && !pathValue(originalPath)) continue
    entries.push({
      path, status, staged: ![' ', '?', '!'].includes(status.charAt(0)), untracked: status === '??',
      ...(originalPath === undefined ? {} : { originalPath }),
    })
  }
  return entries
}

const decodeGitPath = (value: string): string | undefined => {
  let decoded = value
  if (value.startsWith('"')) {
    const match = /^"((?:\\.|[^"\\])*)"/.exec(value)
    if (!match) return undefined
    decoded = (match[1] ?? '').replace(/(?:\\[0-7]{3})+|\\([abtnvfr\\"])/g, (escaped, named: string | undefined) => {
      if (named) {
        const escapes: Record<string, string> = { a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', '\\': '\\', '"': '"' }
        return escapes[named] ?? named
      }
      const octets = escaped.match(/\\([0-7]{3})/g) ?? []
      return new TextDecoder().decode(new Uint8Array(octets.map((octet: string) => parseInt(octet.slice(1), 8))))
    })
  }
  return pathValue(decoded)
}
const markerPath = (value: string): string | undefined => {
  const path = decodeGitPath(value.startsWith('"') ? value : value.split('\t')[0] ?? '')
  if (!path || path === '/dev/null') return undefined
  return path.replace(/^[ab]\//, '')
}
const headerPath = (line: string): string | undefined => {
  const value = line.slice('diff --git '.length)
  const boundary = Math.max(value.lastIndexOf(' b/'), value.lastIndexOf(' "b/'))
  return boundary < 0 ? undefined : markerPath(value.slice(boundary + 1))
}
const safePatch = (patch: string): string =>
  patch.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')

// A native diff view needs complete hunks. Omit a large first hunk instead of
// presenting a cut hunk as a valid patch. Counts still describe observed data.
const completePatch = (patch: string, wasTruncated = false): { patch: string; truncated: boolean } => {
  const text = patch.slice(0, MAX_PATCH)
  const cut = wasTruncated || patch.length > MAX_PATCH
  let offset = 0
  let boundary = 0
  let oldRemaining = 0
  let newRemaining = 0
  let inHunk = false
  let sawHunk = false
  for (const line of text.split('\n')) {
    const end = offset + line.length
    const terminated = end < text.length
    if (!terminated && cut) break
    const next = end + (terminated ? 1 : 0)
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line)
    if (hunk) {
      oldRemaining = Number(hunk[1] ?? 1)
      newRemaining = Number(hunk[2] ?? 1)
      inHunk = oldRemaining + newRemaining > 0
      sawHunk = true
      if (!inHunk) boundary = next
    } else if (inHunk) {
      if (line.startsWith('+') && newRemaining > 0) newRemaining--
      else if (line.startsWith('-') && oldRemaining > 0) oldRemaining--
      else if (line.startsWith(' ') && oldRemaining > 0 && newRemaining > 0) { oldRemaining--; newRemaining-- }
      else if (line !== '\\ No newline at end of file') break
      if (oldRemaining === 0 && newRemaining === 0) { inHunk = false; boundary = next }
    } else if (line === '\\ No newline at end of file' && boundary === offset) boundary = next
    offset = next
  }
  if (!sawHunk) return { patch: cut ? '' : text, truncated: cut }
  const value = text.slice(0, boundary)
  return { patch: value, truncated: cut || value.length < text.trimEnd().length }
}

export const parseGitDiff = (diff: string, now: number, staged = false): CockpitChange[] => {
  const changes: CockpitChange[] = []
  const input = diff.slice(0, MAX_INPUT)
  const lines = input.split('\n')
  let current: CockpitChange | undefined
  let chunks: string[] = []
  let size = 0
  let total = 0
  let inHunk = false
  let hadHunk = false
  let oldRemaining = 0
  let newRemaining = 0
  const finish = (): void => {
    if (!current) return
    if (current.path) {
      const bounded = completePatch(chunks.join(''), current.truncated)
      current.patch = bounded.patch
      current.truncated = bounded.truncated
      total += current.patch.length
      changes.push(current)
    }
    current = undefined
    chunks = []
    size = 0
    inHunk = false
    hadHunk = false
    oldRemaining = 0
    newRemaining = 0
  }
  const start = (path: string | undefined): void => {
    current = { path: path ?? '', patch: '', additions: 0, deletions: 0, source: 'git', staged, updatedAt: now }
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (line.startsWith('diff --git ')) {
      finish()
      if (changes.length >= MAX_ITEMS || total >= MAX_PATCH_TOTAL) break
      start(headerPath(line))
    } else if (!inHunk && line.startsWith('--- ') && (!current || hadHunk)) {
      finish()
      if (changes.length >= MAX_ITEMS || total >= MAX_PATCH_TOTAL) break
      start(markerPath(line.slice(4)))
    }
    if (!current) continue
    if (!inHunk && line.startsWith('--- ')) current.path = markerPath(line.slice(4)) ?? current.path
    if (!inHunk && line.startsWith('+++ ')) current.path = markerPath(line.slice(4)) ?? current.path
    if (!inHunk && line.startsWith('rename to ')) current.path = decodeGitPath(line.slice(10)) ?? current.path
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line)
    if (hunk) {
      oldRemaining = Number(hunk[1] ?? 1)
      newRemaining = Number(hunk[2] ?? 1)
      inHunk = oldRemaining + newRemaining > 0
      hadHunk = true
    } else if (inHunk) {
      if (line.startsWith('+')) {
        current.additions = Math.min(MAX_COUNT, current.additions + 1)
        newRemaining--
      } else if (line.startsWith('-')) {
        current.deletions = Math.min(MAX_COUNT, current.deletions + 1)
        oldRemaining--
      } else if (line.startsWith(' ')) {
        oldRemaining--
        newRemaining--
      }
      if (oldRemaining <= 0 && newRemaining <= 0) inHunk = false
    }
    const chunk = safePatch(line) + (index < lines.length - 1 ? '\n' : '')
    const available = Math.min(MAX_PATCH - size, MAX_PATCH_TOTAL - total - size)
    if (chunk.length > available) current.truncated = true
    if (available > 0) { chunks.push(chunk.slice(0, available)); size += Math.min(chunk.length, available) }
  }
  finish()
  const last = changes.at(-1)
  if (last && diff.length > MAX_INPUT) last.truncated = true
  return changes
}

export const normalizeObservedChanges = (
  tool: string, input: unknown, result: unknown, now: number,
): CockpitChange[] => {
  if (tool === 'Bash') {
    const wrapper = record(result)
    if (typeof wrapper?.deny === 'string') return []
    const value = record(wrapper?.result) ?? wrapper
    const files = record(value?.bashEditDiff)?.files
    if (!Array.isArray(files)) return []
    const changes: CockpitChange[] = []
    let total = 0
    for (const file of files.slice(0, MAX_ITEMS)) {
      const item = record(file)
      if (!item) continue
      const change = normalizeObservedChanges('Edit', {}, { filePath: item.filePath, structuredPatch: item.hunks }, now)[0]
      if (!change) continue
      const remaining = Math.max(0, MAX_PATCH_TOTAL - total)
      if (change.patch.length > remaining) {
        const bounded = completePatch(change.patch.slice(0, remaining), true)
        change.patch = bounded.patch
        change.truncated = true
      }
      total += change.patch.length
      changes.push(change)
    }
    return changes
  }
  if (tool !== 'Edit' && tool !== 'Write') return []
  const wrapper = record(result)
  if (wrapper?.isError === true || typeof wrapper?.deny === 'string') return []
  const value = record(wrapper?.result) ?? wrapper
  if (!value || value.staged === true) return []
  const path = pathValue(value.filePath) ?? pathValue(record(input)?.file_path)
  if (!path) return []
  const change: CockpitChange = { path, patch: '', additions: 0, deletions: 0, source: 'observed', updatedAt: now }
  const gitDiff = record(value.gitDiff)
  if (typeof gitDiff?.patch === 'string' && /^(?:diff --git |--- |\+\+\+ |@@ -|Binary files )/m.test(gitDiff.patch.slice(0, MAX_INPUT))) {
    const patch = safePatch(gitDiff.patch.slice(0, MAX_INPUT))
    const bounded = completePatch(patch, gitDiff.patch.length > MAX_INPUT)
    change.patch = bounded.patch
    change.truncated = bounded.truncated
    const parsed = parseGitDiff(patch, now)[0]
    change.additions = finite(gitDiff.additions) ?? parsed?.additions ?? 0
    change.deletions = finite(gitDiff.deletions) ?? parsed?.deletions ?? 0
    return [change]
  }
  if (!Array.isArray(value.structuredPatch) || value.structuredPatch.length === 0) return []
  const chunks = [`--- ${JSON.stringify(`a/${path}`)}\n+++ ${JSON.stringify(`b/${path}`)}\n`]
  let size = chunks[0]?.length ?? 0
  let accepted = 0
  let lineCount = 0
  const append = (text: string): void => {
    const chunk = safePatch(text.slice(0, MAX_PATCH + 1))
    const available = Math.max(0, MAX_PATCH - size)
    if (text.length > MAX_PATCH || chunk.length > available) change.truncated = true
    if (available) { chunks.push(chunk.slice(0, available)); size += Math.min(chunk.length, available) }
  }
  for (const hunk of value.structuredPatch.slice(0, 1000)) {
    const item = record(hunk)
    if (!item || !Array.isArray(item.lines)) continue
    const oldStart = hunkNumber(item.oldStart)
    const oldLines = hunkNumber(item.oldLines)
    const newStart = hunkNumber(item.newStart)
    const newLines = hunkNumber(item.newLines)
    if ([oldStart, oldLines, newStart, newLines].some(number => number === undefined)) continue
    const body = item.lines.slice(0, 10001)
    if (!body.length || body.some(line => typeof line !== 'string' || line.includes('\n') || !line.length || (!' +-'.includes(line.charAt(0)) && line !== '\\ No newline at end of file'))) continue
    accepted++
    append(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@\n`)
    for (const line of body) {
      if (++lineCount > 10000) { change.truncated = true; break }
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) change.additions++
      if (line.startsWith('-')) change.deletions++
      append(`${line}\n`)
    }
    if (lineCount > 10000) break
  }
  if (!accepted) return []
  if (value.structuredPatch.length > 1000) change.truncated = true
  const bounded = completePatch(chunks.join(''), change.truncated)
  change.patch = bounded.patch
  change.truncated = bounded.truncated
  return [change]
}

const MAX_SAMPLES = 240
const MAX_TODOS = 50
const MAX_TASKS = 100
const MAX_BACKGROUND = 40
const MAX_ANSWER = 4000

const text = (value: unknown, limit = 240): string | undefined =>
  typeof value === 'string' && value.length > 0 ? label(value, limit) : undefined
const array = (value: unknown, limit: number): unknown[] =>
  Array.isArray(value) ? value.slice(0, limit) : []
const resultOf = (result: unknown): Record<string, unknown> | undefined => {
  const wrapper = record(result)
  return record(wrapper?.result) ?? wrapper
}
const workStatus = (value: unknown): CockpitTodo['status'] | undefined =>
  value === 'pending' || value === 'in_progress' || value === 'completed' ? value : undefined

export const activityLevel = (activity: Pick<CockpitActivity, 'tools' | 'agents' | 'working'>): number =>
  activity.tools.filter(tool => tool.outcome === 'running').length
  + activity.agents.filter(agent => agent.status === 'running').length
  + (activity.working ? 1 : 0)

// Record the level only where it changes. The level holds between samples, so
// a history needs no timer and has no gaps while the pane is closed.
export const withSample = (activity: CockpitActivity, now: number): CockpitActivity => {
  const level = activityLevel(activity)
  const samples = Array.isArray(activity.samples) ? activity.samples : []
  if (samples.at(-1)?.level === level) return activity
  return { ...activity, samples: [...samples, { at: now, level }].slice(-MAX_SAMPLES) }
}

// Answers keep newlines and tabs for Markdown, and lose other control characters.
export const answerText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  return safePatch(value.slice(0, MAX_ANSWER)).trim() || undefined
}

export const agentResult = (result: unknown): { agentId: string; totals: CockpitAgentTotals; answer?: string } | undefined => {
  const value = resultOf(result)
  const agentId = text(value?.agentId, 200)
  if (!value || !agentId || value.status !== 'completed') return undefined
  const stats = record(value.toolStats)
  const models = array(value.modelsUsed, 8).flatMap(model => text(model, 80) ?? [])
  const resolved = text(value.resolvedModel, 80)
  const answer = answerText(array(value.content, 50).flatMap(block => {
    const blockText = record(block)?.text
    return typeof blockText === 'string' ? [blockText] : []
  }).join('\n'))
  return {
    agentId,
    totals: {
      tokens: finite(value.totalTokens, Number.MAX_SAFE_INTEGER) ?? 0,
      toolUses: finite(value.totalToolUseCount) ?? 0,
      durationMs: finite(value.totalDurationMs, Number.MAX_SAFE_INTEGER) ?? 0,
      linesAdded: finite(stats?.linesAdded),
      linesRemoved: finite(stats?.linesRemoved),
      models: models.length > 0 ? models : resolved ? [resolved] : [],
    },
    answer,
  }
}

export const todosOf = (result: unknown): CockpitTodo[] | undefined => {
  const value = resultOf(result)
  if (!Array.isArray(value?.newTodos)) return undefined
  return value.newTodos.slice(0, MAX_TODOS).flatMap(item => {
    const todo = record(item)
    const status = workStatus(todo?.status)
    const content = text(todo?.content)
    if (!status || !content) return []
    return [{ content, status, activeForm: text(todo?.activeForm) ?? content }]
  })
}

// TaskList is authoritative. Create, Get and Update change one entry.
export const applyTaskResult = (
  tasks: CockpitTask[], tool: string, input: unknown, result: unknown,
): CockpitTask[] | undefined => {
  const value = resultOf(result)
  const args = record(input)
  if (!value) return undefined
  const task = (item: unknown): CockpitTask | undefined => {
    const entry = record(item)
    const id = text(entry?.id, 80)
    const subject = text(entry?.subject)
    if (!id || !subject) return undefined
    return { id, subject, status: workStatus(entry?.status) ?? 'pending', owner: text(entry?.owner, 80) }
  }
  const upsert = (next: CockpitTask): CockpitTask[] =>
    [...tasks.filter(item => item.id !== next.id), next].slice(-MAX_TASKS)
  if (tool === 'TaskList' && Array.isArray(value.tasks)) {
    return value.tasks.slice(0, MAX_TASKS).flatMap(item => task(item) ?? [])
  }
  if (tool === 'TaskCreate' || tool === 'TaskGet') {
    const next = task(value.task)
    return next ? upsert({ ...tasks.find(item => item.id === next.id), ...next }) : undefined
  }
  if (tool === 'TaskUpdate' && value.success === true) {
    const id = text(value.taskId, 80)
    const existing = tasks.find(item => item.id === id)
    if (!id) return undefined
    if (args?.status === 'deleted') return tasks.filter(item => item.id !== id)
    const status = workStatus(record(value.statusChange)?.to) ?? workStatus(args?.status)
    const subject = text(args?.subject) ?? existing?.subject
    if (!subject) return undefined
    return upsert({
      id, subject, status: status ?? existing?.status ?? 'pending',
      owner: text(args?.owner, 80) ?? existing?.owner,
    })
  }
  return undefined
}

export const gitOperationOf = (id: string, result: unknown, now: number): CockpitGitOperation | undefined => {
  const operation = record(resultOf(result)?.gitOperation)
  if (!operation) return undefined
  const commit = record(operation.commit)
  const push = record(operation.push)
  const branch = record(operation.branch)
  const pr = record(operation.pr)
  const found: CockpitGitOperation = { id, at: now }
  const sha = text(commit?.sha, 64)
  if (sha) found.commit = { sha, kind: text(commit?.kind, 40) ?? 'committed', branch: text(commit?.branch, 200) }
  const pushed = text(push?.branch, 200)
  if (pushed) found.push = { branch: pushed }
  const ref = text(branch?.ref, 200)
  if (ref) found.branch = { ref, action: text(branch?.action, 40) ?? 'changed' }
  const number = finite(pr?.number)
  const url = text(pr?.url, 2048)
  if (number !== undefined) {
    found.pr = { number, action: text(pr?.action, 40) ?? 'changed', url: url?.startsWith('https://') ? url : undefined }
  }
  return found.commit || found.push || found.branch || found.pr ? found : undefined
}

// A launch is known from the tool result. The Stop snapshots report later
// states. A shell command line is never kept: only its description.
export const backgroundLaunch = (
  tool: string, input: unknown, result: unknown, now: number,
): CockpitBackgroundTask | undefined => {
  const value = resultOf(result)
  const args = record(input)
  const launched = (id: string | undefined, type: string, description: string | undefined): CockpitBackgroundTask | undefined =>
    id ? { id, type, status: 'running', description: description ?? type, startedAt: now, updatedAt: now } : undefined
  if (tool === 'Bash') {
    const command = typeof args?.command === 'string' ? toolTarget('Bash', args) : undefined
    return launched(text(value?.backgroundTaskId, 80), 'shell', text(args?.description) ?? command)
  }
  if (tool === 'Agent' && value?.status === 'async_launched') {
    return launched(text(value.agentId, 200), 'subagent', text(value.description) ?? text(args?.description))
  }
  if (tool === 'Monitor') return launched(text(value?.taskId, 80), 'monitor', text(args?.description))
  return undefined
}

export const backgroundSnapshot = (list: unknown, now: number): CockpitBackgroundTask[] =>
  array(list, MAX_BACKGROUND).flatMap(item => {
    const task = record(item)
    const id = text(task?.id, 200)
    if (!id) return []
    const type = text(task?.type, 40) ?? 'task'
    return [{
      id, type, status: text(task?.status, 40) ?? 'unknown',
      description: text(task?.description) ?? text(task?.name, 80) ?? type,
      agentType: text(task?.agent_type, 80), updatedAt: now,
    }]
  })

// The snapshot lists in-flight work only. A task that leaves it has ended,
// without a reported outcome.
export const mergeBackground = (
  previous: CockpitBackgroundTask[], snapshot: CockpitBackgroundTask[], now: number,
): CockpitBackgroundTask[] => {
  const live = new Map(snapshot.map(task => [task.id, task]))
  const kept = previous.map(task => {
    const current = live.get(task.id)
    if (current) return { ...task, ...current, startedAt: task.startedAt }
    return task.endedAt === undefined ? { ...task, status: 'ended', endedAt: now, updatedAt: now } : task
  })
  const added = snapshot.filter(task => !previous.some(item => item.id === task.id))
  return [...kept, ...added].slice(-MAX_BACKGROUND)
}

export const endBackground = (
  previous: CockpitBackgroundTask[], id: string, status: string, now: number,
): CockpitBackgroundTask[] =>
  previous.map(task => task.id === id && task.endedAt === undefined ? { ...task, status, endedAt: now, updatedAt: now } : task)

export const cronSnapshot = (list: unknown): CockpitCron[] =>
  array(list, 20).flatMap(item => {
    const cron = record(item)
    const id = text(cron?.id, 80)
    const schedule = text(cron?.schedule, 80)
    return id && schedule ? [{ id, schedule, recurring: cron?.recurring === true }] : []
  })
