import { describe, expect, test } from 'claude-code/testing'

import { DONE_MS, livePids, parseSession, peerSegments, projectOf, track, type SessionEntry } from './peers'

describe('parseSession', () => {
  test('reads the fields we use', () => {
    const text = JSON.stringify({ pid: 7715, sessionId: 'abb4', cwd: '/Users/k/GitHub/enso', name: 'enso-0d', status: 'busy', kind: 'interactive' })
    expect(parseSession(text)).toEqual({ id: 'abb4', name: 'enso-0d', pid: 7715, cwd: '/Users/k/GitHub/enso', status: 'busy' })
  })
  test('defaults and rejects', () => {
    expect(parseSession(JSON.stringify({ pid: 1, sessionId: 'a', name: 'n' }))).toEqual({ id: 'a', name: 'n', pid: 1, cwd: '', status: 'idle' })
    expect(parseSession('not json')).toBeUndefined()
    expect(parseSession(JSON.stringify({ pid: '1', sessionId: 'a', name: 'n' }))).toBeUndefined()
    expect(parseSession(JSON.stringify({ pid: 1, name: 'n' }))).toBeUndefined()
  })
  test('a blank name is rejected', () => {
    for (const name of ['', '   ']) expect(parseSession(JSON.stringify({ pid: 1, sessionId: 'a', name }))).toBeUndefined()
  })
  test('a pid ps cannot take is rejected', () => {
    for (const pid of [0, -1, 1.5]) expect(parseSession(JSON.stringify({ pid, sessionId: 'a', name: 'n' }))).toBeUndefined()
  })
})

describe('livePids', () => {
  test('keeps claude pids, by command basename', () => {
    expect([...livePids('  7715 claude\n39051   /usr/local/bin/claude\n\n garbage\n')]).toEqual([7715, 39051])
  })
  test('a reused pid running something else is not live', () => {
    expect([...livePids('7715 zsh\n39051 /bin/claudex\n4 claude\n')]).toEqual([4])
  })
  test('a bare pid without a command is not live', () => {
    expect([...livePids('7715\n')]).toEqual([])
  })
})

test('projectOf', () => {
  expect(projectOf('/Users/k/GitHub/enso')).toBe('enso')
  expect(projectOf('/Users/k/GitHub/enso/')).toBe('enso')
  expect(projectOf('')).toBe('?')
})

describe('track', () => {
  const e = (id: string, status: string): SessionEntry => ({ id, name: id, pid: 1, cwd: '/x/' + id, status })

  test('first sighting is never done', () => {
    expect(track([e('a', 'idle')], {}, 0).statuses).toEqual({ a: 'idle' })
  })

  test('busy then idle is done for 5 minutes, then idle', () => {
    const t1 = track([e('a', 'busy')], {}, 0)
    expect(t1.statuses).toEqual({ a: 'busy' })
    const t2 = track([e('a', 'idle')], t1.memory, 1000)
    expect(t2.statuses).toEqual({ a: 'done' })
    expect(track([e('a', 'idle')], t2.memory, 1000 + DONE_MS - 1).statuses).toEqual({ a: 'done' })
    expect(track([e('a', 'idle')], t2.memory, 1000 + DONE_MS).statuses).toEqual({ a: 'idle' })
  })

  test('busy again clears done; gone peers leave memory', () => {
    const t2 = track([e('a', 'idle')], { a: { status: 'busy' } }, 0)
    const t3 = track([e('a', 'busy')], t2.memory, 10)
    expect(t3.statuses).toEqual({ a: 'busy' })
    expect(t3.memory.a!.doneAt).toBeUndefined()
    expect(track([], t3.memory, 20).memory).toEqual({})
  })
})

describe('peerSegments', () => {
  const p = (name: string, status: string) => ({ id: name, name, project: name.split('-')[0]!, status })
  test('empty → none', () => expect(peerSegments([])).toEqual([]))
  test('count, busy, done', () => {
    expect(peerSegments([p('score-c2', 'busy'), p('enso-0d', 'done'), p('legacy-ef', 'idle')])).toEqual([
      { text: '⧉ 3 · 1 busy', tone: 'success' },
      { text: 'enso done', tone: 'warning' },
    ])
    expect(peerSegments([p('legacy-ef', 'idle')])).toEqual([{ text: '⧉ 1' }])
  })
})
