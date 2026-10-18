import { expect, test } from 'claude-code/testing'

import type { Cockpit } from './cockpit'
import { detailRows, summary } from './cockpit-view'

const FULL: Cockpit = {
  progress: { goal: 'Build the flykit Claude Code mod in 4 parts', open: ['write spec', 'build band', 'test live'], done: 2 },
  questions: { open: 1, top: { id: 'Q1', asks: 'Which key opens the cockpit?', options: [] } },
  git: { branch: 'main', changed: 3, ahead: 2 },
  agents: [{ type: 'Explore', description: 'map hooks' }, { type: 'flow:reviewer', description: 'check diff' }],
}

const text = (segs: { text: string }[]) => segs.map(s => s.text).join(' · ')

test('summary shows every segment in order', () => {
  expect(text(summary(FULL, 200))).toBe('Build the flykit Claude Code mod in 4 parts · 2/5 tasks · ● 2 agents · ? 1 question · main +3 ↑2')
})

test('summary cuts the goal to fit and drops it when too narrow', () => {
  const rest = '2/5 tasks · ● 2 agents · ? 1 question · main +3 ↑2'
  const line = text(summary(FULL, rest.length + 3 + 12))
  expect(line).toBe('Build the f… · ' + rest)
  expect(text(summary(FULL, rest.length + 5))).toBe(rest)
})

test('summary leaves out empty parts and colors the rest', () => {
  const segs = summary({ progress: { open: [], done: 0 }, questions: 'broken', git: { branch: 'dev', changed: 0, ahead: 0 }, agents: [{ type: 'Explore', description: 'x' }] }, 200)
  expect(segs).toEqual([
    { text: '● 1 agent', color: 'green' },
    { text: 'questions.md broken', color: 'red' },
    { text: 'dev' },
  ])
})

test('detail rows', () => {
  expect(detailRows(FULL)).toEqual([
    { label: 'goal', text: 'Build the flykit Claude Code mod in 4 parts' },
    { label: 'next', text: '○ write spec   ○ build band' },
    { label: 'agent', text: '● Explore · map hooks', color: 'green' },
    { label: 'agent', text: '● flow:reviewer · check diff', color: 'green' },
    { label: 'git', text: 'main · 3 changed · 2 unpushed' },
  ])
  expect(detailRows({ agents: [] })).toEqual([])
  expect(detailRows({ agents: [], questions: 'broken' })).toEqual([{ label: 'ask', text: 'questions.md broken', color: 'red' }])
})

test('summary without goal when the detail is open', () => {
  expect(text(summary(FULL, 200, false))).toBe('2/5 tasks · ● 2 agents · ? 1 question · main +3 ↑2')
})

test('summary goal boundary: 8 columns left keeps the goal, 7 drops it', () => {
  const rest = '2/5 tasks · ● 2 agents · ? 1 question · main +3 ↑2'
  expect(text(summary(FULL, rest.length + 3 + 8))).toBe('Build t… · ' + rest)
  expect(text(summary(FULL, rest.length + 3 + 7))).toBe(rest)
})

test('summary never exceeds the width, even with a long branch', () => {
  const c: Cockpit = { ...FULL, git: { branch: 'feature/flow-cockpit-band', changed: 12, ahead: 3 } }
  for (let columns = 0; columns <= 120; columns++) {
    const line = text(summary(c, columns))
    if (line.length > columns) throw new Error(`${columns} columns gave ${line.length}: ${line}`)
  }
  expect(text(summary(c, 40))).toBe('2/5 tasks · ● 2 agents · ? 1 question')
  expect(text(summary(c, 50))).toBe('2/5 tasks · ● 2 agents · ? 1 question · feature/f…')
})
