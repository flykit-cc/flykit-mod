import type { EngineInterface, Register } from 'claude-code'

import { drawMeter, type FiveHourRow, type MeterView, type WeekRow } from './meter'
import { parseModelCache, rollDay, weekMeter, type DayState } from './usage'

const PANE = 'flykit'
const CACHE = '/.config/ghostcode/.slcache/usage.json'

// Last computed view; the pane draws it. Rebuilt on each reading and each minute.
let view: MeterView = { kind: 'waiting' }

// afterReply: a reply came back, so empty rate limits mean 'no plan limits', not 'not yet'.
async function refresh($: EngineInterface, afterReply = false) {
  const now = await $.clock.now()
  const { rateLimits } = await $.session.usage()
  const week = rateLimits.find(r => r.kind === 'seven_day')
  const five = rateLimits.find(r => r.kind === 'five_hour')
  if (!week) {
    if (afterReply) view = { kind: 'no-limits' }
    $.ui.invalidate('ui.render')
    return
  }

  let weekView: WeekRow = { used: week.percentUsed }
  if (week.resetsAt) {
    const prev = (await $.store.get('day')) as DayState | undefined
    const state = rollDay(prev, week.percentUsed, now, Date.parse(week.resetsAt))
    await $.store.set('day', state)
    weekView = weekMeter(state, week.percentUsed, now)
  }

  const home = await $.env.get('HOME')
  const models = home ? await $.fs.read(home + CACHE).then(t => parseModelCache(t, now), () => []) : []
  const fiveHour: FiveHourRow | undefined = five && { used: five.percentUsed, resetInMs: five.resetsAt ? Math.max(0, Date.parse(five.resetsAt) - now) : undefined }

  view = { kind: 'ready', week: weekView, fiveHour, models }
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'flykit', description: 'Open or close the flykit side panel' })
    await refresh($)
    $.clock.every(60_000, () => refresh($))
    void $.ui.open({ id: PANE, title: 'flykit' })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refresh($, true)
    return next(e)
  })

  on('command.run', { command: 'flykit' }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: 'flykit panel closed.' }
    }
    await $.ui.open({ id: PANE, title: 'flykit' })
    return { text: 'flykit panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    return drawMeter(els, view, e.props.bodyColumns)
  })
}
