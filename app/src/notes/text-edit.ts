/** A single-span replacement that turns one string into another. */
export type TextEdit = {
  /** Where the change starts. */
  index: number;
  /** How many characters to remove at `index`. */
  removed: number;
  /** What to insert there afterwards. */
  inserted: string;
};

/**
 * The smallest single-span edit between two strings: skip the common prefix,
 * then the common suffix, and replace whatever is left in between.
 *
 * A TextInput only ever reports its whole new value, so this is what recovers
 * the actual keystroke from it. Writing the new value into a Y.Text wholesale
 * would delete and re-insert every character on every keypress — which throws
 * away a concurrent edit made anywhere else in the note, and writes the entire
 * body into the update log each time.
 */
export function diffEdit(prev: string, next: string): TextEdit {
  const shorter = Math.min(prev.length, next.length);

  let start = 0;
  while (start < shorter && prev[start] === next[start]) start += 1;

  // Bounded by the unmatched remainder so the prefix and suffix can never
  // overlap — without it "aa" → "aaa" would report a negative removal.
  let end = 0;
  while (
    end < shorter - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  )
    end += 1;

  return {
    index: start,
    removed: prev.length - start - end,
    inserted: next.slice(start, next.length - end),
  };
}
