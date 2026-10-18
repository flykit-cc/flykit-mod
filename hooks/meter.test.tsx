import type { SessionRateLimit, SessionUsage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 9, 21, 21) // Wed 21:00 UTC
const RESET = '2026-10-24T09:00:00Z' // next Sat 09:00 UTC
const SURFACES = ['terminal', 'desktop'] as const

const usage = (rateLimits: SessionRateLimit[]): SessionUsage => ({
  startedAt: NOW,
  context: { percent: 10 } as SessionUsage['context'],
  rateLimits,
})

const props = { title: 'flykit', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 } } as never

for (const surface of SURFACES) {
  test(`${surface}: draws week, today, 5h and model rows`, async ($, on) => {
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
    const ui = await $.ui.mount({ plugin: 'flykit', surface, component: 'Pane', requestId: 'flykit', props })

    // Wed 21:00 is 4.5 days into the week: pace 64.3%, used 60% → 4.3 behind.
    expect((await ui.find({ text: /pace 64\.3%/ }))).toBeDefined()
    expect((await ui.find({ text: /behind/ }))).toBeDefined()
    expect((await ui.find({ text: /new day in 12h/ }))).toBeDefined()
    expect((await ui.find({ text: /resets 2h10/ }))).toBeDefined()
    expect((await ui.find({ text: 'Fable' }))).toBeDefined()
  })

  test(`${surface}: says no plan limits after a reply with none`, async ($, on) => {
    mock.clock(on, { now: NOW })
    mock.store(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    mock.env(on, {})
    on('session.usage', () => ({ value: usage([]) }))

    await $.session.measure({ ...usage([]), changed: ['context'] })
    const ui = await $.ui.mount({ plugin: 'flykit', surface, component: 'Pane', requestId: 'flykit', props })
    expect((await ui.find({ text: 'no plan limits' }))).toBeDefined()
  })
}
