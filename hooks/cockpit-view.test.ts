import { expect, test } from 'claude-code/testing'

import type { Cockpit } from './cockpit'
import { detailRows, summary } from './cockpit-view'

const FULL: Cockpit = {
  progress: { goal: 'Build the flykit Claude Code mod in 4 parts', open: ['write spec', 'build band', 'test live'], done: 2 },
  questions: { open: 1, top: 'Which key opens the cockpit?' },
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
    { label: 'ask', text: '? Which key opens the cockpit?', color: 'yellow' },
    { label: 'git', text: 'main · 3 changed · 2 unpushed' },
  ])
  expect(detailRows({ agents: [] })).toEqual([])
})
