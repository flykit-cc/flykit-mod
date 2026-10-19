import type { Color, Elements, RenderSurface } from 'claude-code'

import type { Cockpit } from './cockpit'
import { type Peer, peerSegments } from './peers'
import { drawPeers } from './peers-view'
import { chip, chipsWidth, cut, GAP, LABEL, label, PAD, type Tone } from './style'

export type Seg = { text: string; tone?: Tone }
export type Row = { label: string; text: string; color?: Color }

const MIN_GOAL = 8
const MIN_SEG = 4
const MARK = '◆ flykit'
// The toggle Button draws "[ " and " ]" around the mark and " ▸" (plain would draw the hotkey's "c: " instead);
// the chips follow in a plain Button, a gap before each.
const SCOPE = 'cockpit'
export const HEAD = 2 + MARK.length + 2 + GAP + 2

const width = (segs: Seg[]) => chipsWidth(segs.map(s => s.text))

export function summary(c: Cockpit, columns: number, withGoal = true): Seg[] {
  const segs: Seg[] = []
  const p = c.progress
  const total = p ? p.open.length + p.done : 0
  if (p && total > 0) segs.push({ text: `✓ ${p.done}/${total}` })
  if (c.agents.length > 0) segs.push({ text: `● ${c.agents.length}`, tone: 'success' })
  const q = c.questions
  if (q === 'broken') segs.push({ text: 'questions.md broken', tone: 'error' })
  // An open top draws its own question block with "1 of N", so the count would repeat it.
  else if (q && q.open > 0 && !q.top) segs.push({ text: `? ${q.open}`, tone: 'warning' })
  const g = c.git
  if (g) {
    const text = g.branch + (g.changed > 0 ? ` +${g.changed}` : '') + (g.ahead > 0 ? ` ↑${g.ahead}` : '')
    segs.push(g.ahead > 0 ? { text, tone: 'suggestion' } : { text })
  }
  segs.push(...peerSegments(c.peers))

  if (withGoal && p?.goal) {
    const room = columns - width(segs) - (segs.length > 0 ? GAP : 0) - PAD
    if (room >= MIN_GOAL) segs.unshift({ text: cut(p.goal, room) })
  }
  return fit(segs, columns)
}

// No line wraps: cut the last chip to fit, or drop it when too little room is left.
function fit(segs: Seg[], columns: number): Seg[] {
  for (;;) {
    const over = width(segs) - columns
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
  for (const a of c.agents) rows.push({ label: 'agent', text: `● ${a.type} · ${a.description}`, color: 'success' })
  const q = c.questions
  if (q === 'broken') rows.push({ label: 'ask', text: 'questions.md broken', color: 'error' })
  const g = c.git
  if (g) rows.push({ label: 'git', text: `${g.branch} · ${g.changed} changed · ${g.ahead} unpushed` })
  return rows
}

export function drawCockpit(
  els: Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>,
  c: Cockpit,
  columns: number,
  isOpen: boolean,
  toggle: () => void,
  onPeer: (p: Peer) => void,
  onNew: () => void,
) {
  const { Box, Text, Button } = els
  const segs = summary(c, columns - HEAD, !isOpen)
  if (segs.length === 0) return null
  return (
    <Box flexDirection="column">
      <Box>
        <Button key="cockpit" hotkey="c" onPress={toggle}>
          <Text bold color="claude" hover={{ scope: SCOPE, backgroundColor: 'claude', color: 'inverseText' }}>
            {MARK}
          </Text>
          <Text bold color="inactive" hover={{ scope: SCOPE, color: 'claude' }}>
            {isOpen ? ' ▾' : ' ▸'}
          </Text>
        </Button>
        <Button key="cockpit-row" plain onPress={toggle}>
          {segs.flatMap((s, i) => [' ', chip(Text, s.text, s.tone, SCOPE, `seg-${i}`, false)])}
        </Button>
      </Box>
      {isOpen &&
        detailRows(c).map((r, i) => (
          <Box key={`row-${i}`}>
            {label(Text, r.label)}
            <Text color={r.color ?? 'text'}>{cut(r.text, columns - LABEL)}</Text>
          </Box>
        ))}
      {isOpen && drawPeers(els, c.peers, columns, onPeer, onNew)}
    </Box>
  )
}
