import type { Elements, RenderSurface } from 'claude-code'

import type { Peer } from './peers'
import { chip, chipWidth, cut, LABEL, label, PAD, type Tone } from './style'

// No hotkey on these Buttons: a bare digit typed into an empty prompt would press them.
// name: cut and padded; status: padded to one chip width; tail: the goal or project, cut ('' when no room).
// status: unpadded, so the chip reads " busy "; the row pads after the chip to line the tails up.
export type PeerRow = { key: string; name: string; status: string; tone: Tone; tail: string }

const MAX_NAME = 16
const STATUS = 5
const CHIP = STATUS + PAD
const TAIL_GAP = '  '
const NEW = '＋ new session'

const TONES: Record<string, Tone> = { busy: 'success', done: 'warning' }

// name, space, status chip padded to CHIP, then the tail after two spaces
export const rowWidth = (r: PeerRow) => r.name.length + 1 + Math.max(CHIP, chipWidth(r.status)) + (r.tail ? TAIL_GAP.length + r.tail.length : 0)

export function peerRows(peers: Peer[], columns: number): PeerRow[] {
  const width = Math.max(1, Math.min(MAX_NAME, columns - 1 - CHIP, Math.max(0, ...peers.map(p => p.name.length))))
  const room = columns - width - 1 - CHIP - TAIL_GAP.length
  return peers.map((p, i) => {
    const tail = p.goal ? `goal: ${p.goal}` : p.project
    // Duplicate names need distinct keys; the first keeps `peer-<name>`.
    const key = peers.findIndex(q => q.name === p.name) === i ? `peer-${p.name}` : `peer-${p.name}-${i}`
    return {
      key,
      name: cut(p.name, width).padEnd(width),
      status: cut(p.status, STATUS),
      tone: TONES[p.status] ?? 'neutral',
      tail: room > 0 ? cut(tail, room) : '',
    }
  })
}

export function drawPeers(
  els: Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>,
  peers: Peer[],
  columns: number,
  onPeer: (p: Peer) => void,
  onNew: () => void,
) {
  const { Box, Text, Button } = els
  const rows = peerRows(peers, columns - LABEL)
  return (
    <Box flexDirection="column">
      {rows.map((r, i) => (
        <Box key={`peer-row-${i}`}>
          {label(Text, i === 0 ? 'peers' : '')}
          <Button key={r.key} plain onPress={() => onPeer(peers[i]!)}>
            {/* The scope holds no name: a hover scope past 64 characters refuses the whole band. */}
            <Text bold color="text" hover={{ scope: `peer-row-${i}`, color: 'claude' }}>
              {r.name + ' '}
            </Text>
            {chip(Text, r.status, r.tone, `peer-row-${i}`)}
            <Text dimColor hover={{ scope: `peer-row-${i}`, dimColor: false }}>
              {' '.repeat(STATUS - r.status.length) + (r.tail ? TAIL_GAP + r.tail : '')}
            </Text>
          </Button>
        </Box>
      ))}
      <Box>
        {label(Text, rows.length === 0 ? 'peers' : '')}
        <Button key="new-session" plain onPress={onNew}>
          {chip(Text, cut(NEW, columns - LABEL - PAD - 1 /* ＋ is two columns wide */), 'neutral', 'new-session')}
        </Button>
      </Box>
    </Box>
  )
}
