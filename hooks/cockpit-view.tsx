import type { Elements, RenderSurface } from 'claude-code'

import type { Cockpit } from './cockpit'

export type Seg = { text: string; color?: string }
export type Row = { label: string; text: string; color?: string }

const SEP = ' · '
const MIN_GOAL = 8
const LABEL = 7
const MIN_SEG = 4
const HOTKEY = 3 // the plain Button draws "c: " before the summary

const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function summary(c: Cockpit, columns: number): Seg[] {
  const segs: Seg[] = []
  const p = c.progress
  const total = p ? p.open.length + p.done : 0
  if (p && total > 0) segs.push({ text: `${p.done}/${total} tasks` })
  if (c.agents.length > 0) segs.push({ text: `● ${plural(c.agents.length, 'agent')}`, color: 'green' })
  const q = c.questions
  if (q === 'broken') segs.push({ text: 'questions.md broken', color: 'red' })
  else if (q && q.open > 0) segs.push({ text: `? ${plural(q.open, 'question')}`, color: 'yellow' })
  const g = c.git
  if (g) segs.push({ text: g.branch + (g.changed > 0 ? ` +${g.changed}` : '') + (g.ahead > 0 ? ` ↑${g.ahead}` : '') })

  if (p?.goal) {
    const used = segs.reduce((n, s) => n + s.text.length + SEP.length, 0)
    const room = columns - used
    if (room >= MIN_GOAL) segs.unshift({ text: cut(p.goal, room) })
  }
  return fit(segs, columns)
}

// No line wraps: cut the last segment to fit, or drop it when too little room is left.
function fit(segs: Seg[], columns: number): Seg[] {
  for (;;) {
    const over = segs.reduce((n, s) => n + s.text.length, 0) + SEP.length * Math.max(0, segs.length - 1) - columns
    const last = segs[segs.length - 1]
    if (over <= 0 || !last) return segs
    const keep = last.text.length - over
    if (keep < MIN_SEG) segs.pop()
    else segs[segs.length - 1] = { ...last, text: cut(last.text, keep) }
  }
}

export function detailRows(c: Cockpit): Row[] {
  const rows: Row[] = []
  const p = c.progress
  if (p?.goal) rows.push({ label: 'goal', text: p.goal })
  if (p && p.open.length > 0) rows.push({ label: 'next', text: p.open.slice(0, 2).map(t => `○ ${t}`).join('   ') })
  for (const a of c.agents) rows.push({ label: 'agent', text: `● ${a.type} · ${a.description}`, color: 'green' })
  const q = c.questions
  if (q === 'broken') rows.push({ label: 'ask', text: 'questions.md broken', color: 'red' })
  else if (q?.top) rows.push({ label: 'ask', text: `? ${q.top}`, color: 'yellow' })
  const g = c.git
  if (g) rows.push({ label: 'git', text: `${g.branch} · ${g.changed} changed · ${g.ahead} unpushed` })
  return rows
}

export function drawCockpit(els: Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>, c: Cockpit, columns: number, isOpen: boolean, toggle: () => void) {
  const { Box, Text, Button } = els
  const segs = summary(c, columns - HOTKEY)
  if (segs.length === 0) return null
  return (
    <Box flexDirection="column">
      <Button key="cockpit" hotkey="c" plain onPress={toggle}>
        {segs.map((s, i) => (
          <Text key={String(i)} color={s.color} dimColor={!s.color}>
            {(i > 0 ? SEP : '') + s.text}
          </Text>
        ))}
      </Button>
      {isOpen &&
        detailRows(c).map((r, i) => (
          <Box key={`row-${i}`}>
            <Text dimColor>{r.label.padEnd(LABEL)}</Text>
            <Text color={r.color} dimColor={!r.color}>{cut(r.text, columns - LABEL)}</Text>
          </Box>
        ))}
    </Box>
  )
}
