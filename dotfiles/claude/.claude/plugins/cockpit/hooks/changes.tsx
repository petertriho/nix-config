import type { RenderElement, ThemeKey } from 'claude-code'
import type { CockpitChange, CockpitChangeState, CockpitCheck, CockpitGitOperation, CockpitViewProps } from '../types'
import { actorName } from './agents'
import { actions, card, heading, line, listLimit, muted, neighboringIndex, section, spread, viewWidth, visibleWindow } from './layout'
import type { Segment } from './summary'
import { changeTotals, checkResult } from './summary'
import type { CockpitElements } from './theme'
import { ago, brief, cleanText, clip, clipStart, colors, compact, humanize, padStart, statusColor, statusGlyph } from './theme'

export const patchPreview = (patch: string, maxChars = 24000): { source: string; truncated: boolean } => {
  const source = patch.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ' ')
  const limit = Math.max(0, Math.min(24000, Math.floor(maxChars)))
  if (source.length <= limit) return { source, truncated: false }
  // Code needs complete hunks. Do not turn a partial hunk into an apparent complete diff.
  const starts = [...source.matchAll(/^@@ /gm)].map(match => match.index)
  const boundary = starts.filter(index => index <= limit).at(-1)
  return { source: boundary === undefined || boundary === starts[0] ? '' : source.slice(0, boundary), truncated: true }
}

export const gitOperationLines = (operation: CockpitGitOperation): string[] => [
  operation.commit && `${humanize(operation.commit.kind)} ${operation.commit.sha.slice(0, 8)}${operation.commit.branch ? ` on ${operation.commit.branch}` : ''}`,
  operation.push && `pushed ${operation.push.branch}`,
  operation.branch && `${humanize(operation.branch.action)} ${operation.branch.ref}`,
  operation.pr && `PR #${operation.pr.number} ${humanize(operation.pr.action)}`,
].filter((entry): entry is string => Boolean(entry)).map(entry => cleanText(entry))

const stateLetter: Record<CockpitChangeState, string> = {
  modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: '?', conflict: 'U',
}
const stateColor: Record<CockpitChangeState, ThemeKey> = {
  modified: colors.yellow, added: colors.green, deleted: colors.red, renamed: colors.cyan, untracked: colors.muted, conflict: colors.red,
}

type Group = { key: string; title: string; changes: CockpitChange[] }

/** Staged, then changed, untracked, and edits that no Git read has placed yet. */
export const changeGroups = (changes: readonly CockpitChange[]): Group[] => [
  { key: 'staged', title: 'Staged', changes: changes.filter(change => change.source === 'git' && change.staged) },
  { key: 'changed', title: 'Changed', changes: changes.filter(change => change.source === 'git' && !change.staged && !change.untracked) },
  { key: 'untracked', title: 'Untracked', changes: changes.filter(change => change.source === 'git' && !change.staged && change.untracked) },
  { key: 'edited', title: 'Edited, not yet read from Git', changes: changes.filter(change => change.source === 'observed') },
].filter(group => group.changes.length > 0)

/** A git-style `+++--` bar scaled to the largest change in view. */
const diffstat = (change: CockpitChange, largest: number, cells: number): Segment[] => {
  const total = change.additions + change.deletions
  if (total === 0 || cells <= 0) return []
  const width = Math.max(1, Math.round(total / Math.max(1, largest) * cells))
  const plus = Math.round(change.additions / total * width)
  return [{ text: '+'.repeat(plus), color: colors.green }, { text: '-'.repeat(width - plus), color: colors.red }]
}

const fileList = (
  ui: CockpitElements, props: CockpitViewProps, selected: CockpitChange | undefined, width: number,
): RenderElement => {
  const { Box, Button, Text } = ui
  const ordered = changeGroups(props.review.changes)
  const flat = ordered.flatMap(group => group.changes)
  const selectedIndex = Math.max(0, flat.findIndex(change => change.path === selected?.path))
  const visible = new Set(visibleWindow(flat, selectedIndex, listLimit(props)))
  const largest = Math.max(1, ...flat.map(change => change.additions + change.deletions))
  const findingCounts = new Map<string, number>()
  for (const finding of props.review.findings) findingCounts.set(finding.path, (findingCounts.get(finding.path) ?? 0) + 1)
  const statWidth = 10
  const rows: RenderElement[] = []
  for (const group of ordered) {
    const shown = group.changes.filter(change => visible.has(change))
    if (shown.length === 0) continue
    rows.push(line(ui, `changes:group:${group.key}`, [
      { text: group.title, color: colors.magenta }, { text: ` ${group.changes.length}`, color: colors.muted },
    ]))
    for (const change of shown) {
      const state = change.state ?? (change.untracked ? 'untracked' : 'modified')
      const findings = findingCounts.get(change.path) ?? 0
      const counts = change.additions + change.deletions > 0 || change.patch.length > 0
        ? `+${compact(change.additions)} −${compact(change.deletions)}` : ''
      const marks = `${change.edits && change.edits > 1 ? ` ✎${change.edits}` : ''}${findings > 0 ? ` ⚑${findings}` : ''}`
      const stat = diffstat(change, largest, statWidth)
      const statLength = stat.reduce((total, segment) => total + segment.text.length, 0)
      // The bar pads to its width, so the counts line up at the right edge.
      const right: Segment[] = [
        { text: marks ? `${marks} ` : '', color: colors.yellow },
        ...stat,
        { text: ' '.repeat(Math.max(0, statWidth - statLength)) },
        { text: padStart(counts, 10), color: colors.muted },
      ]
      const rightWidth = right.reduce((total, segment) => total + [...segment.text].length, 0)
      rows.push(spread(ui, `changes:row:${change.path}`, (
        <Box flexDirection="row">
          <Text color={change.path === selected?.path ? colors.accent : colors.muted}>{change.path === selected?.path ? '› ' : '  '}</Text>
          <Text color={stateColor[state]} bold>{stateLetter[state]} </Text>
          <Button key={`changes:select:${change.path}`} plain label={clipStart(change.path, Math.max(8, width - rightWidth - 6))} onPress={() => props.actions.selectChange(change.path)} />
        </Box>
      ), right))
    }
  }
  return section(ui, 'changes:files', [
    ...rows,
    flat.length > visible.size ? muted(ui, 'changes:files:more', `Showing ${visible.size} of ${flat.length}.`) : null,
  ])
}

const checkLine = (check: CockpitCheck, now: number): Segment[] => {
  const failed = check.status === 'failed' || (check.failed ?? 0) > 0
  const color = check.status === 'running' ? colors.cyan : failed ? colors.red : statusColor(check.status)
  return [
    { text: `${check.status === 'running' ? '◌' : statusGlyph(failed ? 'failed' : check.status)} `, color },
    { text: clip(check.label, 24) },
    { text: ` ${checkResult(check)}`, color },
    { text: check.durationMs === undefined ? '' : ` · ${brief(check.durationMs)}`, color: colors.muted },
    { text: check.finishedAt === undefined ? '' : ` · ${ago(now, check.finishedAt)}`, color: colors.muted },
  ]
}

/** The newest result of each check label, running ones included. */
const latestChecks = (checks: readonly CockpitCheck[]): CockpitCheck[] => {
  const latest = new Map<string, CockpitCheck>()
  for (const check of checks) latest.set(check.label, check)
  return [...latest.values()]
}

const summary = (ui: CockpitElements, props: CockpitViewProps, selected: CockpitChange | undefined, width: number): RenderElement => {
  const totals = changeTotals(props.review)
  const checks = latestChecks(props.review.checks)
  const confirmed = props.review.findings.filter(finding => /confirm/i.test(finding.verdict ?? '')).length
  const git = props.review.gitOps.at(-1)
  const changes = props.review.changes
  const chooseNeighbor = (direction: number): Promise<void> => {
    const ordered = changeGroups(changes).flatMap(group => group.changes)
    const index = Math.max(0, ordered.findIndex(change => change.path === props.review.selectedPath))
    const next = ordered[neighboringIndex(ordered.length, index, direction)]
    return next ? props.actions.selectChange(next.path) : Promise.resolve()
  }
  return section(ui, 'changes:summary', [
    heading(ui, 'changes:title', 'Changes', [
      { text: '⎇ ', color: colors.muted },
      { text: clip(props.review.branch ?? 'branch unknown', Math.max(8, width - 16)), color: colors.magenta },
    ], width),
    line(ui, 'changes:totals', [
      { text: `${totals.files} ${totals.files === 1 ? 'file' : 'files'} ` },
      { text: `+${compact(totals.additions)}`, color: colors.green }, { text: ' ' },
      { text: `−${compact(totals.deletions)}`, color: colors.red },
      { text: totals.staged > 0 ? ` · ${totals.staged} staged` : '', color: colors.muted },
      { text: totals.untracked > 0 ? ` · ${totals.untracked} untracked` : '', color: colors.muted },
      { text: ` · git ${props.review.refreshedAt === null ? 'not read' : ago(props.now, props.review.refreshedAt)}`, color: colors.muted },
    ], true),
    checks.length > 0 ? line(ui, 'changes:checks-summary', checks.slice(-3).flatMap((check, index) => {
      const failed = check.status === 'failed' || (check.failed ?? 0) > 0
      const color = check.status === 'running' ? colors.cyan : failed ? colors.red : statusColor(check.status)
      return [
        { text: index > 0 ? ' · ' : 'Checks ', color: colors.muted },
        { text: `${check.status === 'running' ? '◌' : statusGlyph(failed ? 'failed' : check.status)} ${clip(check.label, 16)}`, color },
      ]
    }), true) : null,
    props.review.findings.length > 0 ? line(ui, 'changes:findings-summary', [
      { text: 'Review ', color: colors.muted },
      { text: `⚑ ${props.review.findings.length} ${props.review.findings.length === 1 ? 'finding' : 'findings'}`, color: colors.yellow },
      { text: confirmed > 0 ? ` · ${confirmed} confirmed` : '', color: colors.red },
    ]) : null,
    git ? line(ui, 'changes:git-summary', [
      { text: 'Git    ', color: colors.muted },
      { text: clip(gitOperationLines(git).join(' · '), width - 16) },
      { text: ` · ${ago(props.now, git.at)}`, color: colors.muted },
    ]) : null,
    props.review.error ? line(ui, 'changes:error', [{ text: clip(props.review.error, 320), color: colors.red }], true) : null,
    actions(ui, 'changes:actions', [
      { key: 'changes:refresh', label: props.review.loading ? 'Reading git…' : 'Read git', hotkey: 'r', onPress: props.actions.refreshChanges },
      { key: 'changes:prev', label: 'Previous', hotkey: 'k', onPress: () => chooseNeighbor(-1), hidden: changes.length < 2 },
      { key: 'changes:next', label: 'Next', hotkey: 'j', onPress: () => chooseNeighbor(1), hidden: changes.length < 2 },
      { key: 'changes:copy', label: 'Copy', hotkey: 'c', onPress: () => props.actions.copyPatch(selected?.path ?? ''), hidden: !selected?.patch },
      { key: 'changes:quote', label: 'Quote', hotkey: 'q', onPress: () => props.actions.quotePatch(selected?.path ?? ''), hidden: !selected?.patch },
    ]),
  ])
}

const diffSection = (ui: CockpitElements, props: CockpitViewProps, change: CockpitChange, width: number): RenderElement => {
  const { Code } = ui
  const preview = patchPreview(change.patch)
  const findings = props.review.findings.filter(finding => finding.path === change.path)
  const by = change.agentId !== undefined || change.edits ? [
    { text: change.edits ? ` · edited ${change.edits}×` : '', color: colors.muted },
    { text: change.agentId !== undefined ? ` by ${clip(actorName(props, change.agentId), 14)}` : '', color: colors.magenta },
  ] : []
  return section(ui, 'changes:diff', [
    heading(ui, 'changes:diff:title', clipStart(change.path, Math.max(12, width - 30)), [
      { text: `+${compact(change.additions)}`, color: colors.green }, { text: ' ' },
      { text: `−${compact(change.deletions)}`, color: colors.red },
      ...by,
    ], width),
    ...findings.slice(0, 4).map(finding => line(ui, `changes:diff:finding:${finding.id}`, [
      { text: '⚑ ', color: colors.yellow },
      { text: finding.line === undefined ? '' : `L${finding.line} `, color: colors.muted },
      { text: clip(finding.summary, width * 2) },
      { text: finding.verdict ? ` · ${finding.verdict}` : '', color: /confirm/i.test(finding.verdict ?? '') ? colors.red : colors.yellow },
    ], true)),
    change.truncated || preview.truncated ? muted(ui, 'changes:diff:truncated', 'Truncated patch.') : null,
    preview.source
      ? <Code key="changes:diff:code" source={preview.source} path={change.path} format="diff" wrap="wrap" />
      : muted(ui, 'changes:diff:none', preview.truncated
        ? 'No complete hunk fits the preview limit. Copy or quote the captured patch to inspect it.'
        : change.truncated ? 'Patch omitted: no complete hunk fits the capture limit.'
          : change.untracked ? 'Untracked file: Git shows no patch until it is added.' : 'No text patch captured. Read git to load it.'),
  ])
}

const checksSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const checks = props.review.checks.slice(-6).reverse()
  if (checks.length === 0) return null
  const passed = props.review.checks.filter(check => check.status === 'passed').length
  const failed = props.review.checks.filter(check => check.status === 'failed').length
  return section(ui, 'changes:checks', [
    heading(ui, 'changes:checks:title', 'Checks', [
      { text: `${passed} passed`, color: passed > 0 ? colors.green : colors.muted },
      { text: ' · ', color: colors.muted },
      { text: `${failed} failed`, color: failed > 0 ? colors.red : colors.muted },
    ], width),
    ...checks.map(check => line(ui, `changes:check:${check.id}`, checkLine(check, props.now))),
    props.review.checks.length > checks.length ? muted(ui, 'changes:checks:more', `Showing the latest ${checks.length} of ${props.review.checks.length}.`) : null,
  ])
}

const findingsSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const findings = props.review.findings.slice(-8).reverse()
  if (findings.length === 0) return null
  return section(ui, 'changes:findings', [
    heading(ui, 'changes:findings:title', 'Findings', [{ text: `${props.review.findings.length}`, color: colors.yellow }], width),
    ...findings.flatMap(finding => [
      line(ui, `changes:finding:${finding.id}:where`, [
        { text: '⚑ ', color: /confirm/i.test(finding.verdict ?? '') ? colors.red : colors.yellow },
        { text: clipStart(`${finding.path}${finding.line === undefined ? '' : `:${finding.line}`}`, Math.max(12, width - 30)) },
        { text: [finding.category, finding.verdict, finding.outcome].filter(Boolean).map(value => ` · ${value}`).join(''), color: colors.muted },
      ]),
      line(ui, `changes:finding:${finding.id}:summary`, [{ text: `  ${clip(finding.summary, 360)}` }], true),
    ]),
  ])
}

const gitSection = (ui: CockpitElements, props: CockpitViewProps, width: number): RenderElement | null => {
  const { Link } = ui
  const operations = props.review.gitOps.slice(-6).reverse()
  if (operations.length === 0) return null
  return section(ui, 'changes:git', [
    heading(ui, 'changes:git:title', 'Git activity', [{ text: `${props.review.gitOps.length}`, color: colors.muted }], width),
    ...operations.flatMap(operation => [
      spread(ui, `changes:git:${operation.id}`, line(ui, `changes:git:${operation.id}:text`, [
        { text: operation.pr ? '⇡ ' : operation.push ? '↑ ' : '● ', color: colors.magenta },
        { text: clip(gitOperationLines(operation).join(' · '), width - 12) },
      ]), [{ text: ago(props.now, operation.at), color: colors.muted }]),
      operation.pr?.url ? <Link key={`changes:git:pr:${operation.id}`} href={operation.pr.url} label={`  ${clip(operation.pr.url, width - 2)}`} /> : null,
    ].filter((child): child is RenderElement => Boolean(child))),
  ])
}

export const renderChanges = (ui: CockpitElements, props: CockpitViewProps): RenderElement => {
  const { Box } = ui
  const width = viewWidth(props)
  const wide = width >= 100
  const left = wide ? Math.min(60, Math.floor((width - 2) * 0.45)) : width
  const right = wide ? width - left - 2 : width
  const selected = props.review.changes.find(change => change.path === props.review.selectedPath) ?? changeGroups(props.review.changes)[0]?.changes[0]
  const keep = (items: (RenderElement | null)[]) => items.filter((item): item is RenderElement => Boolean(item))
  const files = props.review.changes.length > 0 ? fileList(ui, props, selected, left)
    : muted(ui, 'changes:empty', 'No changes yet. Edits appear as the session makes them; Read git loads the working tree.')
  const diff = selected ? diffSection(ui, props, selected, right) : null
  const extras = [checksSection(ui, props, left), findingsSection(ui, props, left), gitSection(ui, props, left)]
  return wide ? (
    <Box flexDirection="row" gap={2} width="100%" alignItems="flex-start">
      <Box flexDirection="column" gap={1} width={left} flexShrink={0}>{keep([summary(ui, props, selected, left), files, ...extras])}</Box>
      <Box flexDirection="column" width={right} flexShrink={0}>{diff ? card(ui, 'changes:diff:card', [diff]) : muted(ui, 'changes:diff:empty', 'Select a file to see its patch.')}</Box>
    </Box>
  ) : (
    <Box flexDirection="column" gap={1} width="100%">
      {keep([summary(ui, props, selected, width), files, diff, ...extras])}
    </Box>
  )
}
