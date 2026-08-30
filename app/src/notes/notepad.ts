import { UI_ORIGIN } from './store';
import { diffEdit } from './text-edit';

import type * as Y from 'yjs';

/** Root key of the notepad body in the shared doc. */
const NOTEPAD_KEY = 'notepad';

/**
 * The notepad body — a Y.Text root on the same doc the canvas uses.
 *
 * A root type needs no seeding, which is what makes this simpler than the
 * canvas: `ensureDefaultCanvas` has to wait for the first server sync, because
 * seeding a rival 'default' key early can clobber the server's copy. Two
 * Y.Texts just merge, so the screen can render as soon as the local cache is
 * loaded and let the server's version arrive whenever it does.
 */
export const notepadText = (doc: Y.Doc): Y.Text => doc.getText(NOTEPAD_KEY);

/**
 * Write a new body as the smallest edit against the current one (see
 * `diffEdit`). Tagged UI_ORIGIN so it is undoable on the same terms as canvas
 * edits, and so provider-applied remote updates never look like local ones.
 */
export function setNotepadText(doc: Y.Doc, next: string): void {
  const text = notepadText(doc);
  const prev = text.toString();
  if (prev === next) return;
  const { index, removed, inserted } = diffEdit(prev, next);
  doc.transact(() => {
    if (removed > 0) text.delete(index, removed);
    if (inserted) text.insert(index, inserted);
  }, UI_ORIGIN);
}
