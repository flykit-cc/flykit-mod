import type { On, SessionUsage } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

const NOW = Date.UTC(2026, 9, 21, 21)
const DIR = '/home/k/.claude/sessions'
const usage: SessionUsage = { startedAt: NOW, context: { percent: 10 } as SessionUsage['context'], rateLimits: [{ kind: 'seven_day', percentUsed: 10, resetsAt: '2026-10-24T09:00:00Z' }] }
const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } as never
const USER = { origin: { kind: 'composer' }, wait: false } as const

const entry = (sessionId: string, name: string, pid: number, cwd: string, status: string) => JSON.stringify({ sessionId, name, pid, cwd, status, kind: 'interactive' })

type World = { files: Record<string, string>; reads: string[]; runs: string[][]; sends: { to: unknown; text: string }[]; fills: string[] }

// The engine hands a hook `{ sessionId }` already spelled as the id string.
// Registry: api (pid 1, live), web (pid 2, dead), this session (pid 3, live), and a secret .key file.
// send: 'ok', 'undelivered' (isDelivered false) or 'throws' (the call rejects). extra: more registry files.
function world(on: On, send: 'ok' | 'undelivered' | 'throws' = 'ok', draft = '', extra: Record<string, string> = {}): World {
  const w: World = {
    files: {
      [`${DIR}/1.json`]: entry('s1', 'api', 1, '/w/api', 'busy'),
      [`${DIR}/1.key`]: 'SECRET',
      [`${DIR}/2.json`]: entry('s2', 'web', 2, '/w/web', 'idle'),
      [`${DIR}/me.json`]: entry('me', 'self', 3, '/w/self', 'busy'),
      '/w/api/.flow/session-progress.md': '## Goal\nship peers\n',
      ...extra,
    },
    reads: [],
    runs: [],
    sends: [],
    fills: [],
  }
  mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, { HOME: '/home/k' })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: usage }))
  on('session.id', () => ({ value: 'me' }))
  on('fs.list', ($, e) => (e.path === DIR ? { value: ['1.json', '1.key', '2.json', 'me.json', ...Object.keys(extra).map(p => p.slice(DIR.length + 1))].map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0 })) as never } : { deny: 'missing' }))
  on('fs.read', ($, e) => {
    w.reads.push(e.path)
    const text = w.files[e.path]
    return text === undefined ? { deny: 'missing' } : { value: text }
  })
  on('process.run', ($, e) => {
    w.runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: e.argv[0] === 'ps' ? '1\n3\n' : '## main\n', stderr: '' } as never }
  })
  on('agent.list', () => ({ value: [] as never }))
  on('session.send', ($, e) => {
    w.sends.push({ to: e.to, text: e.text })
    // A throwing hook is skipped; nothing beneath answers, so $.session.send itself rejects.
    if (send === 'throws') throw new Error('socket gone')
    return send === 'undelivered' ? { isDelivered: false as const, reason: 'socket gone' } : { isDelivered: true as const }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', ($, e) => {
    w.fills.push(e.text)
    return { isFilled: true }
  })
  return w
}

async function mount($: Engine) {
  await $.session.measure({ ...usage, changed: ['rateLimits'] })
  return $.ui.mount({ plugin: 'flykit', surface: 'terminal', component: 'AbovePrompt', props })
}

test('summary counts only live peers and never reads a .key file', async ($, on) => {
  const w = world(on)
  const ui = await mount($)
  expect(await ui.find({ text: /⧉ 1/ })).toBeDefined()
  expect(w.reads.some(p => p.endsWith('.key'))).toBe(false)
})

test('the open cockpit lists the peer with its goal and a new-session button', async ($, on) => {
  world(on)
  const ui = await mount($)
  await ui.press({ key: 'cockpit' })
  expect(await ui.find({ text: /api.*goal: ship peers/ })).toBeDefined()
  expect(await ui.find({ key: 'new-session' })).toBeDefined()
  expect(await ui.find({ key: 'peer-web' })).toBeUndefined()
})

test('pressing a peer fills the prompt with its name', async ($, on) => {
  const w = world(on)
  const ui = await mount($)
  await ui.press({ key: 'cockpit' })
  await ui.press({ key: 'peer-api' })
  expect(w.fills).toEqual(['@api '])
})

test('@name text is sent to that peer and the prompt is dropped', async ($, on) => {
  const w = world(on)
  await mount($)
  const r = await $.prompt.submit({ text: '@api run the tests', ...USER })
  expect(w.sends).toEqual([{ to: 's1', text: 'run the tests' }])
  expect(r.drop).toBe('✓ sent to api')
})

test('a file mention passes through to Claude', async ($, on) => {
  const w = world(on)
  await mount($)
  const r = await $.prompt.submit({ text: '@hooks/register.tsx explain', ...USER })
  expect(w.sends.length).toBe(0)
  expect(r.drop).toBeUndefined()
  expect(r.text).toBe('@hooks/register.tsx explain')
})

test('a failed send drops with the reason and puts the text back', async ($, on) => {
  const w = world(on, 'undelivered')
  await mount($)
  const r = await $.prompt.submit({ text: '@api run the tests', ...USER })
  expect(r.drop).toBe('✗ not sent to api: socket gone')
  expect(w.fills).toEqual(['@api run the tests'])
})

test('new session opens a Ghostty window', async ($, on) => {
  const w = world(on)
  const ui = await mount($)
  await ui.press({ key: 'cockpit' })
  await ui.press({ key: 'new-session' })
  expect(w.runs).toContainEqual(['open', '-na', 'Ghostty'])
})

test('a peer that goes from busy to idle shows as done', async ($, on) => {
  const w = world(on)
  const ui = await mount($)
  w.files[`${DIR}/1.json`] = entry('s1', 'api', 1, '/w/api', 'idle')
  await $.session.measure({ ...usage, changed: ['rateLimits'] })
  expect(await ui.find({ text: /⧉ 1 · api done/ })).toBeDefined()
})

test('a send that rejects drops with ✗ and puts the text back', async ($, on) => {
  const w = world(on, 'throws')
  await mount($)
  const r = await $.prompt.submit({ text: '@api run the tests', ...USER })
  expect(r.drop?.startsWith('✗ not sent to api')).toBe(true)
  expect(w.fills).toEqual(['@api run the tests'])
})

test('a failed send keeps a draft typed meanwhile', async ($, on) => {
  const w = world(on, 'undelivered', 'next thing')
  await mount($)
  await $.prompt.submit({ text: '@api run the tests', ...USER })
  expect(w.fills).toEqual(['@api run the tests next thing'])
})

test('a peer name with a space matches whole', async ($, on) => {
  const w = world(on, 'ok', '', { [`${DIR}/4.json`]: entry('s4', 'fix login', 1, '/w/login', 'idle') })
  await mount($)
  const r = await $.prompt.submit({ text: '@fix login do it', ...USER })
  expect(w.sends).toEqual([{ to: 's4', text: 'do it' }])
  expect(r.drop).toBe('✓ sent to fix login')
})

test('the longest matching name wins', async ($, on) => {
  const w = world(on, 'ok', '', { [`${DIR}/5.json`]: entry('s5', 'api-2', 1, '/w/api2', 'idle') })
  await mount($)
  await $.prompt.submit({ text: '@api-2 x', ...USER })
  expect(w.sends).toEqual([{ to: 's5', text: 'x' }])
})

test('a name with only spaces after it is not sent', async ($, on) => {
  const w = world(on)
  await mount($)
  const r = await $.prompt.submit({ text: '@api   ', ...USER })
  expect(w.sends.length).toBe(0)
  expect(r.drop).toBeUndefined()
})

test("another plugin's @name prompt passes through", async ($, on) => {
  const w = world(on)
  await mount($)
  const r = await $.prompt.submit({ text: '@api x', origin: { kind: 'plugin', name: 'other' }, wait: false })
  expect(w.sends.length).toBe(0)
  expect(r.drop).toBeUndefined()
})
