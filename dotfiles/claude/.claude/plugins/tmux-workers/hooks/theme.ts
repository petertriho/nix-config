import type { ThemeKey } from 'claude-code'

// Theme keys follow the theme of the person. Raw colors would be rounded to the
// nearest xterm color in a 256-color tmux session.
export const colors = {
  accent: 'suggestion',
  green: 'success',
  yellow: 'warning',
  red: 'error',
  muted: 'inactive',
} as const satisfies Record<string, ThemeKey>

export const cleanText = (text: string): string =>
  text.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')

// East Asian wide letters and emoji take two terminal cells, combining marks none.
const WIDE = /[\u{1100}-\u{115f}\u{2e80}-\u{303e}\u{3041}-\u{33ff}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}\u{a000}-\u{a4cf}\u{ac00}-\u{d7a3}\u{f900}-\u{faff}\u{fe30}-\u{fe4f}\u{ff00}-\u{ff60}\u{ffe0}-\u{ffe6}\u{20000}-\u{3fffd}]|\p{Emoji_Presentation}/u
const ZERO = /[\p{Mn}\p{Me}\u{200b}-\u{200f}\u{fe00}-\u{fe0f}]/u

const cellOf = (char: string): number => (ZERO.test(char) ? 0 : WIDE.test(char) ? 2 : 1)

/** The terminal cells a text takes. */
export const cells = (text: string): number =>
  [...text].reduce((total, char) => total + cellOf(char), 0)

const take = (chars: readonly string[], limit: number): string[] => {
  const out: string[] = []
  let used = 0
  for (const char of chars) {
    const width = cellOf(char)
    if (used + width > limit) break
    out.push(char)
    used += width
  }
  return out
}

/** The text cut to a number of cells, with an ellipsis at the end when it is cut. */
export const clip = (text: string, columns: number): string => {
  const value = cleanText(text)
  const limit = Math.max(1, Math.floor(columns))
  if (cells(value) <= limit) return value
  return `${take([...value], limit - 1).join('')}…`
}

// Paths keep their end: the folder name says more than the start.
export const clipStart = (text: string, columns: number): string => {
  const value = cleanText(text)
  const limit = Math.max(1, Math.floor(columns))
  if (cells(value) <= limit) return value
  return `…${take([...value].reverse(), limit - 1).reverse().join('')}`
}

/** One unit, for ages: 9s, 4m, 2h, 3d. */
export const brief = (ms: number): string => {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  if (safe < 60000) return `${Math.floor(safe / 1000)}s`
  if (safe < 3600000) return `${Math.floor(safe / 60000)}m`
  if (safe < 86400000) return `${Math.floor(safe / 3600000)}h`
  return `${Math.floor(safe / 86400000)}d`
}
