import type { Peer } from './peers'

export type Progress = { goal?: string; open: string[]; done: number }
export type Option = { key: string; text: string }
export type OpenQuestion = { id: string; asks: string; context?: string; options: Option[]; recommended?: string; why?: string }
export type Questions = { open: number; top?: OpenQuestion } | 'broken'
export type Git = { branch: string; changed: number; ahead: number }
export type Agent = { type: string; description: string }
export type Cockpit = { progress?: Progress; questions?: Questions; git?: Git; agents: Agent[]; peers: Peer[] }

// .flow/session-progress.md: goal = first line under "## Goal"; tasks = checkboxes under any "## …tasks" heading.
// The band is plain text, so markdown marks would show as literal ** and backticks.
const plain = (s: string) => s.replace(/\*\*|__|`/g, '').trim()

export function parseProgress(text: string): Progress {
  let section = ''
  let goal: string | undefined
  const open: string[] = []
  let done = 0
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line)
    if (heading) {
      section = heading[1]!.trim()
      continue
    }
    if (section === 'Goal' && goal === undefined && line.trim()) goal = plain(line)
    if (!/tasks/i.test(section)) continue
    const task = /^\s*- \[([ xX])\] (.+)$/.exec(line)
    if (!task) continue
    if (task[1] === ' ') open.push(plain(task[2]!))
    else done++
  }
  return { goal, open, done }
}

// Same rule as flow's questions-helpers.sh validate: any unknown unindented line breaks the file.
const KEY = /^(status|issue|asks|context|options|recommendation|answer|applied|retired-because):( |$)/
const STATUS = /^(open|backlog|answered|assumed|retired)\s*$/

const HEADER = /^## (Q\d+)\s*$/

type Block = { id: string; status: string; fields: Record<string, string> }

export function parseQuestions(text: string): Questions {
  let open = 0
  let top: OpenQuestion | undefined
  // Lines before any header still count, as flow's `grep -c '^status: open'` does.
  let block: Block = { id: '', status: '', fields: {} }
  let field: string | undefined
  const endBlock = () => {
    if (block.status !== 'open') return
    open++
    // A stray status before the first header counts (flow's grep does) but has no id to show or answer.
    if (!top && block.id) top = toQuestion(block)
  }
  for (const line of text.split('\n')) {
    if (line === '') continue
    if (line.startsWith('  ')) {
      if (field) block.fields[field] += ' ' + line.trim()
      continue
    }
    const header = HEADER.exec(line)
    if (header) {
      endBlock()
      block = { id: header[1]!, status: '', fields: {} }
      field = undefined
      continue
    }
    const key = KEY.exec(line)
    if (!key) return 'broken'
    // Flow checks the raw tail after "status: " (so "status:  open" is broken) and skips a bare "status:".
    if (line.startsWith('status: ')) {
      const value = line.slice('status: '.length)
      if (!STATUS.test(value)) return 'broken'
      block.status = value.trimEnd()
    }
    field = key[1]!
    block.fields[field] = line.slice(field.length + 1).trim()
  }
  endBlock()
  return { open, top }
}

function toQuestion(b: Block): OpenQuestion {
  const options = (b.fields.options ?? '')
    .split(/;\s*(?=[A-Z]: )/)
    .map(part => /^([A-Z]): (.*)$/.exec(part.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ key: m[1]!, text: m[2]!.replace(/;\s*$/, '').trim() }))
  const rec = /^([A-Z])(?=[,:\s]|$)/.exec(b.fields.recommendation ?? '')?.[1]
  const q: OpenQuestion = { id: b.id, asks: b.fields.asks ?? '', options }
  if (b.fields.context) q.context = b.fields.context
  if (rec && options.some(o => o.key === rec)) q.recommended = rec
  if (b.fields.recommendation) q.why = b.fields.recommendation
  return q
}

// Marks block `id` answered with a one-line `answer:`; undefined when the block is gone or not open.
export function answerQuestion(text: string, id: string, answer: string): string | undefined {
  const lines = text.split('\n')
  const start = lines.findIndex(l => HEADER.exec(l)?.[1] === id)
  if (start < 0) return undefined
  let end = lines.findIndex((l, i) => i > start && HEADER.test(l))
  if (end < 0) end = lines.length
  const inBlock = (i: number) => i > start && i < end
  // The last status line wins, as in parseQuestions and flow's counts.
  const statusAt = lines.findLastIndex((l, i) => inBlock(i) && l.startsWith('status: '))
  if (statusAt < 0 || lines[statusAt]!.slice('status: '.length).trimEnd() !== 'open') return undefined
  lines[statusAt] = 'status: answered'
  const row = `answer: ${answer.replace(/\s+/g, ' ').trim()}`
  const answerAt = lines.findIndex((l, i) => inBlock(i) && /^answer:( |$)/.test(l))
  if (answerAt >= 0) {
    let stop = answerAt + 1
    while (stop < end && lines[stop]!.startsWith('  ')) stop++
    lines.splice(answerAt, stop - answerAt, row)
  } else {
    let at = end
    while (at > start + 1 && lines[at - 1] === '') at--
    lines.splice(at, 0, row)
  }
  return lines.join('\n')
}

// `git status --porcelain=v1 --branch`: first line "## <branch>[...<upstream>] [ahead N, behind M]".
export function parseGitStatus(stdout: string): Git {
  const lines = stdout.split('\n').filter(Boolean)
  const head = lines[0]?.startsWith('## ') ? lines.shift()!.slice(3) : ''
  const NEW = 'No commits yet on '
  const branch = head.startsWith(NEW) ? head.slice(NEW.length) : head.split('...')[0]!.split(' ')[0]!
  const ahead = Number(/\[ahead (\d+)/.exec(head)?.[1] ?? 0)
  return { branch, changed: lines.length, ahead }
}
