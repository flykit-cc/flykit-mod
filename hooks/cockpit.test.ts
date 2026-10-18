import { describe, expect, test } from 'claude-code/testing'

import { parseGitStatus, parseProgress, parseQuestions } from './cockpit'

describe('parseProgress', () => {
  test('reads goal and tasks under "## Open tasks" (this repo shape)', () => {
    const text = [
      '# Session progress',
      '',
      '## Goal',
      '',
      'Build the flykit Claude Code mod in 4 parts:',
      '1. Usage meter',
      '',
      '## Open tasks',
      '',
      '- [x] Part 1: usage meter',
      '- [ ] Kaio confirms the band look',
      '- [ ] Part 2: flow cockpit',
      '',
      '## Next steps',
      '- [ ] not a task, wrong section',
    ].join('\n')
    const p = parseProgress(text)
    expect(p.goal).toBe('Build the flykit Claude Code mod in 4 parts:')
    expect(p.open).toEqual(['Kaio confirms the band look', 'Part 2: flow cockpit'])
    expect(p.done).toBe(1)
  })

  test('reads "## Tasks" too, and no goal heading gives no goal', () => {
    const p = parseProgress('## Tasks\n- [ ] one\n- [X] two\n')
    expect(p.goal).toBeUndefined()
    expect(p.open).toEqual(['one'])
    expect(p.done).toBe(1)
  })
})

describe('parseQuestions', () => {
  test('counts open blocks and takes the first open asks', () => {
    const text = [
      '## Q1',
      'status: answered',
      'asks: old one',
      'answer: yes',
      '',
      '## Q2',
      'status: open',
      'issue: -',
      'asks: Which key opens the cockpit?',
      'context: first line',
      '  second line, indented',
      '',
      '## Q3',
      'status: open',
      'asks: Second open one',
    ].join('\n')
    expect(parseQuestions(text)).toEqual({ open: 2, top: 'Which key opens the cockpit?' })
  })

  test('empty file has nothing open', () => {
    expect(parseQuestions('')).toEqual({ open: 0, top: undefined })
  })

  test('free text line is broken', () => {
    expect(parseQuestions('## Q1\nstatus: open\nhello there\n')).toBe('broken')
  })

  test('bad status is broken', () => {
    expect(parseQuestions('## Q1\nstatus: pending\n')).toBe('broken')
  })

  test('extra space before status is broken, as in flow', () => {
    expect(parseQuestions('## Q1\nstatus:  open\n')).toBe('broken')
  })

  test('bare status line is valid but not open, as in flow', () => {
    expect(parseQuestions('## Q1\nstatus:\nasks: x\n')).toEqual({ open: 0, top: undefined })
  })
})

describe('parseGitStatus', () => {
  test('branch, changed files, ahead', () => {
    expect(parseGitStatus('## main...origin/main [ahead 3, behind 1]\n M hooks/a.ts\n?? hooks/b.ts\n')).toEqual({ branch: 'main', changed: 2, ahead: 3 })
  })

  test('no upstream, clean', () => {
    expect(parseGitStatus('## feature-x\n')).toEqual({ branch: 'feature-x', changed: 0, ahead: 0 })
  })

  test('new repo with no commits', () => {
    expect(parseGitStatus('## No commits yet on main\n')).toEqual({ branch: 'main', changed: 0, ahead: 0 })
  })

  test('detached head', () => {
    expect(parseGitStatus('## HEAD (no branch)\n')).toEqual({ branch: 'HEAD', changed: 0, ahead: 0 })
  })
})
