export type Progress = { goal?: string; open: string[]; done: number }
export type Questions = { open: number; top?: string } | 'broken'
export type Git = { branch: string; changed: number; ahead: number }
export type Agent = { type: string; description: string }
export type Cockpit = { progress?: Progress; questions?: Questions; git?: Git; agents: Agent[] }

// .flow/session-progress.md: goal = first line under "## Goal"; tasks = checkboxes under any "## …tasks" heading.
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
    if (section === 'Goal' && goal === undefined && line.trim()) goal = line.trim()
    if (!/tasks/i.test(section)) continue
    const task = /^\s*- \[([ xX])\] (.+)$/.exec(line)
    if (!task) continue
    if (task[1] === ' ') open.push(task[2]!.trim())
    else done++
  }
  return { goal, open, done }
}

// Same rule as flow's questions-helpers.sh validate: any unknown unindented line breaks the file.
const KEY = /^(status|issue|asks|context|options|recommendation|answer|applied|retired-because):( |$)/
const STATUS = /^(open|backlog|answered|assumed|retired)\s*$/

export function parseQuestions(text: string): Questions {
  let open = 0
  let top: string | undefined
  let status = ''
  let asks: string | undefined
  const endBlock = () => {
    if (status !== 'open') return
    open++
    if (top === undefined) top = asks
  }
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('  ')) continue
    if (/^## Q\d+\s*$/.test(line)) {
      endBlock()
      status = ''
      asks = undefined
      continue
    }
    if (!KEY.test(line)) return 'broken'
    // Flow checks the raw tail after "status: " (so "status:  open" is broken) and skips a bare "status:".
    if (line.startsWith('status: ')) {
      const value = line.slice('status: '.length)
      if (!STATUS.test(value)) return 'broken'
      status = value.trimEnd()
    }
    if (line.startsWith('asks:')) asks = line.slice('asks:'.length).trim()
  }
  endBlock()
  return { open, top }
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
