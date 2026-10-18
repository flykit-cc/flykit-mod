import type { Elements, RenderSurface } from 'claude-code'

import { bar, formatDuration, pct, type ModelLimit, type WeekMeter } from './usage'

// What the panel shows. Filled by register.tsx, drawn here.
export type WeekRow = WeekMeter | { used: number }
export type FiveHourRow = { used: number; resetInMs: number | undefined }

export type MeterView =
  | { kind: 'no-limits' }
  | { kind: 'waiting' }
  | {
      kind: 'ready'
      week: WeekRow
      fiveHour: FiveHourRow | undefined
      models: ModelLimit[]
    }

const LABEL = 6

export function drawMeter(els: Pick<Elements[RenderSurface], 'Box' | 'Text'>, view: MeterView, columns: number) {
  const { Box, Text } = els
  if (view.kind === 'no-limits') return <Text dimColor>no plan limits</Text>
  if (view.kind === 'waiting') return <Text dimColor>waiting for first reply</Text>

  const width = Math.max(8, Math.min(24, columns - LABEL - 30))
  const row = (key: string, label: string, percent: number, tail: string, opts: { mark?: number; dim?: boolean; color?: string } = {}) => (
    <Box key={key}>
      <Text bold dimColor={opts.dim}>{label.padEnd(LABEL)}</Text>
      <Text color={opts.color} dimColor={opts.dim}>{bar(percent, width, opts.mark)}</Text>
      <Text dimColor={opts.dim}> {pct(percent).padStart(6)}  {tail}</Text>
    </Box>
  )

  const w = view.week
  const rows = []
  if ('pace' in w) {
    const sign = w.ahead >= 0 ? '+' : ''
    const word = w.ahead >= 0 ? 'ahead' : 'behind'
    rows.push(row('week', 'Week', w.used, `pace ${pct(w.pace)}  ${sign}${pct(w.ahead)} ${word}`, { mark: w.pace, color: w.ahead > 0 ? 'yellow' : 'green' }))
    const share = w.budgetToday > 0 ? (w.usedToday / w.budgetToday) * 100 : 100
    rows.push(row('today', 'Today', share, `${pct(w.usedToday)} of ${pct(w.budgetToday)}  new day in ${formatDuration(w.nextDayInMs)}`, { color: share > 100 ? 'red' : undefined }))
  } else {
    rows.push(row('week', 'Week', w.used, ''))
  }
  if (view.fiveHour) {
    const r = view.fiveHour.resetInMs
    rows.push(row('5h', '5h', view.fiveHour.used, r === undefined ? '' : `resets ${formatDuration(r)}`))
  }
  for (const m of view.models) {
    rows.push(row(`model-${m.name}`, m.name.slice(0, LABEL - 1), m.percent, m.resetInMs === undefined ? '' : `resets ${formatDuration(m.resetInMs)}`, { dim: m.isStale }))
  }
  return <Box flexDirection="column">{rows}</Box>
}
