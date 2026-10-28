import type { On, SessionUsage } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

const NOW = Date.UTC(2026, 9, 21, 21)
const RESET = '2026-10-24T09:00:00Z'
const Q = '.flow/questions.md'
const TWO = '## Q3\nstatus: open\nasks: Which key?\noptions: A: c; B: k\nrecommendation: A, short\n\n## Q4\nstatus: open\nasks: next one\n'

const usage: SessionUsage = { startedAt: NOW, context: { percent: 10 } as SessionUsage['context'], rateLimits: [{ kind: 'seven_day', percentUsed: 10, resetsAt: RESET }] }
const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } as never

type World = { writes: { path: string; text: string }[]; submits: string[]; fills: string[] }

// files: paths relative to the cwd; fs.write updates them so the next read sees the answer.
function world(on: On, files: Record<string, string>, denyWrite = false, draft = ''): World {
  const w: World = { writes: [], submits: [], fills: [] }
  mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, {})
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: usage }))
  const hit = (path: string) => Object.keys(files).find(p => path.endsWith('/' + p) || path === p)
  on('fs.read', ($, e) => {
    const p = hit(e.path)
    return p ? { value: files[p]! } : { deny: 'missing' }
  })
  on('fs.write', ($, e) => {
    if (denyWrite) return { deny: 'read-only' }
    w.writes.push({ path: e.path, text: e.text })
    files[hit(e.path) ?? e.path] = e.text
    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    w.submits.push(e.text)
    return { text: e.text }
  })
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', ($, e) => {
    w.fills.push(e.text)
    return { isFilled: true }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '## main\n', stderr: '' } as never }))
  on('agent.list', () => ({ value: [] as never }))
  return w
}

async function mount($: Engine) {
  await $.session.measure({ ...usage, changed: ['rateLimits'] })
  return $.ui.mount({ plugin: 'flykit', surface: 'terminal', component: 'AbovePrompt', props })
}

test('band shows the open question with answer buttons', async ($, on) => {
  world(on, { [Q]: TWO })
  const ui = await mount($)
  expect(await ui.find({ text: ' ? Q3 ' })).toBeDefined()
  expect(await ui.find({ text: 'Which key?' })).toBeDefined()
  expect(await ui.find({ text: /★ A, short/ })).toBeDefined()
  expect(await ui.find({ text: '1 of 2' })).toBeDefined()
  expect(await ui.find({ key: 'answer-A' })).toBeDefined()
  expect(await ui.find({ key: 'answer-B' })).toBeDefined()
  expect(await ui.find({ key: 'reply' })).toBeDefined()
  expect(await ui.find({ text: 'week' })).toBeDefined()
})

test('a click saves the answer, tells Claude, and moves to the next question', async ($, on) => {
  const w = world(on, { [Q]: TWO })
  const ui = await mount($)
  await ui.press({ key: 'answer-B' })

  expect(w.writes.length).toBe(1)
  expect(w.writes[0]!.path.endsWith(Q)).toBe(true)
  expect(w.writes[0]!.text).toContain('## Q3\nstatus: answered')
  expect(w.writes[0]!.text).toContain('answer: B: k (flykit band)')
  expect(w.writes[0]!.text).toContain('## Q4\nstatus: open')
  expect(w.submits.length).toBe(1)
  expect(w.submits[0]!.startsWith('Q3 answered in the flykit band: B: k.')).toBe(true)
  expect(await ui.find({ text: ' ? Q4 ' })).toBeDefined()
  expect(await ui.find({ text: ' next one' })).toBeDefined()
  expect(await ui.find({ text: /Which key\?/ })).toBeUndefined()
})

test('answering the next question leaves the first one alone', async ($, on) => {
  const files = { [Q]: '## Q3\nstatus: open\nasks: Which key?\noptions: A: c; B: k\n\n## Q4\nstatus: open\nasks: next one\noptions: A: yes; B: no\n' }
  const w = world(on, files)
  const ui = await mount($)
  await ui.press({ key: 'answer-B' })
  const afterQ3 = w.writes[0]!.text
  await ui.press({ key: 'answer-A' })

  expect(w.writes.length).toBe(2)
  expect(w.submits.length).toBe(2)
  expect(w.submits[1]!.startsWith('Q4 answered in the flykit band: A: yes.')).toBe(true)
  const q3 = (t: string) => t.slice(0, t.indexOf('## Q4'))
  expect(q3(w.writes[1]!.text)).toBe(q3(afterQ3))
  expect(w.writes[1]!.text).toContain('answer: A: yes (flykit band)')
})

test('a failed write tells Claude nothing and keeps the question', async ($, on) => {
  const w = world(on, { [Q]: TWO }, true)
  const ui = await mount($)
  await ui.press({ key: 'answer-A' })
  expect(w.submits.length).toBe(0)
  expect(await ui.find({ text: ' ? Q3 ' })).toBeDefined()
  expect(await ui.find({ text: 'Which key?' })).toBeDefined()
  expect(await ui.find({ text: /★ A, short/ })).toBeDefined()
})

test('reply fills the prompt with the question id', async ($, on) => {
  const w = world(on, { [Q]: TWO })
  const ui = await mount($)
  await ui.press({ key: 'reply' })
  expect(w.fills).toEqual(['Q3: '])
  expect(w.writes.length).toBe(0)
})

test('reply keeps the draft after the question id', async ($, on) => {
  const w = world(on, { [Q]: TWO }, false, 'hello')
  const ui = await mount($)
  await ui.press({ key: 'reply' })
  expect(w.fills).toEqual(['Q3: hello'])
})

test('reply leaves a draft that already names the question', async ($, on) => {
  const w = world(on, { [Q]: TWO }, false, 'Q3: hello')
  const ui = await mount($)
  await ui.press({ key: 'reply' })
  expect(w.fills).toEqual(['Q3: hello'])
})

test('a broken questions file draws no question block', async ($, on) => {
  world(on, { [Q]: '## Q1\nstatus: open\nhello\n' })
  const ui = await mount($)
  expect(await ui.find({ key: 'answer-A' })).toBeUndefined()
  expect(await ui.find({ key: 'reply' })).toBeUndefined()
  expect(await ui.find({ text: /questions\.md broken/ })).toBeDefined()
})

test('context shows only when the cockpit is open', async ($, on) => {
  world(on, { [Q]: '## Q3\nstatus: open\nasks: Which key?\ncontext: Long reason here.\noptions: A: c; B: k\n' })
  const ui = await mount($)
  expect(await ui.find({ text: /Long reason here/ })).toBeUndefined()
  await ui.press({ key: 'cockpit' })
  expect(await ui.find({ text: /Long reason here/ })).toBeDefined()
})

test('long options show in full, one per row, and a click on the text answers', async ($, on) => {
  const long = 'keep every word of this option visible '.repeat(4).trim()
  const w = world(on, { [Q]: `## Q3\nstatus: open\nasks: Which key?\noptions: A: ${long}; B: k\n` })
  const ui = await mount($)
  expect(await ui.find({ text: /option visible$/ })).toBeDefined()
  expect(await ui.find({ text: /…/ })).toBeUndefined()
  await ui.press({ key: 'answer-A-1' })
  expect(w.writes[0]!.text).toContain(`answer: A: ${long} (flykit band)`)
})

const ASK = {
  tool: 'AskUserQuestion' as const,
  tool_use_id: 'toolu_1',
  questions: [
    {
      question: 'Publish the hosting page?',
      header: 'Hosting',
      multiSelect: false,
      options: [
        { label: 'Publish (Recommended)', description: 'Goes to Confluence now.', preview: 'WHAT IT SAYS\n- Database: PostgreSQL\n- Hosting: Hetzner\n- Plan B: dedicated servers\n- Login stays Microsoft Entra' },
        { label: 'I want changes', description: 'Nothing is published.' },
      ],
    },
  ],
}

test('a Claude question dialog draws in the band in full, and a click answers it', async ($, on) => {
  const w = world(on, {})
  const ui = await mount($)
  const r = await $.tool.call(ASK)
  expect('result' in r && r.result).toMatchObject({ answers: {} })
  expect(await ui.find({ text: 'Publish the hosting page?' })).toBeDefined()
  expect(await ui.find({ text: '- Login stays Microsoft Entra' })).toBeDefined()
  await ui.press({ key: 'answer-1' })
  expect(w.submits).toEqual(['Answer to "Publish the hosting page?": Publish (Recommended)'])
  expect(await ui.find({ text: 'Publish the hosting page?' })).toBeUndefined()
})

test('several questions or multi-select keep the engine dialog', async ($, on) => {
  world(on, {})
  on('tool.call', () => ({ deny: 'engine dialog' }))
  const ui = await mount($)
  const q = ASK.questions[0]!
  for (const questions of [[{ ...q, multiSelect: true }], [q, q]]) {
    const r = await $.tool.call({ ...ASK, questions })
    expect(r).toEqual({ deny: 'engine dialog' })
  }
  expect(await ui.find({ text: 'Publish the hosting page?' })).toBeUndefined()
})

test('band question: a plain message keeps it, a reply or ✕ closes it', async ($, on) => {
  world(on, {})
  const ui = await mount($)
  await $.tool.call(ASK)
  await $.prompt.submit({ text: 'what am I seeing?', origin: { kind: 'composer' }, wait: false })
  expect(await ui.find({ text: 'Publish the hosting page?' })).toBeDefined()
  await $.prompt.submit({ text: 'Hosting: publish but fix the title', origin: { kind: 'composer' }, wait: false })
  expect(await ui.find({ text: 'Publish the hosting page?' })).toBeUndefined()
  await $.tool.call(ASK)
  await ui.press({ key: 'close' })
  expect(await ui.find({ text: 'Publish the hosting page?' })).toBeUndefined()
})
