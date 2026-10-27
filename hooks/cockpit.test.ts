import { describe, expect, test } from 'claude-code/testing'

import { answerQuestion, parseGitStatus, parseProgress, parseQuestions } from './cockpit'

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

  test('strips markdown marks from goal and tasks', () => {
    const p = parseProgress('## Goal\nFinish **the** `flykit` __mod__\n## Tasks\n- [ ] click `＋ new session`\n')
    expect(p.goal).toBe('Finish the flykit mod')
    expect(p.open).toEqual(['click ＋ new session'])
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
    expect(parseQuestions(text)).toEqual({
      open: 2,
      top: { id: 'Q2', asks: 'Which key opens the cockpit?', context: 'first line second line, indented', options: [] },
    })
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

  test('stray open status before the first header counts but is never the top', () => {
    expect(parseQuestions('status: open\n\n## Q1\nstatus: open\nasks: real\n')).toEqual({ open: 2, top: { id: 'Q1', asks: 'real', options: [] } })
  })

  test('bare status line is valid but not open, as in flow', () => {
    expect(parseQuestions('## Q1\nstatus:\nasks: x\n')).toEqual({ open: 0, top: undefined })
  })
})

describe('parseQuestions: full open question', () => {
  const FILE = [
    '## Q1',
    'status: answered',
    'asks: old',
    '',
    '## Q3',
    'status: open',
    'issue: -',
    'asks: Which key opens the cockpit?',
    'context: The band has a summary line.',
    '  It opens a detail view.',
    'options: A: c, short and free; B: k,',
    '  less obvious',
    'recommendation: A, nothing else uses c',
    '',
    '## Q4',
    'status: open',
    'asks: Second one',
  ].join('\n')

  test('first open block, joined continuation lines, options, recommendation', () => {
    expect(parseQuestions(FILE)).toEqual({
      open: 2,
      top: {
        id: 'Q3',
        asks: 'Which key opens the cockpit?',
        context: 'The band has a summary line. It opens a detail view.',
        options: [{ key: 'A', text: 'c, short and free' }, { key: 'B', text: 'k, less obvious' }],
        recommended: 'A',
      },
    })
  })

  test('no options, no recommendation', () => {
    expect(parseQuestions('## Q2\nstatus: open\nasks: Free text?\n')).toEqual({ open: 1, top: { id: 'Q2', asks: 'Free text?', options: [] } })
  })

  test('recommendation that names no option is ignored', () => {
    const q = parseQuestions('## Q2\nstatus: open\nasks: x\noptions: A: one; B: two\nrecommendation: none yet - needs talk\n')
    expect(q !== 'broken' && q.top?.recommended).toBeUndefined()
  })

  test('trailing semicolon is not part of the option text', () => {
    const q = parseQuestions('## Q2\nstatus: open\nasks: x\noptions: A: one; B: two;\n')
    expect(q !== 'broken' && q.top?.options).toEqual([{ key: 'A', text: 'one' }, { key: 'B', text: 'two' }])
  })
})

describe('answerQuestion', () => {
  const FILE = '## Q1\nstatus: answered\nasks: old\nanswer: yes\n\n## Q3\nstatus: open\nasks: Which key?\noptions: A: c; B: k\n\n## Q4\nstatus: open\nasks: next\n'

  test('marks the block answered and adds an answer line at its end', () => {
    expect(answerQuestion(FILE, 'Q3', 'A: c (flykit band)')).toBe(
      '## Q1\nstatus: answered\nasks: old\nanswer: yes\n\n## Q3\nstatus: answered\nasks: Which key?\noptions: A: c; B: k\nanswer: A: c (flykit band)\n\n## Q4\nstatus: open\nasks: next\n',
    )
  })

  test('replaces an existing answer and its continuation lines', () => {
    const file = '## Q3\nstatus: open\nasks: x\nanswer: draft\n  more draft\napplied:\n'
    expect(answerQuestion(file, 'Q3', 'B: k')).toBe('## Q3\nstatus: answered\nasks: x\nanswer: B: k\napplied:\n')
  })

  test('last block in a file without trailing newline', () => {
    expect(answerQuestion('## Q9\nstatus: open\nasks: x', 'Q9', 'A: y')).toBe('## Q9\nstatus: answered\nasks: x\nanswer: A: y')
  })

  test('newlines in the answer become spaces, so the file stays valid', () => {
    const out = answerQuestion('## Q9\nstatus: open\nasks: x\n', 'Q9', 'one\ntwo')!
    expect(out).toContain('answer: one two')
    expect(parseQuestions(out)).toEqual({ open: 0, top: undefined })
  })

  test('missing or not-open block gives undefined', () => {
    expect(answerQuestion(FILE, 'Q7', 'A')).toBeUndefined()
    expect(answerQuestion(FILE, 'Q1', 'A')).toBeUndefined()
  })

  test('the last status line wins, as in parseQuestions and flow', () => {
    const file = '## Q5\nstatus: backlog\nasks: x\nstatus: open\n'
    expect(answerQuestion(file, 'Q5', 'A: y')).toBe('## Q5\nstatus: backlog\nasks: x\nstatus: answered\nanswer: A: y\n')
  })

  test('Q1 header does not match Q10', () => {
    const file = '## Q10\nstatus: open\nasks: ten\n'
    expect(answerQuestion(file, 'Q1', 'A')).toBeUndefined()
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
