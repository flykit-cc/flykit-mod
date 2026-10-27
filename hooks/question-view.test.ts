import { expect, test } from 'claude-code/testing'

import type { OpenQuestion } from './cockpit'
import { questionHeader, questionRows } from './question-view'
import { chipsWidth, wrap } from './style'

const Q: OpenQuestion = {
  id: 'Q3',
  asks: 'Which key opens the cockpit?',
  options: [{ key: 'A', text: 'c, short and free' }, { key: 'B', text: 'k' }],
  recommended: 'A',
}


test('header: full question, count when more than one is open', () => {
  expect(questionHeader(Q, 2, 80)).toEqual({ id: '? Q3', lines: ['Which key opens the cockpit?'], count: '1 of 2' })
  expect(questionHeader(Q, 1, 80)).toEqual({ id: '? Q3', lines: ['Which key opens the cockpit?'] })
  // chip " ? Q3 " (6) + space + text + two spaces + "1 of 2" (6): 25 columns leave 10 for the text
  const h = questionHeader(Q, 2, 25)
  expect(h.lines).toEqual(['Which key', 'opens the', 'cockpit?'])
})

test('short options: one row of chips with full text, star on the recommended, reply last', () => {
  const { inline, rows } = questionRows(Q, 80)
  expect(inline).toBe(true)
  expect(rows.map(r => [r.key, r.chip])).toEqual([
    ['answer-A', 'A c, short and free ★'],
    ['answer-B', 'B k'],
    ['reply', '✎ reply'],
  ])
  expect(rows[2]!.option).toBeUndefined()
  expect(rows[0]!.option).toEqual({ key: 'A', text: 'c, short and free' })
  expect(2 + chipsWidth(rows.map(r => r.chip))).toBeLessThanOrEqual(80)
})

test('long options: one per row, nothing cut, every line fits', () => {
  const a = 'alpha '.repeat(30).trim()
  const long: OpenQuestion = { id: 'Q1', asks: 'x', options: [{ key: 'A', text: a }, { key: 'B', text: 'b' }], recommended: 'B' }
  const { inline, rows } = questionRows(long, 40)
  expect(inline).toBe(false)
  expect(rows.map(r => r.chip)).toEqual(['A  ', 'B ★', '✎ reply'])
  expect(rows[0]!.lines.join(' ')).toBe(a)
  // indent 2 + key chip 5 + gap 1 = 8 columns before the text
  for (const l of rows[0]!.lines) expect(8 + l.length).toBeLessThanOrEqual(40)
})

test('no options: only reply', () => {
  expect(questionRows({ id: 'Q2', asks: 'free?', options: [] }, 80).rows).toEqual([{ key: 'reply', chip: '✎ reply', lines: [] }])
})

test('wrap breaks at spaces, keeps every word, splits a word longer than a line', () => {
  expect(wrap('one two three', 80)).toEqual(['one two three'])
  const text = 'word '.repeat(60).trim()
  const lines = wrap(text, 20)
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(20)
  expect(lines.join(' ')).toBe(text)
  expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  expect(wrap('a bb cc', 1, 2)).toEqual(['a', 'bb', 'cc'])
})
