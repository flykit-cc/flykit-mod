import type { SessionRateLimit, SessionUsage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { fitLines } from './meter'

const NOW = Date.UTC(2026, 9, 21, 21) // Wed 21:00 UTC
const RESET = '2026-10-24T09:00:00Z' // next Sat 09:00 UTC
const SURFACES = ['terminal', 'desktop'] as const

const usage = (rateLimits: SessionRateLimit[]): SessionUsage => ({
  startedAt: NOW,
  context: { percent: 10 } as SessionUsage['context'],
  rateLimits,
})

const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } as never

for (const surface of SURFACES) {
  test(`${surface}: draws week, today, 5h and model cells`, async ($, on) => {
    mock.clock(on, { now: NOW })
    mock.store(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    mock.env(on, { HOME: '/home/k' })
    const limits = [
      { kind: 'seven_day', percentUsed: 60, resetsAt: RESET },
      { kind: 'five_hour', percentUsed: 18, resetsAt: '2026-10-21T23:10:00Z' },
    ]
    on('session.usage', () => ({ value: usage(limits) }))
    on('fs.read', () => ({ value: JSON.stringify({ at: NOW, scoped: [{ name: 'Fable', used_percentage: 33, resets_at: Date.parse(RESET) / 1000 }] }) }))

    await $.session.measure({ ...usage(limits), changed: ['rateLimits'] })
    const ui = await $.ui.mount({ plugin: 'flykit', surface, component: 'AbovePrompt', props })

    // Wed 21:00 is 4.5 days into the week: pace 64.3%, used 60% → 4.3 under.
    expect((await ui.find({ text: '4.3 under' }))).toBeDefined()
    expect((await ui.find({ text: 'today' }))).toBeDefined()
    expect((await ui.find({ text: '2h10' }))).toBeDefined()
    expect((await ui.find({ text: 'fable' }))).toBeDefined()
  })

  test(`${surface}: says no plan limits after a reply with none`, async ($, on) => {
    mock.clock(on, { now: NOW })
    mock.store(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    mock.env(on, {})
    on('session.usage', () => ({ value: usage([]) }))

    await $.session.measure({ ...usage([]), changed: ['context'] })
    const ui = await $.ui.mount({ plugin: 'flykit', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ text: 'no plan limits' }))).toBeDefined()
  })
}

test('/flykit hides the band and shows it again', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, {})
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: usage([{ kind: 'seven_day', percentUsed: 10, resetsAt: RESET }]) }))
  // Stands for the engine's own band when flykit passes it on.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })

  await $.session.measure({ ...usage([]), changed: ['rateLimits'] })
  const ui = await $.ui.mount({ plugin: 'flykit', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ text: 'week' })).toBeDefined()
  await $.command.run({ command: 'flykit', args: '' } as never)
  expect(await ui.find({ text: 'week' })).toBeUndefined()
  expect(await ui.find({ text: 'engine band' })).toBeDefined()
  await $.command.run({ command: 'flykit', args: '' } as never)
  expect(await ui.find({ text: 'week' })).toBeDefined()
})

test('band stretches to one line when wide, splits when narrow', () => {
  const cell = (key: string, tail: string) => ({ key, label: key, percent: 10, tail })
  const cells = [cell('week', '4.3 under'), cell('today', 'of 13.3%'), cell('5h', '2h10'), cell('fable', '5d14h')]
  expect(fitLines(cells, 160).lines.length).toBe(1)
  expect(fitLines(cells, 100).lines.length).toBe(2)
  expect(fitLines(cells, 20).bar).toBe(6)
})
