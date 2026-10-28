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

// id: the warning chip's text; lines: the full question, wrapped beside the chip, the count and ✕.
export function questionHeader(q: OpenQuestion, open: number, columns: number, close = false): { id: string; lines: string[]; count?: string } {
  const id = `? ${q.id}`
  const count = open > 1 ? `1 of ${open}` : undefined
  const room = columns - chipWidth(id) - 1 - (count ? count.length + 2 : 0) - (close ? chipWidth('✕') : 0)
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

type AskInput = { question: string; header: string; options: { label: string; description?: string; preview?: string }[] }
const RECOMMENDED = / \(Recommended\)$/

// A question Claude opened as a dialog, drawn as a band question: keys 1, 2, …; the star replaces
// "(Recommended)"; the first option's preview is the briefing. labels: what a press answers.
export function fromAsk(a: AskInput): Asked {
  const options = a.options.map((o, i) => {
    const label = o.label.replace(RECOMMENDED, '')
    return { key: String(i + 1), text: label, ...(o.description && { effect: o.description }) }
  })
  const q: OpenQuestion = { id: a.header, asks: a.question, options }
  const rec = a.options.findIndex(o => RECOMMENDED.test(o.label))
  if (rec >= 0) q.recommended = String(rec + 1)
  const preview = a.options.find(o => o.preview)?.preview
  if (preview) q.context = preview.replace(/\*\*|`/g, '')
  return { q, labels: a.options.map(o => o.label) }
}

export type Asked = { q: OpenQuestion; labels: string[] }

// flykit's own ask tool: what Claude sends, checked here because a mod tool's schema is advice only.
export const ASK_TOOL = {
  name: 'ask',
  description:
    'Ask the user one decision question. It shows in full in the flykit band above the prompt: options with their effects, your recommendation and why, and short context. ' +
    'Prefer it over AskUserQuestion. After calling it, end your turn: the answer arrives as the user\'s next message. Never call it from a subagent.',
  isDeferred: false,
  inputSchema: {
    type: 'object',
    required: ['topic', 'question', 'options'],
    properties: {
      topic: { type: 'string', maxLength: 12, description: 'One or two words for the chip, e.g. "Push".' },
      question: { type: 'string', description: 'The decision in one plain sentence, ending in "?".' },
      options: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        description: 'As many as the decision really has, 2 to 6. Recommended one first.',
        items: {
          type: 'object',
          required: ['label', 'effect'],
          properties: {
            label: { type: 'string', description: '1 to 5 words.' },
            effect: { type: 'string', description: 'What happens for the user if picked: one short sentence.' },
            recommended: { type: 'boolean' },
          },
        },
      },
      because: { type: 'string', description: 'Why the recommended option: one sentence.' },
      context: { type: 'string', description: 'What is stuck and why it matters: a few short lines. Line breaks, "- " lists and "# " headings are kept.' },
    },
  },
} as const

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// The tool's input as a band question, or why it is refused.
export function fromTool(input: Record<string, unknown>): Asked | string {
  const options = Array.isArray(input.options) ? (input.options as Record<string, unknown>[]) : []
  if (!str(input.question)) return 'question is empty'
  if (options.length < 2 || options.length > 6) return 'give 2 to 6 options'
  if (options.some(o => !str(o?.label))) return 'every option needs a label'
  const q: OpenQuestion = {
    id: str(input.topic).slice(0, 12) || 'Question',
    asks: str(input.question),
    options: options.map((o, i) => ({ key: String(i + 1), text: str(o.label), ...(str(o.effect) && { effect: str(o.effect) }) })),
  }
  const rec = options.findIndex(o => o.recommended === true)
  if (rec >= 0) {
    q.recommended = String(rec + 1)
    if (str(input.because)) q.why = `${rec + 1} because: ${str(input.because)}`
  }
  if (str(input.context)) q.context = str(input.context)
  return { q, labels: options.map(o => str(o.label)) }
}

export function drawQuestion(
  els: Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>,
  q: OpenQuestion,
  open: number,
  columns: number,
  showContext: boolean,
  onAnswer: (o: Option) => void,
  onReply: () => void,
  onClose?: () => void,
) {
  const { Box, Text, Button } = els
  const head = questionHeader(q, open, columns, !!onClose)
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
        {onClose && (
          <Button key="close" plain onPress={onClose}>
            {chip(Text, '✕', 'neutral', 'close')}
          </Button>
        )}
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
