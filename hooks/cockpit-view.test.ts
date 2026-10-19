import { expect, test } from 'claude-code/testing'

import type { Cockpit } from './cockpit'
import { detailRows, summary } from './cockpit-view'
import { chipsWidth } from './style'

const FULL: Cockpit = {
  progress: { goal: 'Build the flykit Claude Code mod in 4 parts', open: ['write spec', 'build band', 'test live'], done: 2 },
  questions: { open: 1, top: { id: 'Q1', asks: 'Which key opens the cockpit?', options: [] } },
  git: { branch: 'main', changed: 3, ahead: 2 },
  agents: [{ type: 'Explore', description: 'map hooks' }, { type: 'flow:reviewer', description: 'check diff' }],
  peers: [],
}

// Chips are drawn " text " with one column between them.
const text = (segs: { text: string }[]) => segs.map(s => s.text).join(' | ')
const width = (segs: { text: string }[]) => chipsWidth(segs.map(s => s.text))
const REST = '✓ 2/5 | ● 2 | main +3 ↑2'
const REST_WIDTH = 5 + 3 + 10 + 3 * 2 + 2 // three chips' text, their padding, two gaps = 26

test('summary shows every chip in order, toned', () => {
  expect(summary(FULL, 200)).toEqual([
    { text: 'Build the flykit Claude Code mod in 4 parts' },
    { text: '✓ 2/5' },
    { text: '● 2', tone: 'success' },
    { text: 'main +3 ↑2', tone: 'suggestion' },
  ])
})

test('summary cuts the goal to fit and drops it when too narrow', () => {
  // goal chip: gap + padding + 12 columns of text
  expect(text(summary(FULL, REST_WIDTH + 1 + 2 + 12))).toBe('Build the f… | ' + REST)
  expect(text(summary(FULL, REST_WIDTH + 5))).toBe(REST)
})

test('summary leaves out empty parts and tones the rest', () => {
  const segs = summary({ progress: { open: [], done: 0 }, questions: 'broken', git: { branch: 'dev', changed: 0, ahead: 0 }, agents: [{ type: 'Explore', description: 'x' }], peers: [] }, 200)
  expect(segs).toEqual([{ text: '● 1', tone: 'success' }, { text: 'questions.md broken', tone: 'error' }, { text: 'dev' }])
})

test('open questions without a drawable top still show in the summary', () => {
  expect(summary({ questions: { open: 1 }, agents: [], peers: [] }, 200)).toEqual([{ text: '? 1', tone: 'warning' }])
})

test('detail rows', () => {
  expect(detailRows(FULL)).toEqual([
    { label: 'goal', text: 'Build the flykit Claude Code mod in 4 parts' },
    { label: 'next', text: '○ write spec   ○ build band' },
    { label: 'agent', text: '● Explore · map hooks', color: 'success' },
    { label: 'agent', text: '● flow:reviewer · check diff', color: 'success' },
    { label: 'git', text: 'main · 3 changed · 2 unpushed' },
  ])
  expect(detailRows({ agents: [], peers: [] })).toEqual([])
  expect(detailRows({ agents: [], peers: [], questions: 'broken' })).toEqual([{ label: 'ask', text: 'questions.md broken', color: 'error' }])
})

test('summary without goal when the detail is open', () => {
  expect(text(summary(FULL, 200, false))).toBe(REST)
})

test('summary goal boundary: 8 columns left keeps the goal, 7 drops it', () => {
  expect(text(summary(FULL, REST_WIDTH + 3 + 8))).toBe('Build t… | ' + REST)
  expect(text(summary(FULL, REST_WIDTH + 3 + 7))).toBe(REST)
})

test('summary never exceeds the width, chip padding and gaps counted', () => {
  const c: Cockpit = { ...FULL, git: { branch: 'feature/flow-cockpit-band', changed: 12, ahead: 3 }, peers: [{ id: '1', name: 'enso-0d', project: 'enso', status: 'done' }] }
  for (let columns = 0; columns <= 140; columns++) {
    const segs = summary(c, columns)
    if (width(segs) > columns) throw new Error(`${columns} columns gave ${width(segs)}: ${text(segs)}`)
  }
  expect(text(summary(c, 13))).toBe('✓ 2/5 | ● 2')
  expect(text(summary(c, 25))).toBe('✓ 2/5 | ● 2 | feature/…')
})

test('summary ends with the peer chips; no peers leaves it unchanged', () => {
  const peers = [
    { id: '1', name: 'score-c2', project: 'score', status: 'busy' },
    { id: '2', name: 'enso-0d', project: 'enso', status: 'done' },
  ]
  expect(summary({ ...FULL, peers }, 200).slice(-2)).toEqual([
    { text: '⧉ 2 · 1 busy', tone: 'success' },
    { text: 'enso done', tone: 'warning' },
  ])
  expect(summary(FULL, 200).length).toBe(4)
})
