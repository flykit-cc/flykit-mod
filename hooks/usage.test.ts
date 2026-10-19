import { describe, expect, test } from 'claude-code/testing'

import { DAY, HOUR, WEEK, bar, barText, formatDuration, parseModelCache, rollDay, weekMeter, type DayState } from './usage'

// Week starts at T0; the reset is one week later.
const T0 = Date.UTC(2026, 9, 17, 9) // Sat 09:00 UTC
const RESET = T0 + WEEK

describe('weekMeter', () => {
  test('pace is 0 at the week start, 50 mid-week, 100 at the reset', () => {
    const s = rollDay(undefined, 0, T0, RESET)
    expect(weekMeter(s, 0, T0).pace).toBe(0)
    expect(weekMeter(s, 0, T0 + WEEK / 2).pace).toBe(50)
    expect(weekMeter(s, 0, RESET).pace).toBe(100)
  })

  test('ahead is used minus pace', () => {
    const s: DayState = { weekStart: T0, dayIndex: 3, usedAtDayStart: 40, lastUsed: 41, lastAt: T0 + 3.5 * DAY }
    expect(weekMeter(s, 60, T0 + 3.5 * DAY).ahead).toBe(10)
  })

  test('budget shares the leftover over the days left', () => {
    // Day 1 (second day), 8% used so far: (100 - 8) / 6 days left.
    const s: DayState = { weekStart: T0, dayIndex: 1, usedAtDayStart: 8, lastUsed: 8, lastAt: T0 + DAY }
    const m = weekMeter(s, 10, T0 + DAY + HOUR)
    expect(Math.abs(m.budgetToday - 92 / 6) < 1e-9).toBe(true)
    expect(m.usedToday).toBe(2)
  })

  test('budget shrinks after overuse', () => {
    const s: DayState = { weekStart: T0, dayIndex: 1, usedAtDayStart: 30, lastUsed: 30, lastAt: T0 + DAY }
    expect(Math.abs(weekMeter(s, 30, T0 + DAY).budgetToday - 70 / 6) < 1e-9).toBe(true)
  })

  test('next day starts at the reset hour', () => {
    const s = rollDay(undefined, 0, T0 + 2 * DAY + 3 * HOUR, RESET)
    expect(weekMeter(s, 0, T0 + 2 * DAY + 3 * HOUR).nextDayInMs).toBe(21 * HOUR)
  })
})

describe('rollDay', () => {
  test('first reading ever counts today from now', () => {
    const s = rollDay(undefined, 20, T0 + DAY + HOUR, RESET)
    expect(s).toEqual({ weekStart: T0, dayIndex: 1, usedAtDayStart: 20, lastUsed: 20, lastAt: T0 + DAY + HOUR })
  })

  test('same day keeps the day start', () => {
    const a = rollDay(undefined, 20, T0 + DAY + HOUR, RESET)
    const b = rollDay(a, 25, T0 + DAY + 5 * HOUR, RESET)
    expect(b.usedAtDayStart).toBe(20)
    expect(b.lastUsed).toBe(25)
  })

  test('a new day starts from the last reading, even after a gap', () => {
    const a = rollDay(undefined, 20, T0 + DAY + HOUR, RESET)
    const b = rollDay(a, 25, T0 + DAY + 5 * HOUR, RESET)
    const c = rollDay(b, 31, T0 + 4 * DAY + HOUR, RESET) // days 2 and 3 skipped
    expect(c.dayIndex).toBe(4)
    expect(c.usedAtDayStart).toBe(25)
  })

  test('a new week starts the day at 0', () => {
    const a = rollDay(undefined, 90, T0 + 6 * DAY, RESET)
    const b = rollDay(a, 3, RESET + HOUR, RESET + WEEK)
    expect(b).toEqual({ weekStart: RESET, dayIndex: 0, usedAtDayStart: 0, lastUsed: 3, lastAt: RESET + HOUR })
  })

  test('a reset time that wobbles by seconds is the same week', () => {
    const a = rollDay(undefined, 20, T0 + DAY, RESET)
    const b = rollDay(a, 22, T0 + DAY + HOUR, RESET + 30_000)
    expect(b.usedAtDayStart).toBe(20)
  })
})

describe('parseModelCache', () => {
  const now = 1_000_000_000_000
  test('reads rows and marks old files stale', () => {
    const text = JSON.stringify({ at: now - 60_000, scoped: [{ name: 'Fable', used_percentage: 33, resets_at: now / 1000 + 3600 }] })
    expect(parseModelCache(text, now)).toEqual([{ name: 'Fable', percent: 33, resetInMs: 3_600_000, isStale: false }])
    const old = JSON.stringify({ at: now - 11 * 60_000, scoped: [{ name: 'Fable', used_percentage: 33 }] })
    expect(parseModelCache(old, now)[0]?.isStale).toBe(true)
  })

  test('bad text gives no rows', () => {
    expect(parseModelCache('not json', now)).toEqual([])
    expect(parseModelCache('{"scoped":[{"name":1}]}', now)).toEqual([])
  })
})

describe('format', () => {
  test('durations', () => {
    expect(formatDuration(3 * DAY + 4 * HOUR)).toBe('3d4h')
    expect(formatDuration(14 * HOUR)).toBe('14h')
    expect(formatDuration(2 * HOUR + 10 * 60_000)).toBe('2h10')
    expect(formatDuration(35 * 60_000)).toBe('35m')
  })

  test('bar fills and marks', () => {
    expect(barText(bar(50, 10))).toBe('█████░░░░░')
    expect(barText(bar(50, 10, 80))).toBe('█████░░░│░')
    expect(barText(bar(150, 4))).toBe('████')
    expect(barText(bar(0, 4))).toBe('░░░░')
    expect(bar(50, 4, 25).map(r => [r.kind, r.text, r.onFill])).toEqual([['fill', '█', undefined], ['mark', '│', true], ['empty', '░░', undefined]])
    expect(bar(50, 4, 90).map(r => [r.kind, r.onFill])).toEqual([['fill', undefined], ['empty', undefined], ['mark', false]])
  })

  test('bar draws the partial cell in eighths', () => {
    expect(barText(bar(55, 10))).toBe('█████▌░░░░')
    expect(barText(bar(1, 10))).toBe('▏░░░░░░░░░')
    expect(barText(bar(99.9, 10))).toBe('██████████')
    expect(bar(55, 10).map(r => r.kind)).toEqual(['fill', 'part', 'empty'])
    for (let p = 0; p <= 100; p += 0.5) expect([...barText(bar(p, 7, 50))].length).toBe(7)
  })
})
