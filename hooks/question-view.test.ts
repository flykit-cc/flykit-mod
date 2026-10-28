import { expect, test } from 'claude-code/testing'

import type { OpenQuestion } from './cockpit'
import { block, fromAsk, fromTool, heading, questionHeader, questionRows } from './question-view'
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

test('one option per row: key chip, star on the recommended, reply last', () => {
  const { labelWidth, rows } = questionRows(Q, 80)
  expect(labelWidth).toBe(78 - 5 - 1) // no effects: the label takes the room (indent 2, chip "★ A" 5, gap 1)
  expect(rows.map(r => [r.key, r.chip])).toEqual([
    ['answer-A', '★ A'],
    ['answer-B', '  B'],
    ['reply', '✎ reply'],
  ])
  expect(rows[0]!.lines).toEqual([{ label: 'c, short and free', effect: '' }])
  expect(rows[2]!.option).toBeUndefined()
})

test('effects line up in their own column; nothing cut', () => {
  const e = 'GitHub gets the band questions and everyone who installs it does too'
  const q: OpenQuestion = { id: 'Push', asks: 'x', options: [{ key: '1', text: 'Push flykit-mod', effect: e }, { key: '2', text: 'Not yet', effect: 'nothing leaves' }] }
  const { labelWidth, rows } = questionRows(q, 60)
  expect(labelWidth).toBe(15)
  expect(rows[0]!.lines.map(l => l.effect).join(' ')).toBe(e)
  expect(rows[0]!.lines[0]!.label).toBe('Push flykit-mod')
  // indent 2 + chip 3 + gap 1 + label 15 + space 1 = 22 before the effect
  for (const l of rows[0]!.lines) expect(22 + l.effect.length).toBeLessThanOrEqual(60)
})

test('too narrow for two columns: the effect goes under its label', () => {
  const q: OpenQuestion = { id: 'Push', asks: 'x', options: [{ key: '1', text: 'Push now', effect: 'GitHub gets it' }, { key: '2', text: 'Wait', effect: 'nothing' }] }
  const { labelWidth, rows } = questionRows(q, 30)
  expect(labelWidth).toBe(0)
  expect(rows[0]!.lines).toEqual([{ label: 'Push now', effect: '' }, { label: '', effect: 'GitHub gets it' }])
})

test('no options: only reply', () => {
  expect(questionRows({ id: 'Q2', asks: 'free?', options: [] }, 80).rows).toEqual([{ key: 'reply', chip: '✎ reply', lines: [] }])
})

test('the ask tool input becomes a band question; bad input is refused with a reason', () => {
  const ok = fromTool({
    topic: 'Push',
    question: 'What should I push?',
    options: [{ label: 'Push', effect: 'GitHub gets it', recommended: true }, { label: 'Not yet', effect: 'nothing leaves' }, { label: 'Both' }],
    because: 'it is ready',
    context: '- 3 commits',
  })
  expect(ok).toEqual({
    q: {
      id: 'Push',
      asks: 'What should I push?',
      options: [{ key: '1', text: 'Push', effect: 'GitHub gets it' }, { key: '2', text: 'Not yet', effect: 'nothing leaves' }, { key: '3', text: 'Both' }],
      recommended: '1',
      why: '1 because: it is ready',
      context: '- 3 commits',
    },
    labels: ['Push', 'Not yet', 'Both'],
  })
  expect(fromTool({ question: 'x?', options: [{ label: 'a' }] })).toBe('give 2 to 6 options')
  expect(fromTool({ question: '', options: [] })).toBe('question is empty')
  expect(fromTool({ question: 'x?', options: [{ label: 'a' }, { label: ' ' }] })).toBe('every option needs a label')
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

test('block keeps line breaks, blank lines and indents, and wraps each line', () => {
  expect(block('Title\n\n- one\n  two three four', 10)).toEqual(['Title', '', '- one', '  two', '  three', '  four'])
})

test('a dialog question becomes a band question: numbered, star for (Recommended), preview as briefing', () => {
  const { q, labels } = fromAsk({
    question: 'Publish it?',
    header: 'Hosting',
    options: [
      { label: 'Publish (Recommended)', description: 'Goes to Confluence now.', preview: 'FILE\n- PostgreSQL' },
      { label: 'I want changes', description: 'Nothing is published.' },
    ],
  })
  expect(q).toEqual({
    id: 'Hosting',
    asks: 'Publish it?',
    options: [
      { key: '1', text: 'Publish', effect: 'Goes to Confluence now.' },
      { key: '2', text: 'I want changes', effect: 'Nothing is published.' },
    ],
    recommended: '1',
    context: 'FILE\n- PostgreSQL',
  })
  expect(labels).toEqual(['Publish (Recommended)', 'I want changes'])
})

test('heading: # lines and all-caps lines, not bullets or plain text', () => {
  expect(heading('# Why')).toBe('Why')
  expect(heading('WHAT CHANGES')).toBe('WHAT CHANGES')
  expect(heading('- OK')).toBeUndefined()
  expect(heading('Plain text')).toBeUndefined()
  expect(heading('')).toBeUndefined()
})
