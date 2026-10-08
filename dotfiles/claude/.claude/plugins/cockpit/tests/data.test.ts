import type { AgentInfo } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { CockpitAgent } from '../types'
import {
  detectCheck, mergeAgents, normalizeObservedChanges,
  parseGitDiff, parseGitStatus, summarizeCheck, toolTarget,
} from '../hooks/data'

const first = <T>(items: T[]): T => {
  const item = items[0]
  if (item === undefined) throw new Error('Expected at least one item.')
  return item
}
const agent = (id: string, status: AgentInfo['status'] = 'running'): AgentInfo => ({
  id, status, description: `Task ${id}`, type: 'Explore', name: id,
})
const remembered = (id: string, status: CockpitAgent['status'] = 'running'): CockpitAgent => ({
  ...agent(id), status, lastSeenAt: 10,
})
const diff = (path: string, added = 'new', removed = 'old'): string =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-${removed}\n+${added}\n`

describe('agent snapshots', () => {
  test('marks disappeared agents missing but keeps terminal outcomes and timing', () => {
    const done = { ...remembered('done', 'completed'), completedAt: 8, durationMs: 7 }
    const previous = [remembered('active'), done, remembered('failed', 'failed'), remembered('killed', 'killed')]
    const merged = mergeAgents(previous, [], 20)
    expect(merged.map(item => item.status)).toEqual(['missing', 'completed', 'failed', 'killed'])
    expect(first(merged).lastSeenAt).toBe(10)
    expect(merged[1]).toMatchObject({ completedAt: 8, durationMs: 7 })
    expect(first(previous).status).toBe('running')
  })

  test('uses native status on reappearance and retains observed usage', () => {
    const usage = { model: 'model', input_tokens: 12, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    const old = { ...remembered('a', 'missing'), usage, durationMs: 40 }
    const merged = mergeAgents([old], [{ ...agent('a', 'idle'), parentId: 'parent', teammateId: 'a@team' }], 50)
    expect(first(merged)).toMatchObject({ status: 'idle', lastSeenAt: 50, usage, parentId: 'parent', teammateId: 'a@team' })
    expect(first(mergeAgents(merged, [agent('a', 'completed')], 60)).completedAt).toBe(60)
  })

  test('bounds and deduplicates agents with incoming entries first', () => {
    const incoming = Array.from({ length: 120 }, (_, index) => agent(`new-${index}`))
    expect(mergeAgents([remembered('old')], incoming, 30)).toHaveLength(100)
    expect(mergeAgents([], [agent('a'), agent('a')], 30)).toHaveLength(1)
    expect(first(mergeAgents([], [{ ...agent('a'), description: 'x'.repeat(1000) + '\x1b[31m' }], 30)).description.length).toBe(240)
  })
})

describe('safe tool and check labels', () => {
  test('keeps only known file paths, executables, or agent descriptions', () => {
    expect(toolTarget('Bash', { command: 'TOKEN=secret /usr/bin/pytest --password secret' })).toBe('pytest')
    expect(toolTarget('Bash', { command: 'env TOKEN=secret npm test --token secret' })).toBe('npm')
    expect(toolTarget('Read', { file_path: '/tmp/file\nname', secret: 'hidden' })).toBe('/tmp/file name')
    expect(toolTarget('Grep', { pattern: 'secret expression', path: '/project' })).toBe('/project')
    expect(toolTarget('mcp__unknown', { command: 'secret', description: 'secret' })).toBeUndefined()
    expect(toolTarget('Bash', { command: '"$(cat secret)" --value secret' })).toBeUndefined()
  })

  test('recognizes actual test, formatting, and typechecking invocations', () => {
    const commands: [string, string][] = [
      ['npm test -- --private secret', 'npm test'], ['pnpm run test:unit --token secret', 'pnpm run test:unit'],
      ['yarn test', 'yarn test'], ['cd project && pytest -q', 'pytest'], ['python3 -m pytest', 'pytest'],
      ['cargo test --all', 'cargo test'], ['go test ./...', 'go test'], ['nix flake check', 'nix flake check'],
      ['nix --extra-experimental-features "nix-command flakes" flake check', 'nix flake check'],
      ['nix eval .#value', 'nix eval'], ['nix build .#package', 'nix build'], ['nix check', 'nix check'],
      ['pnpm exec tsc --noEmit', 'pnpm exec tsc'], ['npx prettier --check .', 'npx prettier'],
      ['ruff format --check .', 'ruff format'], ['cargo fmt --check', 'cargo fmt'], ['nixfmt file.nix', 'nixfmt'],
    ]
    for (const [command, expected] of commands) expect(detectCheck(command)).toBe(expected)
  })

  test('does not treat argument text or unknown commands as checks', () => {
    expect(detectCheck('printf "%s" "npm test && pytest"')).toBeUndefined()
    expect(detectCheck('cat test-results.txt')).toBeUndefined()
    expect(detectCheck('npm install')).toBeUndefined()
    expect(detectCheck('unknown --argument test')).toBeUndefined()
    expect(detectCheck('npx "echo; pytest"')).toBeUndefined()
    expect(detectCheck('pnpm exec "echo && pytest"')).toBeUndefined()
    expect(detectCheck('echo text # ; pytest')).toBeUndefined()
    expect(detectCheck('cat <<EOF\nnpm test\nEOF')).toBeUndefined()
    expect(detectCheck('x'.repeat(9000) + '; pytest')).toBeUndefined()
  })
})

describe('check summaries', () => {
  test('parses Jest and Vitest test counts without suite-count confusion', () => {
    const jest = summarizeCheck('j', 'npm test', { stdout: 'Test Suites: 2 passed, 2 total\nTests: 1 failed, 9 passed, 10 total\n', stderr: '' }, {}, 123.8)
    expect(jest).toMatchObject({ status: 'failed', passed: 9, failed: 1, durationMs: 123 })
    expect(summarizeCheck('v', 'vitest', { stdout: '\x1b[32m Tests  4 passed (4)\x1b[0m\n' })).toMatchObject({ status: 'passed', passed: 4 })
  })

  test('parses pytest results including errors and quiet summaries', () => {
    expect(summarizeCheck('p', 'pytest', { stdout: '================ 7 passed, 2 skipped in 0.25s ================\n' })).toMatchObject({ status: 'passed', passed: 7 })
    expect(summarizeCheck('p', 'pytest', { stdout: '1 failed, 2 passed in 1.20s\n' })).toMatchObject({ status: 'failed', passed: 2, failed: 1 })
    expect(summarizeCheck('p', 'pytest', { stdout: '================ 1 error in 0.10s ================\n' }).status).toBe('failed')
  })

  test('aggregates cargo test binaries and recognizes go package results', () => {
    expect(summarizeCheck('c', 'cargo test', { stdout: 'test result: ok. 3 passed; 0 failed; 0 ignored;\ntest result: FAILED. 2 passed; 1 failed; 0 ignored;\n' })).toMatchObject({ status: 'failed', passed: 5, failed: 1 })
    const go = summarizeCheck('g', 'go test', { stdout: 'ok\texample.org/pkg\t0.002s\nok\texample.org/other\t(cached)\n' })
    expect(go.status).toBe('passed')
    expect(go.passed).toBeUndefined()
    expect(summarizeCheck('g', 'go test', { stdout: '--- FAIL: TestThing (0.00s)\nFAIL example.org/pkg 0.01s\n' }).status).toBe('failed')
  })

  test('uses native error flags and never assumes Bash has an exitCode', () => {
    expect(summarizeCheck('x', 'tsc', { stdout: '', stderr: '', exitCode: 0 }).status).toBe('completed')
    expect(summarizeCheck('x', 'nix build', { stdout: 'ok world', exitCode: 1 }).status).toBe('completed')
    expect(summarizeCheck('x', 'tsc', { stdout: '' }, { error: true }).status).toBe('failed')
    expect(summarizeCheck('x', 'pytest', { isError: true, result: { stdout: '1 passed in 0.1s' } }).status).toBe('failed')
    expect(summarizeCheck('x', 'nix build', { stdout: 'unrecognized output with a private value' })).toEqual({ id: 'x', label: 'nix build', status: 'completed' })
  })

  test('preserves denial, interruption, and background-running outcomes', () => {
    expect(summarizeCheck('x', 'pytest', {}, { denied: true, error: true }).status).toBe('denied')
    expect(summarizeCheck('x', 'pytest', { deny: 'private denial text' }).status).toBe('denied')
    expect(summarizeCheck('x', 'pytest', { interrupted: true, stdout: '' }).status).toBe('interrupted')
    expect(summarizeCheck('x', 'pytest', { backgroundTaskId: 'task', stdout: '' }).status).toBe('running')
  })
})

describe('porcelain v1 -z status', () => {
  test('preserves spaces and newlines and consumes rename source records', () => {
    const entries = parseGitStatus(' M file with spaces\0R  new\nname\0old name\0?? untracked\nfile\0 D deleted file\0')
    expect(entries).toEqual([
      { path: 'file with spaces', status: ' M', staged: false, untracked: false },
      { path: 'new\nname', originalPath: 'old name', status: 'R ', staged: true, untracked: false },
      { path: 'untracked\nfile', status: '??', staged: false, untracked: true },
      { path: 'deleted file', status: ' D', staged: false, untracked: false },
    ])
  })

  test('rejects malformed, ignored, and incomplete records and bounds entries', () => {
    expect(parseGitStatus('!! ignored\0garbage\0R  renamed\0')).toEqual([])
    expect(parseGitStatus(' M no terminator')).toEqual([])
    expect(parseGitStatus(Array.from({ length: 150 }, (_, index) => `?? file-${index}\0`).join(''))).toHaveLength(100)
  })
})

describe('review patches', () => {
  test('parses changes, counts hunks, and handles deleted files', () => {
    const deleted = 'diff --git a/gone b/gone\n--- a/gone\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n'
    expect(parseGitDiff(diff('space name') + deleted, 20, true)).toMatchObject([
      { path: 'space name', additions: 1, deletions: 1, source: 'git', staged: true, updatedAt: 20 },
      { path: 'gone', additions: 0, deletions: 1 },
    ])
  })

  test('does not mistake changed header-like text for filename metadata', () => {
    const patch = 'diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n--- old text\n+++ new text\n'
    expect(parseGitDiff(patch, 10)[0]).toMatchObject({ path: 'file', additions: 1, deletions: 1 })
  })

  test('decodes git-quoted paths, octal UTF-8, and rename-only changes', () => {
    const quoted = 'diff --git "a/line\\nname" "b/line\\nname"\n--- "a/line\\nname"\n+++ "b/line\\nname"\n@@ -1 +1 @@\n-a\n+b\n'
    expect(first(parseGitDiff(quoted, 10)).path).toBe('line\nname')
    const rename = 'diff --git a/old "b/caf\\303\\251"\nsimilarity index 100%\nrename from old\nrename to "caf\\303\\251"\n'
    expect(parseGitDiff(rename, 10)[0]).toMatchObject({ path: 'café', additions: 0, deletions: 0 })
  })

  test('accepts standard unified patches without git headers', () => {
    const patch = '--- a/one\n+++ b/one\n@@ -1 +1 @@\n-a\n+b\n--- a/two\n+++ b/two\n@@ -0,0 +1 @@\n+c\n'
    expect(parseGitDiff(patch, 10).map(change => change.path)).toEqual(['one', 'two'])
  })

  test('bounds patch memory, counts, and file counts', () => {
    const large = 'diff --git a/large b/large\n--- /dev/null\n+++ b/large\n@@ -0,0 +1,2000 @@\n' + `+${'x'.repeat(70)}\n`.repeat(2000)
    const change = first(parseGitDiff(large, 10))
    expect(change.patch.length).toBeLessThanOrEqual(24000)
    expect(change).toMatchObject({ additions: 2000, deletions: 0, truncated: true })
    const many = parseGitDiff(Array.from({ length: 150 }, (_, index) => diff(`file-${index}`)).join(''), 10)
    expect(many).toHaveLength(100)
    const total = parseGitDiff(large.repeat(10), 10).reduce((sum, item) => sum + item.patch.length, 0)
    expect(total).toBeLessThanOrEqual(200000)
  })

  test('normalizes native Edit and Write structuredPatch without retaining file bodies', () => {
    const result = { filePath: '/project/file', oldString: 'private original', originalFile: 'private whole file', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-old', '+new', '+next'] }] }
    const changes = normalizeObservedChanges('Edit', {}, result, 30)
    expect(first(changes)).toMatchObject({ path: '/project/file', additions: 2, deletions: 1, source: 'observed', updatedAt: 30 })
    expect(first(changes).patch).toContain('@@ -1,1 +1,2 @@')
    expect(JSON.stringify(changes).includes('private')).toBe(false)
    expect(normalizeObservedChanges('Write', {}, { result }, 30)).toEqual(changes)
  })

  test('uses native gitDiff counts and refuses proposed or malformed edits', () => {
    const result = { filePath: 'file', gitDiff: { patch: diff('file'), additions: 3, deletions: 2 } }
    expect(normalizeObservedChanges('Write', {}, result, 30)[0]).toMatchObject({ additions: 3, deletions: 2 })
    expect(normalizeObservedChanges('Write', {}, { ...result, staged: true }, 30)).toEqual([])
    expect(normalizeObservedChanges('Write', {}, { result, isError: true }, 30)).toEqual([])
    expect(normalizeObservedChanges('Write', {}, { filePath: 'file', structuredPatch: [{ lines: ['+x'], oldStart: '1' }] }, 30)).toEqual([])
    expect(normalizeObservedChanges('Edit', {}, { filePath: 'file', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['+x\n+hidden'] }] }, 30)).toEqual([])
    expect(normalizeObservedChanges('Write', {}, { filePath: 'file', gitDiff: { patch: 'private stdout without a diff' } }, 30)).toEqual([])
    expect(normalizeObservedChanges('Write', {}, { filePath: 'file', content: 'private content', structuredPatch: [] }, 30)).toEqual([])
    expect(normalizeObservedChanges('Bash', {}, result, 30)).toEqual([])
  })

  test('keeps complete hunks and omits a first hunk that exceeds the limit', () => {
    const firstHunk = diff('file')
    const patch = firstHunk + `@@ -3 +3 @@\n-small\n+${'x'.repeat(30000)}\n`
    const change = first(parseGitDiff(patch, 30))
    expect(change.patch).toBe(firstHunk)
    expect(change).toMatchObject({ additions: 2, deletions: 2, truncated: true })
    const observed = first(normalizeObservedChanges('Edit', {}, {
      filePath: 'file', structuredPatch: [
        { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old', '+new'] },
        { oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ['-small', '+' + 'x'.repeat(30000)] },
      ],
    }, 30))
    expect(observed.patch.includes('@@ -1,1 +1,1 @@')).toBe(true)
    expect(observed.patch.includes('@@ -3,1 +3,1 @@')).toBe(false)
    expect(observed.truncated).toBe(true)
  })

  test('normalizes native Bash per-file hunks without command or stdout retention', () => {
    const changes = normalizeObservedChanges('Bash', { command: 'private command argument' }, {
      stdout: 'private stdout', bashEditDiff: { moreFiles: 0, files: [
        { filePath: '/project/one', hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ['+one'] }], created: true },
        { filePath: '/project/two', hunks: [{ oldStart: 1, oldLines: 1, newStart: 0, newLines: 0, lines: ['-two'] }], deleted: true },
      ] },
    }, 30)
    expect(changes).toMatchObject([
      { path: '/project/one', additions: 1, deletions: 0, source: 'observed' },
      { path: '/project/two', additions: 0, deletions: 1, source: 'observed' },
    ])
    expect(JSON.stringify(changes).includes('private')).toBe(false)
    expect(normalizeObservedChanges('Bash', {}, { bashEditDiff: { files: [null, { filePath: 3, hunks: [] }] } }, 30)).toEqual([])
  })

  test('bounds and marks observed patch truncation', () => {
    const result = { filePath: 'file', structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ['+' + 'x'.repeat(100000)] }] }
    const change = first(normalizeObservedChanges('Write', {}, result, 30))
    expect(change.patch.length).toBeLessThanOrEqual(24000)
    expect(change.truncated).toBe(true)
  })
})
