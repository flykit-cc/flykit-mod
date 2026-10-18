import type { EngineInterface, Register } from 'claude-code'

import { answerQuestion, parseGitStatus, parseProgress, parseQuestions, type Cockpit, type Option } from './cockpit'
import { drawCockpit } from './cockpit-view'
import { drawQuestion } from './question-view'
import { drawMeter, type FiveHourRow, type MeterView, type WeekRow } from './meter'
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

// No .flow files → undefined: the band shows the meter alone.
async function readCockpit($: EngineInterface): Promise<Cockpit | undefined> {
  const [progress, questions] = await Promise.all([readText($, '.flow/session-progress.md'), readText($, QUESTIONS)])
  if (progress === undefined && questions === undefined) return undefined
  // --no-optional-locks: never take .git/index.lock, so a user's git add/commit can't collide with this poll.
  const [git, agents] = await Promise.all([
    $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v1', '--branch'], { timeoutMs: 3000 }).then(
      r => (r.exitCode === 0 ? parseGitStatus(r.stdout) : undefined),
      () => undefined,
    ),
    $.agent.list().then(
      list => list.filter(a => ACTIVE.has(a.status)).map(a => ({ type: a.type, description: a.description })),
      () => [],
    ),
  ])
  return {
    progress: progress === undefined ? undefined : parseProgress(progress),
    questions: questions === undefined ? undefined : parseQuestions(questions),
    git,
    agents,
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
        {cockpit && drawCockpit(els, cockpit, columns, isCockpitOpen, toggle)}
        {top && drawQuestion(els, top, qs!.open, columns, isCockpitOpen, o => void answer($, top.id, o), () => void reply($, top.id))}
        {drawMeter(els, view, columns)}
      </Box>
    )
  })
}
