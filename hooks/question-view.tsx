import type { Elements, RenderSurface } from 'claude-code'

import type { OpenQuestion, Option } from './cockpit'
import { cut } from './cockpit-view'

// No hotkey: a bare digit typed into an empty prompt would press it. Click, or ctrl+x tab then Enter.
export type QButton = { key: string; label: string; option?: Option } // option undefined = the reply button

const INDENT = 2
const GAP = 3
const MIN_PER = 12
const REPLY = '✎ reply'
const STAR = ' ★'

export function questionHeader(q: OpenQuestion, open: number, columns: number): { text: string; count?: string } {
  const text = `? ${q.id} ${q.asks}`
  if (open <= 1) return { text: cut(text, columns) }
  const count = `1 of ${open}`
  return { text: cut(text, columns - count.length - 2), count }
}

export function questionButtons(q: OpenQuestion, columns: number): QButton[][] {
  const options = q.options
  const room = columns - INDENT
  const per = Math.floor((room - REPLY.length - GAP * options.length) / options.length)
  const oneRow = options.length === 0 || per >= MIN_PER
  const max = oneRow ? per : room
  const buttons: QButton[] = options.map(o => {
    const star = o.key === q.recommended ? STAR : ''
    return { key: `answer-${o.key}`, label: cut(`${o.key} ${o.text}`, max - star.length) + star, option: o }
  })
  buttons.push({ key: 'reply', label: cut(REPLY, room) })
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
        <Text color="yellow">{head.text}</Text>
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
              {b.label}
            </Button>
          ))}
        </Box>
      ))}
    </Box>
  )
}
