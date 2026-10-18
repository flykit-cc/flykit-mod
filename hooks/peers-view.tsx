import type { Elements, RenderSurface } from 'claude-code'

import { cut, LABEL } from './cockpit-view'
import type { Peer } from './peers'

// No hotkey on these Buttons: a bare digit typed into an empty prompt would press them.
export type PeerRow = { key: string; dot: string; color?: string; text: string } // text = everything after the dot, already cut

const MAX_NAME = 16
const STATUS = 5
const GAP = '  '
const DOT = 2 // dot + space
const NEW = '＋ new session'

const DOTS: Record<string, { dot: string; color?: string }> = {
  busy: { dot: '●', color: 'green' },
  done: { dot: '○', color: 'yellow' },
  idle: { dot: '○' },
}

export function peerRows(peers: Peer[], columns: number): PeerRow[] {
  const width = Math.min(MAX_NAME, Math.max(0, ...peers.map(p => p.name.length)))
  return peers.map(p => {
    const tail = p.goal ? `goal: ${p.goal}` : p.project
    const text = [cut(p.name, width).padEnd(width), p.status.padEnd(STATUS), tail].join(GAP)
    return { key: `peer-${p.name}`, ...(DOTS[p.status] ?? { dot: '◌' }), text: cut(text, columns - DOT) }
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
          <Text dimColor>{(i === 0 ? 'peers' : '').padEnd(LABEL)}</Text>
          <Button key={r.key} plain onPress={() => onPeer(peers[i]!)}>
            <Text color={r.color} dimColor={!r.color}>{r.dot + ' '}</Text>
            <Text dimColor={peers[i]!.status !== 'busy'}>{r.text}</Text>
          </Button>
        </Box>
      ))}
      <Box>
        <Text dimColor>{(rows.length === 0 ? 'peers' : '').padEnd(LABEL)}</Text>
        <Button key="new-session" plain onPress={onNew}>
          {cut(NEW, columns - LABEL - 1) /* ＋ is two columns wide */}
        </Button>
      </Box>
    </Box>
  )
}
