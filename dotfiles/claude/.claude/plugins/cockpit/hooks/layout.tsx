import type { RenderElement } from 'claude-code'
import type { CockpitViewProps } from '../types'
import type { Segment } from './summary'
import type { CockpitElements } from './theme'
import { clip, colors, padEnd, rule } from './theme'

const width = (segments: readonly Segment[]): number =>
  segments.reduce((total, segment) => total + [...segment.text].length, 0)

/** Columns a view can fill: the pane body less one, so a full line never wraps. */
export const viewWidth = (props: CockpitViewProps): number => Math.max(24, Math.floor(props.columns) - 1)

/** Rows a list can take before it windows around the selection. */
export const listLimit = (props: CockpitViewProps): number => Math.max(6, Math.min(20, Math.floor(props.rows) - 12))

export const line = (ui: CockpitElements, key: string, segments: readonly Segment[], wrap = false): RenderElement => {
  const { Text } = ui
  return (
    <Text key={key} wrap={wrap ? 'wrap' : 'truncate-end'}>
      {segments.map(segment => <Text color={segment.color} bold={segment.bold}>{segment.text}</Text>)}
    </Text>
  )
}

/** `Title ───────── detail`: the rule fills the line between them. */
export const heading = (
  ui: CockpitElements, key: string, title: string, detail: readonly Segment[], columns: number,
): RenderElement => {
  const detailWidth = width(detail)
  const fill = columns - [...title].length - detailWidth - (detailWidth > 0 ? 2 : 1)
  return line(ui, key, [
    { text: title, color: colors.accent, bold: true },
    { text: fill >= 2 ? ` ${rule(fill)}${detailWidth > 0 ? ' ' : ''}` : ' ', color: colors.muted },
    ...detail,
  ])
}

export type Action = { key: string; label: string; hotkey?: string; onPress: () => Promise<void> | void; hidden?: boolean }

/** Plain buttons that read `r: Refresh`, as the view tabs do. */
export const actions = (ui: CockpitElements, key: string, items: readonly Action[]): RenderElement => {
  const { Box, Button } = ui
  return (
    <Box key={key} flexDirection="row" flexWrap="wrap" columnGap={2}>
      {items.filter(item => !item.hidden).map(item => (
        <Button key={item.key} plain label={item.label} hotkey={item.hotkey} onPress={item.onPress} />
      ))}
    </Box>
  )
}

/** A muted label column and a value that wraps under itself. */
export const field = (
  ui: CockpitElements, key: string, label: string, value: readonly Segment[], labelWidth = 9,
): RenderElement => {
  const { Box, Text } = ui
  return (
    <Box key={key} flexDirection="row">
      <Box width={labelWidth} flexShrink={0}><Text color={colors.muted}>{padEnd(label, labelWidth)}</Text></Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>{line(ui, `${key}:value`, value, true)}</Box>
    </Box>
  )
}

/** A row with content at the left edge and a detail at the right edge. */
export const spread = (
  ui: CockpitElements, key: string, left: RenderElement, right: readonly Segment[],
): RenderElement => {
  const { Box } = ui
  return (
    <Box key={key} flexDirection="row" justifyContent="space-between" gap={1}>
      <Box flexShrink={1} minWidth={0}>{left}</Box>
      <Box flexShrink={0}>{line(ui, `${key}:right`, right)}</Box>
    </Box>
  )
}

export const card = (ui: CockpitElements, key: string, children: (RenderElement | null | false | undefined)[]): RenderElement => {
  const { Box } = ui
  return (
    <Box key={key} flexDirection="column" borderStyle="round" borderColor={colors.muted} paddingX={1} width="100%">
      {children.filter((child): child is RenderElement => Boolean(child))}
    </Box>
  )
}

export const section = (ui: CockpitElements, key: string, children: (RenderElement | null | false | undefined)[]): RenderElement => {
  const { Box } = ui
  return (
    <Box key={key} flexDirection="column" width="100%">
      {children.filter((child): child is RenderElement => Boolean(child))}
    </Box>
  )
}

export const muted = (ui: CockpitElements, key: string, text: string): RenderElement => {
  const { Text } = ui
  return <Text key={key} color={colors.muted} wrap="wrap">{text}</Text>
}

export const visibleWindow = <T,>(items: readonly T[], selected: number, limit: number): readonly T[] => {
  const size = Math.max(1, Math.floor(limit))
  const anchor = Math.max(0, Math.min(items.length - 1, selected))
  const start = Math.max(0, Math.min(items.length - size, anchor - Math.floor(size / 2)))
  return items.slice(start, start + size)
}

export const neighboringIndex = (length: number, selected: number, direction: number): number =>
  length > 0 ? (Math.max(0, selected) + direction + length) % length : 0

export const sparkline = (values: readonly number[], columns: number): string => {
  const shown = values.slice(-Math.max(1, Math.min(120, Math.floor(Number.isFinite(columns) ? columns : 40))))
  if (shown.length === 0) return ''
  const maximum = Math.max(1e-9, ...shown.filter(Number.isFinite))
  const glyphs = '▁▂▃▄▅▆▇█'
  return shown.map(value => glyphs[Math.max(0, Math.min(7, Math.round((Number.isFinite(value) ? Math.max(0, value) : 0) / maximum * 7)))] ?? '▁').join('')
}

export type Tab = { label: string; badge?: string }

/** Columns of a plain tab: the Button's `1: Label`, then its badge after a space. */
export const tabWidth = (tabs: readonly Tab[], index: number, badges: boolean): number => {
  const tab = tabs[index]
  if (tab === undefined) return 0
  return [...`${index + 1}: ${tab.label}`].length + (badges && tab.badge ? 1 + [...tab.badge].length : 0)
}

/**
 * How the tabs fit `columns`: one row three columns apart, then without badges,
 * then two apart; else rows packed in order, with badges when they add no row.
 */
export const tabRows = (tabs: readonly Tab[], columns: number): { rows: number[][]; badges: boolean; gap: number } => {
  const all = tabs.map((_, index) => index)
  const total = (row: readonly number[], badges: boolean, gap: number): number =>
    row.reduce((sum, index) => sum + tabWidth(tabs, index, badges), 0) + gap * Math.max(0, row.length - 1)
  for (const [badges, gap] of [[true, 3], [false, 3], [false, 2]] as const) {
    if (total(all, badges, gap) <= columns) return { rows: [all], badges, gap }
  }
  const pack = (badges: boolean): number[][] => {
    const rows: number[][] = []
    for (const index of all) {
      const row = rows[rows.length - 1]
      if (row && total([...row, index], badges, 3) <= columns) row.push(index)
      else rows.push([index])
    }
    return rows
  }
  const badged = pack(true)
  const plain = pack(false)
  return badged.length <= plain.length ? { rows: badged, badges: true, gap: 3 } : { rows: plain, badges: false, gap: 3 }
}

/** The mark under the row that holds the active tab: a thin accent bar under it. */
export const tabMark = (
  tabs: readonly Tab[], row: readonly number[], active: number, badges: boolean, gap: number,
): Segment[] | undefined => {
  let used = 0
  for (const [position, index] of row.entries()) {
    if (position > 0) used += gap
    const size = tabWidth(tabs, index, badges)
    if (index === active) return [{ text: ' '.repeat(used) }, { text: '▔'.repeat(size), color: colors.accent }]
    used += size
  }
  return undefined
}

/**
 * The pane footer: the keys that work in this pane, in reading order. When it
 * does not fit, the least needed part drops first: read-only, close, views.
 */
export const paneFooter = (surface: string, placement: 'dock' | 'inline', columns: number): string => {
  if (surface !== 'terminal') return 'Read-only'
  const parts = [
    { text: 'Read-only', need: 4 },
    { text: '1–5 views', need: 2 },
    { text: 'Ctrl+X Tab focus', need: 0 },
    { text: placement === 'dock' ? 'Ctrl+X ←/→ resize' : 'Ctrl+X ↑/↓ resize', need: 1 },
    { text: 'Esc close', need: 3 },
  ]
  const text = (limit: number): string => parts.filter(part => part.need <= limit).map(part => part.text).join(' · ')
  for (let limit = 4; limit > 0; limit -= 1) if ([...text(limit)].length <= columns) return text(limit)
  return clip(text(0), columns)
}
