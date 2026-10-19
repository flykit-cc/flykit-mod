import { expect, test } from 'claude-code/testing'

import type { OpenQuestion } from './cockpit'
import { contextLines, questionButtons, questionHeader } from './question-view'
import { chipsWidth } from './style'

const Q: OpenQuestion = {
  id: 'Q3',
  asks: 'Which key opens the cockpit?',
  options: [{ key: 'A', text: 'c, short and free' }, { key: 'B', text: 'k' }],
  recommended: 'A',
}

// Indent, then chips drawn " label " one column apart.
const width = (row: { label: string }[]) => 2 + chipsWidth(row.map(b => b.label))

test('header with count when more than one is open', () => {
  expect(questionHeader(Q, 2, 80)).toEqual({ id: '? Q3', text: 'Which key opens the cockpit?', count: '1 of 2' })
  expect(questionHeader(Q, 1, 80)).toEqual({ id: '? Q3', text: 'Which key opens the cockpit?' })
  // chip " ? Q3 " (6) + space + text + two spaces + "1 of 2" (6) = 25
  expect(questionHeader(Q, 2, 25)).toEqual({ id: '? Q3', text: 'Which key…', count: '1 of 2' })
  expect(questionHeader(Q, 1, 17)).toEqual({ id: '? Q3', text: 'Which key…' })
})

test('buttons on one row, star on the recommended, reply last', () => {
  const rows = questionButtons(Q, 80)
  expect(rows.length).toBe(1)
  expect(rows[0]!.map(b => [b.key, b.label])).toEqual([
    ['answer-A', 'A c, short and free ★'],
    ['answer-B', 'B k'],
    ['reply', '✎ reply'],
  ])
  for (const b of rows[0]!) expect('hotkey' in b).toBe(false)
  expect(rows[0]![2]!.option).toBeUndefined()
  expect(rows[0]![0]!.option).toEqual({ key: 'A', text: 'c, short and free' })
})

test('long options are cut to fit one row', () => {
  const long: OpenQuestion = { id: 'Q1', asks: 'x', options: [{ key: 'A', text: 'a'.repeat(60) }, { key: 'B', text: 'b'.repeat(60) }] }
  const rows = questionButtons(long, 80)
  expect(rows.length).toBe(1)
  expect(width(rows[0]!)).toBeLessThanOrEqual(80)
  expect(rows[0]![0]!.label.endsWith('…')).toBe(true)
})

test('too narrow for one row: one button per row, each fits', () => {
  const rows = questionButtons(Q, 30)
  expect(rows.length).toBe(3)
  for (const row of rows) expect(width(row)).toBeLessThanOrEqual(30)
})

test('no options: only reply', () => {
  const rows = questionButtons({ id: 'Q2', asks: 'free?', options: [] }, 80)
  expect(rows).toEqual([[{ key: 'reply', label: '✎ reply' }]])
})

test('more than 8 options: all shown, each row fits', () => {
  const many: OpenQuestion = { id: 'Q1', asks: 'x', options: 'ABCDEFGHIJ'.split('').map(k => ({ key: k, text: 'option ' + k })) }
  const rows = questionButtons(many, 40)
  expect(rows.flat().length).toBe(11)
  for (const row of rows) expect(width(row)).toBeLessThanOrEqual(40)
})

test('one-row budget uses the full width, chip padding counted', () => {
  // 2 options + reply at 42 columns: per = floor((40 - 9 - 2 * 3) / 2) = 12 (reply chip 9, each option padding 2 + gap 1)
  const q: OpenQuestion = { id: 'Q1', asks: 'x', options: [{ key: 'A', text: 'a'.repeat(30) }, { key: 'B', text: 'b'.repeat(30) }] }
  const rows = questionButtons(q, 42)
  expect(rows.length).toBe(1)
  expect(rows[0]![0]!.label.length).toBe(12)
  expect(width(rows[0]!)).toBeLessThanOrEqual(42)
  expect(questionButtons(q, 40).length).toBe(3) // two columns less: per 11, below the minimum
})

test('context breaks at spaces, max 3 lines, ellipsis when cut', () => {
  expect(contextLines('one two three', 80)).toEqual(['one two three'])
  const lines = contextLines('word '.repeat(60).trim(), 22)
  expect(lines.length).toBe(3)
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(20)
  expect(lines[2]!.endsWith('…')).toBe(true)
})
