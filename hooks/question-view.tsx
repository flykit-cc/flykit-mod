import type { Elements, RenderSurface } from 'claude-code'

import type { OpenQuestion, Option } from './cockpit'
import { chip, chipsWidth, chipWidth, GAP, wrap } from './style'

// No hotkey: a bare digit typed into an empty prompt would press it. Click, or ctrl+x tab then Enter.
// Nothing is cut: a long question, option or recommendation wraps onto more rows.
export type QRow = { key: string; chip: string; lines: string[]; option?: Option } // option undefined = the reply button

const INDENT = 2
const REPLY = '✎ reply'
const STAR = ' ★'

// id: the warning chip's text; lines: the full question, wrapped beside the chip and the count.
export function questionHeader(q: OpenQuestion, open: number, columns: number): { id: string; lines: string[]; count?: string } {
  const id = `? ${q.id}`
  const count = open > 1 ? `1 of ${open}` : undefined
  const room = columns - chipWidth(id) - 1 - (count ? count.length + 2 : 0)
  return { id, lines: wrap(q.asks, room), ...(count && { count }) }
}

// Short options: one row of chips, each holding its full text. Longer: one option per row,
// a key chip then its text wrapped beside it. The reply chip comes last either way.
export function questionRows(q: OpenQuestion, columns: number): { inline: boolean; rows: QRow[] } {
  const star = (o: Option) => (o.key === q.recommended ? STAR : '')
  const reply: QRow = { key: 'reply', chip: REPLY, lines: [] }
  const full = q.options.map(o => `${o.key} ${o.text}${star(o)}`)
  if (INDENT + chipsWidth([...full, REPLY]) <= columns)
    return { inline: true, rows: [...q.options.map((o, i) => ({ key: `answer-${o.key}`, chip: full[i]!, lines: [], option: o })), reply] }
  const keys = q.options.map(o => o.key + star(o))
  const keyWidth = Math.max(...keys.map(k => k.length))
  const room = columns - INDENT - chipWidth(''.padEnd(keyWidth)) - GAP
  const rows = q.options.map((o, i) => ({ key: `answer-${o.key}`, chip: keys[i]!.padEnd(keyWidth), lines: wrap(o.text, room), option: o }))
  return { inline: false, rows: [...rows, reply] }
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
  const { inline, rows } = questionRows(q, columns)
  const press = (r: QRow) => () => (r.option ? onAnswer(r.option) : onReply())
  const tone = (r: QRow) => (r.option && r.option.key === q.recommended ? 'accent' : 'neutral')
  const dim = (key: string, text: string) => (
    <Box key={key} paddingLeft={INDENT} flexDirection="column">
      {wrap(text, columns - INDENT).map((l, i) => (
        <Text key={`${key}-${i}`} dimColor>
          {l}
        </Text>
      ))}
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
      {showContext && q.context && dim('ctx', q.context)}
      {inline ? (
        <Box gap={GAP} paddingLeft={INDENT}>
          {rows.map(button)}
        </Box>
      ) : (
        rows.map(r => (
          <Box key={`row-${r.key}`} gap={GAP} paddingLeft={INDENT}>
            {button(r)}
            <Box flexDirection="column">
              {r.lines.map((l, i) => (
                <Button key={`${r.key}-${i}`} plain onPress={press(r)}>
                  <Text hover={{ scope: r.key, color: 'claude' }}>{l}</Text>
                </Button>
              ))}
            </Box>
          </Box>
        ))
      )}
      {q.why && dim('why', '★ ' + q.why)}
    </Box>
  )
}
