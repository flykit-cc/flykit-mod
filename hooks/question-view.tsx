import type { Elements, RenderSurface } from 'claude-code'

import type { OpenQuestion, Option } from './cockpit'
import { chip, chipWidth, GAP, wrap } from './style'

// No hotkey: a bare digit typed into an empty prompt would press it. Click, or ctrl+x tab then Enter.
// Nothing is cut or hidden: long text wraps onto more rows.
export type QLine = { label: string; effect: string }
export type QRow = { key: string; chip: string; lines: QLine[]; option?: Option } // option undefined = the reply button

const INDENT = 2
const REPLY = '✎ reply'
const MIN_EFFECT = 16 // narrower than this, an option's effect goes under its label

// id: the warning chip's text; lines: the full question, wrapped beside the chip and the count.
export function questionHeader(q: OpenQuestion, open: number, columns: number): { id: string; lines: string[]; count?: string } {
  const id = `? ${q.id}`
  const count = open > 1 ? `1 of ${open}` : undefined
  const room = columns - chipWidth(id) - 1 - (count ? count.length + 2 : 0)
  return { id, lines: wrap(q.asks, room), ...(count && { count }) }
}

// One option per row: a key chip (★ on the recommended), the label, then its effect in a column of
// its own so the effects line up. labelWidth: the label column (0 when effects go under the labels).
export function questionRows(q: OpenQuestion, columns: number): { labelWidth: number; rows: QRow[] } {
  const keys = q.options.map(o => (o.key === q.recommended ? '★ ' : '') + o.key)
  const keyWidth = Math.max(0, ...keys.map(k => k.length))
  const room = columns - INDENT - chipWidth(''.padEnd(keyWidth)) - GAP
  const widest = Math.max(0, ...q.options.map(o => o.text.length))
  const hasEffect = q.options.some(o => o.effect)
  const side = hasEffect ? Math.min(widest, Math.floor(room * 0.4)) : room
  const isSide = !hasEffect || room - side - GAP >= MIN_EFFECT
  const labelWidth = isSide ? side : 0
  const lines = (o: Option): QLine[] => {
    if (!isSide) return [...wrap(o.text, room).map(label => ({ label, effect: '' })), ...wrap(o.effect ?? '', room).map(effect => ({ label: '', effect }))]
    const L = wrap(o.text, labelWidth)
    const E = wrap(o.effect ?? '', room - labelWidth - GAP)
    return Array.from({ length: Math.max(L.length, E.length) }, (_, i) => ({ label: L[i] ?? '', effect: E[i] ?? '' }))
  }
  const rows = q.options.map((o, i) => ({ key: `answer-${o.key}`, chip: keys[i]!.padStart(keyWidth), lines: lines(o), option: o }))
  return { labelWidth, rows: [...rows, { key: 'reply', chip: REPLY, lines: [] }] }
}

// Keeps the text's own line breaks and indents (a briefing with lists), wrapping each line in the room left.
export function block(text: string, columns: number): string[] {
  return text.split('\n').flatMap(line => {
    const indent = /^\s*/.exec(line)![0]
    return line.trim() ? wrap(line, columns - indent.length).map(l => indent + l) : ['']
  })
}

// A "# Title" or an all-caps line ("WHAT CHANGES") is a heading: drawn bold, marks dropped.
export function heading(line: string): string | undefined {
  const t = line.trim()
  if (t.startsWith('#')) return t.replace(/^#+\s*/, '')
  return /[A-Z]{2}/.test(t) && t === t.toUpperCase() && !/^[-*\d]/.test(t) ? t : undefined
}

export function drawQuestion(
  els: Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>,
  q: OpenQuestion,
  open: number,
  columns: number,
  showContext: boolean,
  onAnswer: (o: Option) => void,
  onReply: () => void,
) {
  const { Box, Text, Button } = els
  const head = questionHeader(q, open, columns)
  const { labelWidth, rows } = questionRows(q, columns)
  const press = (r: QRow) => () => (r.option ? onAnswer(r.option) : onReply())
  const tone = (r: QRow) => (r.option && r.option.key === q.recommended ? 'accent' : 'neutral')
  const brief = (key: string, text: string) => (
    <Box key={key} paddingLeft={INDENT} flexDirection="column">
      {block(text, columns - INDENT).map((l, i) => {
        const head = heading(l)
        return (
          <Text key={`${key}-${i}`} bold={head !== undefined} color="text">
            {head ?? (l || ' ')}
          </Text>
        )
      })}
    </Box>
  )
  const button = (r: QRow) => (
    <Button key={r.key} plain onPress={press(r)}>
      {chip(Text, r.chip, tone(r), r.key)}
    </Button>
  )
  return (
    <Box flexDirection="column">
      <Box width={columns}>
        {chip(Text, head.id, 'warning')}
        <Text> </Text>
        <Box flexDirection="column" flexGrow={1}>
          {head.lines.map((l, i) => (
            <Text key={`ask-${i}`} bold color="text">
              {l}
            </Text>
          ))}
        </Box>
        {head.count && <Text dimColor>{'  ' + head.count}</Text>}
      </Box>
      {rows.map(r => (
        <Box key={`row-${r.key}`} gap={GAP} paddingLeft={INDENT}>
          {button(r)}
          <Box flexDirection="column">
            {r.lines.map((l, i) => (
              <Button key={`${r.key}-${i}`} plain onPress={press(r)}>
                <Text bold hover={{ scope: r.key, color: 'claude' }}>
                  {l.effect ? l.label.padEnd(labelWidth) : l.label}
                </Text>
                <Text hover={{ scope: r.key, color: 'claude' }}>{(labelWidth && l.effect ? ' ' : '') + l.effect}</Text>
              </Button>
            ))}
          </Box>
        </Box>
      ))}
      {q.why && brief('why', '★ ' + q.why)}
      {showContext && q.context && <Box marginTop={1}>{brief('ctx', q.context)}</Box>}
    </Box>
  )
}
