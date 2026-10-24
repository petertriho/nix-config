import type { Elements, RenderSurface, ThemeKey } from 'claude-code'

export type CockpitElements = Elements[RenderSurface]

// Theme keys follow the person's theme. An ANSI theme draws them with the
// terminal's own palette. Raw hex and color names are fixed RGB values, which
// a 256-color terminal (any tmux session) rounds to the nearest xterm color.
export const colors = {
  accent: 'suggestion',
  cyan: 'planMode',
  green: 'success',
  yellow: 'warning',
  red: 'error',
  magenta: 'merged',
  muted: 'inactive',
} as const satisfies Record<string, ThemeKey>

export const cleanText = (text: string): string =>
  text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')

const length = (text: string): number => [...text].length

// East Asian wide letters and emoji take two terminal cells, combining marks none.
const WIDE = /[\u{1100}-\u{115f}\u{2e80}-\u{303e}\u{3041}-\u{33ff}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}\u{a000}-\u{a4cf}\u{ac00}-\u{d7a3}\u{f900}-\u{faff}\u{fe30}-\u{fe4f}\u{ff00}-\u{ff60}\u{ffe0}-\u{ffe6}\u{20000}-\u{3fffd}]|\p{Emoji_Presentation}/u
const ZERO = /[\p{Mn}\p{Me}\u{200b}-\u{200f}\u{fe00}-\u{fe0f}]/u

/** The terminal cells a text takes. */
export const cells = (text: string): number =>
  [...text].reduce((total, char) => total + (ZERO.test(char) ? 0 : WIDE.test(char) ? 2 : 1), 0)

export const clip = (text: string, columns: number): string => {
  const value = cleanText(text)
  const limit = Math.max(1, Math.floor(columns))
  return length(value) <= limit ? value : `${[...value].slice(0, Math.max(0, limit - 1)).join('')}…`
}

// Paths keep their file name: the end says more than the start.
export const clipStart = (text: string, columns: number): string => {
  const value = cleanText(text)
  const limit = Math.max(1, Math.floor(columns))
  return length(value) <= limit ? value : `…${[...value].slice(length(value) - limit + 1).join('')}`
}

export const padEnd = (text: string, columns: number): string =>
  `${text}${' '.repeat(Math.max(0, Math.floor(columns) - length(text)))}`

export const padStart = (text: string, columns: number): string =>
  `${' '.repeat(Math.max(0, Math.floor(columns) - length(text)))}${text}`

export const duration = (ms: number): string => {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  if (safe < 1000) return `${Math.round(safe)}ms`
  if (safe < 60000) return `${(safe / 1000).toFixed(1)}s`
  if (safe < 3600000) return `${Math.floor(safe / 60000)}m ${Math.floor((safe % 60000) / 1000)}s`
  return `${Math.floor(safe / 3600000)}h ${Math.floor((safe % 3600000) / 60000)}m`
}

/** One unit, for columns and ages: 45s, 9m, 2h, 3d. */
export const brief = (ms: number): string => {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  if (safe < 10000) return `${(safe / 1000).toFixed(1)}s`
  if (safe < 60000) return `${Math.floor(safe / 1000)}s`
  if (safe < 3600000) return `${Math.floor(safe / 60000)}m`
  if (safe < 86400000) return `${Math.floor(safe / 3600000)}h`
  return `${Math.floor(safe / 86400000)}d`
}

/** Whole seconds, for a clock that redraws once a second: 9s, 1m05s, 2h04m. */
export const stopwatch = (ms: number): string => {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`
}

export const ago = (now: number, at: number | null | undefined): string =>
  at === null || at === undefined || !Number.isFinite(at) || !Number.isFinite(now) ? 'never' : `${brief(now - at)} ago`

export const count = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return 'unknown'
  return Math.round(Math.max(0, value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 950, 1.2k, 61k, 1.4M. */
export const compact = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return '?'
  const safe = Math.max(0, value)
  if (safe < 1000) return `${Math.round(safe)}`
  if (safe < 10000) return `${(safe / 1000).toFixed(1)}k`
  if (safe < 1000000) return `${Math.round(safe / 1000)}k`
  return `${(safe / 1000000).toFixed(1)}M`
}

export const usd = (value: number): string =>
  !Number.isFinite(value) ? '$?' : value >= 0.995 || value === 0 ? `$${value.toFixed(2)}` : `$${value.toFixed(value >= 0.01 ? 2 : 4)}`

export const percent = (value: number | undefined): string =>
  value === undefined || !Number.isFinite(value) ? '?' : `${Math.round(value)}%`

export const humanize = (code: string): string => cleanText(code).replace(/_/g, ' ')

export const plural = (value: number, noun: string): string =>
  `${count(value)} ${value === 1 ? noun : `${noun}s`}`

export const shortModel = (model: string): string =>
  cleanText(model).replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[1m\]$/, '')

export const meter = (value: number, width = 16): string => {
  const cells = Math.max(1, Math.min(120, Math.floor(width)))
  const filled = Math.round((Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)) / 100) * cells)
  return `${'━'.repeat(filled)}${'─'.repeat(cells - filled)}`
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** A left-aligned bar in eighths of a cell, for one row of a ranking. */
export const bar = (fraction: number, width: number): string => {
  const cells = Math.max(0, Math.floor(width))
  const eighths = Math.round(Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * cells * 8)
  return `${'█'.repeat(Math.floor(eighths / 8))}${EIGHTHS[eighths % 8] ?? ''}`
}

export const sparkline = (values: readonly number[], columns: number): string => {
  const shown = values.slice(-Math.max(1, Math.min(120, Math.floor(Number.isFinite(columns) ? columns : 40))))
  if (shown.length === 0) return ''
  const maximum = Math.max(1e-9, ...shown.filter(Number.isFinite))
  const glyphs = '▁▂▃▄▅▆▇█'
  return shown.map(value => glyphs[Math.max(0, Math.min(7, Math.round((Number.isFinite(value) ? Math.max(0, value) : 0) / maximum * 7)))] ?? '▁').join('')
}

export const rule = (width: number): string => '─'.repeat(Math.max(0, Math.floor(width)))

export const statusColor = (status: string): ThemeKey => {
  if (['failed', 'error', 'denied', 'killed', 'interrupted'].includes(status)) return colors.red
  if (['running', 'thinking', 'tools', 'pending'].includes(status)) return colors.cyan
  if (['waiting', 'missing'].includes(status)) return colors.yellow
  if (['completed', 'success', 'passed'].includes(status)) return colors.green
  return colors.muted
}

const glyphs: Record<string, string> = {
  running: '▸', thinking: '▸', tools: '▸', pending: '○', waiting: '◐', idle: '○',
  success: '✓', completed: '✓', passed: '✓',
  error: '✗', failed: '✗', denied: '⊘', killed: '■', interrupted: '■', missing: '?',
}

export const statusGlyph = (status: string): string => glyphs[status] ?? '·'
