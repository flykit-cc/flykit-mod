import type { Elements, RenderSurface } from 'claude-code'

import type { OpenQuestion, Option } from './cockpit'
import { chip, chipWidth, cut, GAP, PAD } from './style'

// No hotkey: a bare digit typed into an empty prompt would press it. Click, or ctrl+x tab then Enter.
export type QButton = { key: string; label: string; option?: Option } // option undefined = the reply button

const INDENT = 2
const MIN_PER = 12
const REPLY = '✎ reply'
const STAR = ' ★'

// id: the warning chip's text; text: the question, cut so chip, space, text and the count fit.
export function questionHeader(q: OpenQuestion, open: number, columns: number): { id: string; text: string; count?: string } {
  const id = `? ${q.id}`
  const room = columns - chipWidth(id) - 1
  if (open <= 1) return { id, text: cut(q.asks, room) }
  const count = `1 of ${open}`
  return { id, text: cut(q.asks, room - count.length - 2), count }
}

// Each option is a chip: its label plus padding, one column from the next.
export function questionButtons(q: OpenQuestion, columns: number): QButton[][] {
  const options = q.options
  const room = columns - INDENT
  const per = Math.floor((room - chipWidth(REPLY) - (PAD + GAP) * options.length) / options.length)
  const oneRow = options.length === 0 || per >= MIN_PER
  const max = oneRow ? per : room - PAD
  const buttons: QButton[] = options.map(o => {
    const star = o.key === q.recommended ? STAR : ''
    return { key: `answer-${o.key}`, label: cut(`${o.key} ${o.text}`, max - star.length) + star, option: o }
  })
  buttons.push({ key: 'reply', label: cut(REPLY, room - PAD) })
  return oneRow ? [buttons] : buttons.map(b => [b])
}

export function contextLines(context: string, columns: number): string[] {
  const w = columns - INDENT
  const lines: string[] = []
  let rest = context.trim()
  while (rest && lines.length < 3) {
    if (rest.length <= w) {
      lines.push(rest)
      rest = ''
      break
    }
    const space = rest.slice(0, w + 1).lastIndexOf(' ')
    const end = space > 0 ? space : w
    lines.push(rest.slice(0, end))
    rest = rest.slice(end).trimStart()
  }
  if (rest) lines[2] = cut(lines[2]! + '…', w)
  return lines
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
  return (
    <Box flexDirection="column">
      <Box width={columns} justifyContent="space-between">
        <Box>
          {chip(Text, head.id, 'warning')}
          <Text bold color="text">
            {' ' + head.text}
          </Text>
        </Box>
        {head.count && <Text dimColor>{head.count}</Text>}
      </Box>
      {showContext &&
        q.context &&
        contextLines(q.context, columns).map((l, i) => (
          <Box key={`ctx-${i}`} paddingLeft={INDENT}>
            <Text dimColor>{l}</Text>
          </Box>
        ))}
      {questionButtons(q, columns).map((row, i) => (
        <Box key={`row-${i}`} gap={GAP} paddingLeft={INDENT}>
          {row.map(b => (
            <Button key={b.key} plain onPress={() => (b.option ? onAnswer(b.option) : onReply())}>
              {chip(Text, b.label, b.option && b.option.key === q.recommended ? 'accent' : 'neutral', b.key)}
            </Button>
          ))}
        </Box>
      ))}
    </Box>
  )
}
