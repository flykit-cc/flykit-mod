import { expect, test } from 'claude-code/testing'

import { peerRows } from './peers-view'

const P = [
  { id: '1', name: 'score-c2', project: 'score', status: 'busy', goal: 'Ship v2 checkout' },
  { id: '2', name: 'enso-0d', project: 'enso', status: 'done', goal: 'Leg B money path' },
  { id: '3', name: 'legacytradesgroup-ef', project: 'legacytradesgroup', status: 'idle' },
  { id: '4', name: 'macring-3a', project: 'macring', status: 'shell' },
]

test('rows: dot, padded name, status, goal or project', () => {
  expect(peerRows(P, 80)).toEqual([
    { key: 'peer-score-c2', dot: '●', color: 'green', text: 'score-c2          busy   goal: Ship v2 checkout' },
    { key: 'peer-enso-0d', dot: '○', color: 'yellow', text: 'enso-0d           done   goal: Leg B money path' },
    { key: 'peer-legacytradesgroup-ef', dot: '○', text: 'legacytradesgro…  idle   legacytradesgroup' },
    { key: 'peer-macring-3a', dot: '◌', text: 'macring-3a        shell  macring' },
  ])
})

test('rows fit a narrow width', () => {
  for (const r of peerRows(P, 30)) expect(2 + r.text.length).toBeLessThanOrEqual(30)
})

test('a repeated name gets a unique key; the first keeps peer-<name>', () => {
  const two = [P[0]!, { ...P[1]!, name: 'score-c2' }, P[2]!, { ...P[3]!, name: 'score-c2' }]
  expect(peerRows(two, 80).map(r => r.key)).toEqual(['peer-score-c2', 'peer-score-c2-1', 'peer-legacytradesgroup-ef', 'peer-score-c2-3'])
})
