// Pure helpers for the other Claude Code sessions on this Mac. No engine calls here.

import type { Tone } from './style'

// One registry file, trimmed to the fields we use.
export type SessionEntry = { id: string; name: string; pid: number; cwd: string; status: string }
// status: 'busy' | 'done' | 'idle' | whatever the registry says
export type Peer = { id: string; name: string; project: string; status: string; goal?: string }
// Last seen status per session id, and when it stopped being busy.
export type PeerMemory = Record<string, { status: string; doneAt?: number }>

export const DONE_MS = 5 * 60_000

export function parseSession(text: string): SessionEntry | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== 'object') return undefined
  const { sessionId, name, pid, cwd, status } = raw as Record<string, unknown>
  // A bad pid would make the one `ps -p` call fail and hide every peer.
  // A blank name would make `@ text` route to it.
  if (typeof sessionId !== 'string' || typeof name !== 'string' || !name.trim() || typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return undefined
  return {
    id: sessionId,
    name,
    pid,
    cwd: typeof cwd === 'string' ? cwd : '',
    status: typeof status === 'string' ? status : 'idle',
  }
}

// `ps -o pid=,comm=` lines. Only claude processes count: a crashed session's pid may now run something else.
export const livePids = (psStdout: string): Set<number> =>
  new Set(
    psStdout
      .split('\n')
      .map(l => /^\s*(\d+)\s+(.+?)\s*$/.exec(l))
      .filter(m => m !== null && m[2]!.split('/').pop() === 'claude')
      .map(m => Number(m![1])),
  )

export const projectOf = (cwd: string): string => cwd.split('/').filter(Boolean).pop() ?? '?'

export function track(
  entries: SessionEntry[],
  memory: PeerMemory,
  now: number,
): { statuses: Record<string, string>; memory: PeerMemory } {
  const statuses: Record<string, string> = {}
  const next: PeerMemory = {}
  for (const e of entries) {
    const prev = memory[e.id]
    const busy = e.status === 'busy'
    const doneAt = busy ? undefined : prev?.status === 'busy' ? now : prev?.doneAt
    next[e.id] = doneAt === undefined ? { status: e.status } : { status: e.status, doneAt }
    statuses[e.id] = busy ? 'busy' : doneAt !== undefined && now - doneAt < DONE_MS ? 'done' : e.status
  }
  return { statuses, memory: next }
}

// The summary's peer chips: count and busy (green while any is busy), then one warning chip per finished peer.
export function peerSegments(peers: Peer[]): { text: string; tone?: Tone }[] {
  if (peers.length === 0) return []
  const busy = peers.filter(p => p.status === 'busy').length
  const done = peers.filter(p => p.status === 'done')
  const head = busy ? { text: `⧉ ${peers.length} · ${busy} busy`, tone: 'success' as const } : { text: `⧉ ${peers.length}` }
  return [head, ...done.map(p => ({ text: `${p.project} done`, tone: 'warning' as const }))]
}
