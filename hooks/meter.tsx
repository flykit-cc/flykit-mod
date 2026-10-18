import type { Elements, RenderSurface } from 'claude-code'

import { bar, formatDuration, pct, type ModelLimit, type WeekMeter } from './usage'

export type WeekRow = WeekMeter | { used: number }
export type FiveHourRow = { used: number; resetInMs: number | undefined }

// What the band shows. Filled by register.tsx, drawn here.
export type MeterView =
  | { kind: 'no-limits' }
  | { kind: 'waiting' }
  | { kind: 'ready'; week: WeekRow; fiveHour: FiveHourRow | undefined; models: ModelLimit[] }

type Cell = { key: string; label: string; percent: number; value?: number; mark?: number; tail: string; color?: string; dim?: boolean }

const LABEL = 6
const BAR = 12
const TAIL = 9
const CELL = LABEL + BAR + 5 + TAIL // label, bar, " 100%", tail
const GAP = 3
const PAD = 2 // matches the status line indent

export function meterCells(view: Extract<MeterView, { kind: 'ready' }>): Cell[] {
  const cells: Cell[] = []
  const w = view.week
  if ('pace' in w) {
    const sign = w.ahead >= 0 ? '+' : ''
    cells.push({ key: 'week', label: 'week', percent: w.used, mark: w.pace, tail: `${sign}${pct(w.ahead).slice(0, -1)}`, color: w.ahead > 0 ? 'yellow' : 'green' })
    const share = w.budgetToday > 0 ? (w.usedToday / w.budgetToday) * 100 : 100
    cells.push({ key: 'today', label: 'today', percent: share, value: w.usedToday, tail: `of ${pct(w.budgetToday)}`, color: share > 100 ? 'red' : 'green' })
  } else {
    cells.push({ key: 'week', label: 'week', percent: w.used, tail: '', color: 'green' })
  }
  if (view.fiveHour) {
    const r = view.fiveHour.resetInMs
    cells.push({ key: '5h', label: '5h', percent: view.fiveHour.used, tail: r === undefined ? '' : formatDuration(r), color: 'green' })
  }
  for (const m of view.models) {
    cells.push({ key: `model-${m.name}`, label: m.name.toLowerCase().slice(0, LABEL - 1), percent: m.percent, tail: m.resetInMs === undefined ? '' : formatDuration(m.resetInMs), color: 'green', dim: m.isStale })
  }
  return cells
}

export function drawMeter(els: Pick<Elements[RenderSurface], 'Box' | 'Text'>, view: MeterView, columns: number) {
  const { Box, Text } = els
  return <Box paddingX={PAD}>{meterBody(els, view, columns - 2 * PAD)}</Box>
}

function meterBody(els: Pick<Elements[RenderSurface], 'Box' | 'Text'>, view: MeterView, columns: number) {
  const { Box, Text } = els
  if (view.kind === 'no-limits') return <Text dimColor>no plan limits</Text>
  if (view.kind === 'waiting') return <Text dimColor>usage: waiting for first reply</Text>

  const cell = (c: Cell) => (
    <Box key={c.key} width={CELL}>
      <Text dimColor>{c.label.padEnd(LABEL)}</Text>
      <Text>
        {bar(c.percent, BAR, c.mark).map((run, i) =>
          run.kind === 'fill' ? <Text key={String(i)} color={c.color} dimColor={c.dim}>{run.text}</Text> : <Text key={String(i)} dimColor>{run.text}</Text>,
        )}
      </Text>
      <Text dimColor={c.dim}>{pct(c.value ?? c.percent).padStart(5)}</Text>
      <Text dimColor> {c.tail}</Text>
    </Box>
  )

  const cells = meterCells(view)
  const perLine = Math.max(1, Math.floor((columns + GAP) / (CELL + GAP)))
  const lines: Cell[][] = []
  for (let i = 0; i < cells.length; i += perLine) lines.push(cells.slice(i, i + perLine))
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Box key={`line-${i}`} gap={GAP}>
          {line.map(cell)}
        </Box>
      ))}
    </Box>
  )
}
