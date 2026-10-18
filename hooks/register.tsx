import type { EngineInterface, Register } from 'claude-code'

import { answerQuestion, parseGitStatus, parseProgress, parseQuestions, type Cockpit, type Option } from './cockpit'
import { drawCockpit } from './cockpit-view'
import { drawQuestion } from './question-view'
import { drawMeter, type FiveHourRow, type MeterView, type WeekRow } from './meter'
import { livePids, parseSession, projectOf, track, type Peer, type PeerMemory, type SessionEntry } from './peers'
import { parseModelCache, rollDay, weekMeter, type DayState } from './usage'

const CACHE = '/.config/ghostcode/.slcache/usage.json'
const PAD = 2 // matches the status line indent
const ACTIVE = new Set(['pending', 'running', 'waiting'])
const QUESTIONS = '.flow/questions.md'

// Last computed views; the band draws them.
let view: MeterView = { kind: 'waiting' }
let cockpit: Cockpit | undefined
// /flykit hides or shows the band; pressing the cockpit line opens or closes its detail.
let isHidden = false
let isCockpitOpen = false
let peerMemory: PeerMemory = {}

// afterReply: a reply came back, so empty rate limits mean 'no plan limits', not 'not yet'.
async function refresh($: EngineInterface, afterReply = false) {
  const now = await $.clock.now()
  const { rateLimits } = await $.session.usage()
  const week = rateLimits.find(r => r.kind === 'seven_day')
  const five = rateLimits.find(r => r.kind === 'five_hour')
  if (!week) {
    if (afterReply) view = { kind: 'no-limits' }
    $.ui.invalidate('ui.render')
    return
  }

  let weekView: WeekRow = { used: week.percentUsed }
  if (week.resetsAt) {
    const prev = (await $.store.get('day')) as DayState | undefined
    const state = rollDay(prev, week.percentUsed, now, Date.parse(week.resetsAt))
    await $.store.set('day', state)
    weekView = weekMeter(state, week.percentUsed, now)
  }

  const home = await $.env.get('HOME')
  const models = home ? await $.fs.read(home + CACHE).then(t => parseModelCache(t, now), () => []) : []
  const fiveHour: FiveHourRow | undefined = five && { used: five.percentUsed, resetInMs: five.resetsAt ? Math.max(0, Date.parse(five.resetsAt) - now) : undefined }

  view = { kind: 'ready', week: weekView, fiveHour, models }
  $.ui.invalidate('ui.render')
}

async function readText($: EngineInterface, path: string): Promise<string | undefined> {
  return $.fs.read(path).then(t => t as string, () => undefined)
}

// The other live Claude Code sessions, from the registry. Only *.json files: the folder also holds *.key secrets.
async function readPeers($: EngineInterface, now: number): Promise<Peer[]> {
  try {
    const home = await $.env.get('HOME')
    if (!home) return []
    const dir = home + '/.claude/sessions'
    const names = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith('.json')).map(f => f.name)
    const me = await $.session.id()
    const texts = await Promise.all(names.map(n => readText($, `${dir}/${n}`)))
    const entries = texts.map(t => (t === undefined ? undefined : parseSession(t))).filter((e): e is SessionEntry => e !== undefined && e.id !== me)
    if (entries.length === 0) return []
    const ps = await $.process.run(['ps', '-o', 'pid=', '-p', entries.map(e => e.pid).join(',')], { timeoutMs: 3000 })
    const live = livePids(ps.stdout)
    const alive = entries.filter(e => live.has(e.pid))
    const { statuses, memory } = track(alive, peerMemory, now)
    peerMemory = memory
    const goals = await Promise.all(alive.map(e => readText($, e.cwd + '/.flow/session-progress.md').then(t => (t === undefined ? undefined : parseProgress(t).goal))))
    return alive.map((e, i) => ({ id: e.id, name: e.name, project: projectOf(e.cwd), status: statuses[e.id]!, ...(goals[i] ? { goal: goals[i] } : {}) }))
  } catch {
    return []
  }
}

// No .flow files and no peers → undefined: the band shows the meter alone.
async function readCockpit($: EngineInterface): Promise<Cockpit | undefined> {
  const now = await $.clock.now()
  // --no-optional-locks: never take .git/index.lock, so a user's git add/commit can't collide with this poll.
  const [progress, questions, git, agents, peers] = await Promise.all([
    readText($, '.flow/session-progress.md'),
    readText($, QUESTIONS),
    $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v1', '--branch'], { timeoutMs: 3000 }).then(
      r => (r.exitCode === 0 ? parseGitStatus(r.stdout) : undefined),
      () => undefined,
    ),
    $.agent.list().then(
      list => list.filter(a => ACTIVE.has(a.status)).map(a => ({ type: a.type, description: a.description })),
      () => [],
    ),
    readPeers($, now),
  ])
  if (progress === undefined && questions === undefined && peers.length === 0) return undefined
  return {
    progress: progress === undefined ? undefined : parseProgress(progress),
    questions: questions === undefined ? undefined : parseQuestions(questions),
    git,
    agents,
    peers,
  }
}

async function refreshCockpit($: EngineInterface) {
  cockpit = await readCockpit($)
  $.ui.invalidate('ui.render')
}

// Saves the answer, then tells Claude; prompt.submit queues behind a running turn, so Claude is not stopped.
// A press on a question already answered finds it not open: nothing written or sent.
async function answer($: EngineInterface, id: string, o: Option) {
  const text = await readText($, QUESTIONS)
  const updated = text === undefined ? undefined : answerQuestion(text, id, `${o.key}: ${o.text} (flykit band)`)
  if (updated !== undefined) {
    const saved = await $.fs.write(QUESTIONS, updated).then(() => true, () => false)
    if (saved) {
      const msg = `${id} answered in the flykit band: ${o.key}: ${o.text}. Saved in .flow/questions.md (status: answered). Apply it per the flow question protocol: act on it, set applied:, promote the next backlog question.`
      // The answer is saved; a failed submit is picked up by the next turn or /flow:continue.
      await $.prompt.submit({ text: msg }).catch(() => undefined)
    }
  }
  await refreshCockpit($)
}

// Prefixes the draft with the id instead of replacing it, so nothing typed is lost.
async function reply($: EngineInterface, id: string) {
  const { text } = await $.prompt.read()
  await $.prompt.fill({ text: text.startsWith(`${id}:`) ? text : `${id}: ${text}` }).catch(() => undefined)
}

// Puts @name in front of the draft, so nothing typed is lost.
async function pickPeer($: EngineInterface, p: Peer) {
  const { text } = await $.prompt.read()
  const tag = `@${p.name} `
  await $.prompt.fill({ text: text.startsWith(tag) ? text : tag + text.trimStart() }).catch(() => undefined)
}

// Ghostty's own command starts the ghostcode picker in the new window.
async function newSession($: EngineInterface) {
  await $.process.run(['open', '-na', 'Ghostty']).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'flykit', description: 'Show or hide the flykit band' })
    await Promise.all([refresh($), refreshCockpit($)])
    $.clock.every(60_000, () => refresh($))
    $.clock.every(10_000, () => refreshCockpit($))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await Promise.all([refresh($, true), refreshCockpit($)])
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    // Likely runs before the new agent is listed; the 10 s tick is what usually shows it.
    void refreshCockpit($)
    return result
  })

  // `@<live peer name> text` typed by the user goes to that session, not to Claude.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || (e.origin && e.origin.kind !== 'composer')) return next(e)
    const m = /^@(\S+)\s+([\s\S]+)$/.exec(e.text)
    if (!m) return next(e)
    const peer = (await readPeers($, await $.clock.now())).find(p => p.name === m[1])
    if (!peer) return next(e)
    const reason = await $.session.send({ to: { sessionId: peer.id }, text: m[2]!.trim() }).then(
      r => (r.isDelivered ? undefined : r.reason),
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    )
    if (reason === undefined) return { drop: `✓ sent to ${peer.name}` }
    await $.prompt.fill({ text: e.text }).catch(() => undefined)
    return { drop: `✗ not sent to ${peer.name}: ${reason}` }
  })

  on('command.run', { command: 'flykit' }, async $ => {
    isHidden = !isHidden
    $.ui.invalidate('ui.render')
    return { text: isHidden ? 'flykit band hidden.' : 'flykit band shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (isHidden || e.props.hasSurvey) return next(e)
    const els = $.ui.resolve(e)
    const { Box } = els
    const columns = e.props.bodyColumns - 2 * PAD
    const toggle = () => {
      isCockpitOpen = !isCockpitOpen
      $.ui.invalidate('ui.render')
    }
    const qs = cockpit?.questions === 'broken' ? undefined : cockpit?.questions
    const top = qs?.top
    return (
      <Box flexDirection="column" paddingX={PAD} paddingTop={1}>
        {cockpit && drawCockpit(els, cockpit, columns, isCockpitOpen, toggle, p => void pickPeer($, p), () => void newSession($))}
        {top && drawQuestion(els, top, qs!.open, columns, isCockpitOpen, o => void answer($, top.id, o), () => void reply($, top.id))}
        {drawMeter(els, view, columns)}
      </Box>
    )
  })
}
