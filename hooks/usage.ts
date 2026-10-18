// Pure math for the usage meter. No engine calls here, so it is easy to test.

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY

// Saved in $.store under "day", shared by every session.
export type DayState = {
  weekStart: number
  dayIndex: number
  usedAtDayStart: number
  lastUsed: number
  lastAt: number
}

export type WeekMeter = {
  used: number
  pace: number
  ahead: number
  dayIndex: number
  budgetToday: number
  usedToday: number
  nextDayInMs: number
  resetInMs: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const dayIndexOf = (weekStart: number, now: number): number =>
  clamp(Math.floor((now - weekStart) / DAY), 0, 6)

// resetsAt can wobble by seconds between readings; treat close values as one week.
const isSameWeek = (a: number, b: number) => Math.abs(a - b) < HOUR

export function rollDay(prev: DayState | undefined, used: number, now: number, resetsAt: number): DayState {
  const weekStart = resetsAt - WEEK
  const dayIndex = dayIndexOf(weekStart, now)
  if (!prev) {
    // First reading ever: we cannot know the day's start, so today counts from now.
    return { weekStart, dayIndex, usedAtDayStart: used, lastUsed: used, lastAt: now }
  }
  if (!isSameWeek(prev.weekStart, weekStart)) {
    return { weekStart, dayIndex, usedAtDayStart: 0, lastUsed: used, lastAt: now }
  }
  if (dayIndex > prev.dayIndex) {
    // ponytail: use from claude.ai between the last reading and the day boundary lands in the new day.
    return { weekStart: prev.weekStart, dayIndex, usedAtDayStart: prev.lastUsed, lastUsed: used, lastAt: now }
  }
  return { ...prev, lastUsed: used, lastAt: now }
}

export function weekMeter(state: DayState, used: number, now: number): WeekMeter {
  const pace = clamp(((now - state.weekStart) / WEEK) * 100, 0, 100)
  const budgetToday = Math.max(0, 100 - state.usedAtDayStart) / (7 - state.dayIndex)
  return {
    used,
    pace,
    ahead: used - pace,
    dayIndex: state.dayIndex,
    budgetToday,
    usedToday: Math.max(0, used - state.usedAtDayStart),
    nextDayInMs: Math.max(0, state.weekStart + (state.dayIndex + 1) * DAY - now),
    resetInMs: Math.max(0, state.weekStart + WEEK - now),
  }
}

// One per-model weekly limit, from the status line's cache file.
export type ModelLimit = { name: string; percent: number; resetInMs: number | undefined; isStale: boolean }

const STALE_MS = 10 * 60_000

export function parseModelCache(text: string, now: number): ModelLimit[] {
  try {
    const data = JSON.parse(text) as { at?: number; scoped?: { name?: unknown; used_percentage?: unknown; resets_at?: unknown }[] }
    const isStale = typeof data.at !== 'number' || now - data.at > STALE_MS
    return (data.scoped ?? []).flatMap(row => {
      if (typeof row.name !== 'string' || typeof row.used_percentage !== 'number') return []
      const resetInMs = typeof row.resets_at === 'number' ? Math.max(0, row.resets_at * 1000 - now) : undefined
      return [{ name: row.name, percent: row.used_percentage, resetInMs, isStale }]
    })
  } catch {
    return []
  }
}

// "3d4h", "14h", "2h10", "35m"
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  return `${m}m`
}

// A text bar `width` cells wide; `mark` puts a │ at that percent.
export function bar(percent: number, width: number, mark?: number): string {
  const cells = Math.max(1, width)
  const filled = Math.round((clamp(percent, 0, 100) / 100) * cells)
  const chars: string[] = Array.from({ length: cells }, (_, i) => (i < filled ? '█' : '░'))
  if (mark !== undefined) chars[clamp(Math.round((mark / 100) * cells), 0, cells - 1)] = '│'
  return chars.join('')
}

export const pct = (n: number) => `${Math.round(n * 10) / 10}%`
