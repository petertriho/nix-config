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

export const clip = (text: string, columns: number): string => {
  const value = cleanText(text)
  const limit = Math.max(1, Math.floor(columns))
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

export const duration = (ms: number): string => {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  if (safe < 1000) return `${Math.round(safe)}ms`
  if (safe < 60000) return `${(safe / 1000).toFixed(1)}s`
  return `${Math.floor(safe / 60000)}m ${Math.floor((safe % 60000) / 1000)}s`
}

export const count = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return 'unknown'
  return Math.round(Math.max(0, value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export const humanize = (code: string): string => cleanText(code).replace(/_/g, ' ')

export const plural = (value: number, noun: string): string =>
  `${count(value)} ${value === 1 ? noun : `${noun}s`}`

export const meter = (percent: number, width = 16): string => {
  const cells = Math.max(1, Math.min(80, Math.floor(width)))
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * cells)
  return `${'━'.repeat(filled)}${'─'.repeat(cells - filled)}`
}

export const statusColor = (status: string): ThemeKey => {
  if (['failed', 'error', 'denied', 'killed', 'interrupted'].includes(status)) return colors.red
  if (['running', 'thinking', 'tools', 'pending'].includes(status)) return colors.cyan
  if (['waiting', 'missing'].includes(status)) return colors.yellow
  if (['completed', 'success', 'passed'].includes(status)) return colors.green
  return colors.muted
}
