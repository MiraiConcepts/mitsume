import { diffEdit } from './text-edit';

/** Applying an edit is the inverse of computing one — every case must round-trip. */
const apply = (prev: string, edit: ReturnType<typeof diffEdit>): string =>
  prev.slice(0, edit.index) +
  edit.inserted +
  prev.slice(edit.index + edit.removed);

describe('diffEdit', () => {
  it('reports a pure insertion at the caret', () => {
    expect(diffEdit('abc', 'abXc')).toEqual({
      index: 2,
      removed: 0,
      inserted: 'X',
    });
  });

  it('reports a pure deletion', () => {
    expect(diffEdit('abc', 'ac')).toEqual({
      index: 1,
      removed: 1,
      inserted: '',
    });
  });

  it('handles typing into and clearing an empty note', () => {
    expect(diffEdit('', 'hello')).toEqual({
      index: 0,
      removed: 0,
      inserted: 'hello',
    });
    expect(diffEdit('hello', '')).toEqual({
      index: 0,
      removed: 5,
      inserted: '',
    });
  });

  it('never overlaps the prefix and the suffix on repeated characters', () => {
    // The bug this guards: an unbounded suffix scan matches the same 'a'
    // twice, giving removed = -1 and a Y.Text delete of negative length.
    expect(diffEdit('aa', 'aaa')).toEqual({
      index: 2,
      removed: 0,
      inserted: 'a',
    });
    expect(diffEdit('aaa', 'aa')).toEqual({
      index: 2,
      removed: 1,
      inserted: '',
    });
  });

  it('collapses an unrelated rewrite into one span', () => {
    expect(diffEdit('ab', 'ba')).toEqual({
      index: 0,
      removed: 2,
      inserted: 'ba',
    });
  });

  it('reports nothing to do for an unchanged body', () => {
    expect(diffEdit('same', 'same')).toEqual({
      index: 4,
      removed: 0,
      inserted: '',
    });
  });

  it('round-trips every case back to the new value', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['', 'x'],
      ['x', ''],
      ['abc', 'abXc'],
      ['abc', 'ac'],
      ['aa', 'aaa'],
      ['aaa', 'aa'],
      ['ab', 'ba'],
      ['the quick fox', 'the quick brown fox'],
      ['line one\nline two', 'line one\nline 2'],
      ['note', 'note'],
      ['🙂 hi', '🙂 hey'],
    ];
    for (const [prev, next] of cases)
      expect(apply(prev, diffEdit(prev, next))).toBe(next);
  });
});
