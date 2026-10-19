import type { Color, Elements, RenderSurface } from 'claude-code'

// The band's shared look: chips, section labels and the cut that keeps every row on one line.

export type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'suggestion' | 'accent'
type TextEl = Elements[RenderSurface]['Text']

export const LABEL = 7
export const PAD = 2 // a chip's padding: one space each side
export const GAP = 1 // between chips on a row

export const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…')
export const chipWidth = (text: string) => text.length + PAD
export const chipsWidth = (texts: string[]) => texts.reduce((n, t) => n + chipWidth(t), 0) + GAP * Math.max(0, texts.length - 1)

// subtle + text is each theme's quiet grey with its own ink; inverseText is the ink each theme
// pairs with a saturated fill (black on the dark theme's bright colors, white on the light theme's deep ones).
const TONES: Record<Tone, { bg: Color; fg: Color }> = {
  neutral: { bg: 'subtle', fg: 'text' },
  success: { bg: 'success', fg: 'inverseText' },
  warning: { bg: 'warning', fg: 'inverseText' },
  error: { bg: 'error', fg: 'inverseText' },
  suggestion: { bg: 'suggestion', fg: 'inverseText' },
  accent: { bg: 'claude', fg: 'inverseText' },
}

// scope: the hover group of the Button the chip sits in (1 to 64 characters, or the engine refuses the whole band:
// never derive it from free text). A lit chip turns accent, an accent one flips to text; unlit, it only joins the group.
export function chip(Text: TextEl, text: string, tone: Tone = 'neutral', scope?: string, key?: string, lit = true) {
  const { bg, fg } = TONES[tone]
  const hover = !scope ? undefined : !lit ? { scope } : tone === 'accent' ? { scope, backgroundColor: 'text', color: 'inverseText' } : { scope, backgroundColor: 'claude', color: 'inverseText' }
  return (
    <Text key={key} backgroundColor={bg} color={fg} bold={tone !== 'neutral'} hover={hover}>
      {' ' + text + ' '}
    </Text>
  )
}

export const label = (Text: TextEl, text: string) => (
  <Text bold color="inactive">
    {text.padEnd(LABEL)}
  </Text>
)
