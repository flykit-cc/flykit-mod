import { expect, test } from 'claude-code/testing'

import { peerRows, rowWidth } from './peers-view'

const P = [
  { id: '1', name: 'score-c2', project: 'score', status: 'busy', goal: 'Ship v2 checkout' },
  { id: '2', name: 'enso-0d', project: 'enso', status: 'done', goal: 'Leg B money path' },
  { id: '3', name: 'legacytradesgroup-ef', project: 'legacytradesgroup', status: 'idle' },
  { id: '4', name: 'macring-3a', project: 'macring', status: 'shell' },
]

test('rows: padded name, toned status chip, goal or project', () => {
  expect(peerRows(P, 80)).toEqual([
    { key: 'peer-score-c2', name: 'score-c2        ', status: 'busy ', tone: 'success', tail: 'goal: Ship v2 checkout' },
    { key: 'peer-enso-0d', name: 'enso-0d         ', status: 'done ', tone: 'warning', tail: 'goal: Leg B money path' },
    { key: 'peer-legacytradesgroup-ef', name: 'legacytradesgro…', status: 'idle ', tone: 'neutral', tail: 'legacytradesgroup' },
    { key: 'peer-macring-3a', name: 'macring-3a      ', status: 'shell', tone: 'neutral', tail: 'macring' },
  ])
})

test('rows fit every width, chip padding counted', () => {
  for (let columns = 10; columns <= 80; columns++) {
    for (const r of peerRows(P, columns)) {
      if (rowWidth(r) > columns) throw new Error(`${columns} columns gave ${rowWidth(r)}: ${r.name}|${r.status}|${r.tail}`)
    }
  }
  expect(peerRows(P, 40)[0]!.tail).toBe('goal: Ship v2…')
})

test('a repeated name gets a unique key; the first keeps peer-<name>', () => {
  const two = [P[0]!, { ...P[1]!, name: 'score-c2' }, P[2]!, { ...P[3]!, name: 'score-c2' }]
  expect(peerRows(two, 80).map(r => r.key)).toEqual(['peer-score-c2', 'peer-score-c2-1', 'peer-legacytradesgroup-ef', 'peer-score-c2-3'])
})
