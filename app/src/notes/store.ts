import * as Y from 'yjs';

import { createNoteId } from '@/utils/note-id';

import { imageSizeFor, placeBelow } from './canvas-math';
import { diffEdit } from './text-edit';

import type { Rect } from './canvas-math';
import type { CanvasItem, ImageItem, IngestedImage, LeafMeta } from './types';

/**
 * Transaction origin for user-initiated item edits. UndoManagers track ONLY
 * this origin, so provider-applied updates and setup writes (leaf creation)
 * are never undoable. Matched by reference — always import this constant.
 */
export const UI_ORIGIN = Symbol('mitsume-ui');

/**
 * Transaction origin for typing in the notes and the splits/merges it causes.
 * Deliberately NOT tracked by the canvas undo: the text field keeps its own
 * undo, and ctrl+Z on the canvas should never unpick what you typed.
 */
export const TYPING_ORIGIN = Symbol('mitsume-typing');

/** A new text card: 8 × 4 grid cells. */
export const TEXT_CARD_SIZE = { w: 256, h: 128 };

export const DEFAULT_LEAF_ID = 'default';
export const DEFAULT_LEAF_ICON = 'book';

type YLeaf = Y.Map<unknown>;
type YItem = Y.Map<unknown>;

/**
 * All access to the notes doc. A leaf's notes and canvas are two views of
 * the same chunks: every chunk is a card (an item), and the notes show the
 * cards in their own order. Leaves live in a root map keyed by id; each is a
 * Y.Map { icon, createdAt, order?, items: Y.Map<itemId, Y.Map> }. Items are
 * nested maps so a move rewrites only x/y (small updates, precise undo); a
 * text item holds its body as a nested Y.Text. The notes order is a separate
 * root array per leaf (see chunkListFor). The canvas half keeps its item
 * APIs keyed by `canvasId`, which is the leaf's id.
 *
 * The root key is still 'canvases' — leaves were canvases before they gained
 * a notepad, and renaming the key would orphan every existing image.
 */
export function createNotesStore(doc: Y.Doc) {
  const leaves = doc.getMap<YLeaf>('canvases');

  const transactUI = (fn: () => void) => doc.transact(fn, UI_ORIGIN);

  const leafFor = (leafId: string): YLeaf => {
    const leaf = leaves.get(leafId);
    if (!leaf) throw new Error(`unknown leaf: ${leafId}`);
    return leaf;
  };

  const itemsMapFor = (canvasId: string): Y.Map<YItem> =>
    leafFor(canvasId).get('items') as Y.Map<YItem>;

  const putLeaf = (
    id: string,
    icon: string,
    createdAt: number,
    order?: number
  ) => {
    const leaf = new Y.Map<unknown>();
    leaf.set('icon', icon);
    leaf.set('createdAt', createdAt);
    if (order !== undefined) leaf.set('order', order);
    leaf.set('items', new Y.Map<YItem>());
    leaves.set(id, leaf);
  };

  /**
   * Seeds the first leaf under a FIXED key, outside the undo origin, and only
   * when there are no leaves at all — so deleting it can't bring it back.
   * Fixed key means concurrent first-boots converge on one leaf instead of
   * duplicating (Y.Map same-key sets merge; sequence types would not).
   */
  const ensureDefaultLeaf = () => {
    if (leaves.size > 0) return;
    doc.transact(() => putLeaf(DEFAULT_LEAF_ID, DEFAULT_LEAF_ICON, Date.now()));
  };

  /**
   * Leaves in rail order. `order` is a fractional position written by
   * moveLeaf; leaves never moved fall back to createdAt, so leaves from
   * before reordering existed keep their creation order.
   */
  const listLeaves = (): LeafMeta[] =>
    Array.from(leaves.entries())
      .map(([id, leaf]) => {
        const createdAt = leaf.get('createdAt') as number;
        return {
          id,
          icon: leaf.get('icon') as string,
          createdAt,
          order: (leaf.get('order') as number | undefined) ?? createdAt,
        };
      })
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));

  /** Creates a leaf at the end of the rail and returns its id. Not undoable. */
  const createLeaf = (icon: string, now: number = Date.now()): string => {
    const id = createNoteId(now);
    const last = listLeaves().at(-1);
    doc.transact(() => putLeaf(id, icon, now, last ? last.order + 1 : now));
    return id;
  };

  /**
   * Moves a leaf to `toIndex` in rail order by giving it an order between its
   * new neighbours, so only the moved leaf is rewritten (two devices
   * reordering different leaves both keep their move). Not undoable.
   */
  const moveLeaf = (leafId: string, toIndex: number) => {
    const others = listLeaves().filter((leaf) => leaf.id !== leafId);
    const index = Math.max(0, Math.min(toIndex, others.length));
    const before = others[index - 1]?.order;
    const after = others[index]?.order;
    const order =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1
          : after !== undefined
            ? after - 1
            : 0;
    doc.transact(() => leafFor(leafId).set('order', order));
  };

  /**
   * The single notepad a leaf had before its notes became chunks — a Y.Text
   * root, emptied once migrateNotepads has moved it into a chunk. (The one
   * pre-leaf notepad at root 'notepad' is left behind unused.)
   */
  const notepadFor = (leafId: string): Y.Text =>
    doc.getText(`notepad:${leafId}`);

  /**
   * The notes order of a leaf's chunks: item ids. A root array rather than a
   * field on the leaf map, for the same reason as the old notepad — a root
   * type needs no seeding, so two devices touching it merge instead of one
   * replacing the other's. It can hold duplicates (two devices filling in
   * unlisted items at once) and ids of deleted items; chunkOrder reads past
   * both.
   */
  const chunkListFor = (leafId: string): Y.Array<string> =>
    doc.getArray<string>(`chunks:${leafId}`);

  /**
   * Item ids in notes order: the listed ones first (first occurrence wins),
   * then any item not listed — images from before the notes and canvas were
   * one — oldest first (ids are time-prefixed).
   */
  const chunkOrder = (leafId: string): string[] => {
    const items = itemsMapFor(leafId);
    const seen = new Set<string>();
    for (const id of chunkListFor(leafId).toArray())
      if (items.has(id)) seen.add(id);
    const unlisted = [...items.keys()].filter((id) => !seen.has(id)).sort();
    return [...seen, ...unlisted];
  };

  /** Write the unlisted items into the list, so positions can be named. */
  const materialize = (leafId: string) => {
    const list = chunkListFor(leafId);
    const listed = new Set(list.toArray());
    const unlisted = chunkOrder(leafId).filter((id) => !listed.has(id));
    if (unlisted.length) list.push(unlisted);
  };

  /** Put `id` into the notes right after `afterId` (null = at the top). */
  const listAfter = (leafId: string, afterId: string | null, id: string) => {
    materialize(leafId);
    const list = chunkListFor(leafId);
    const index = afterId === null ? -1 : list.toArray().indexOf(afterId);
    list.insert(index + 1, [id]);
  };

  const unlist = (leafId: string, id: string) => {
    const list = chunkListFor(leafId);
    const ids = list.toArray();
    for (let i = ids.length - 1; i >= 0; i -= 1)
      if (ids[i] === id) list.delete(i, 1);
  };

  const rectOf = (yItem: YItem): Rect => ({
    x: yItem.get('x') as number,
    y: yItem.get('y') as number,
    w: yItem.get('w') as number,
    h: yItem.get('h') as number,
  });

  /** Where a card added from the notes after `afterId` lands on the canvas. */
  const placeAfter = (
    leafId: string,
    afterId: string | null,
    size: { w: number; h: number }
  ): Rect => {
    const items = itemsMapFor(leafId);
    const anchor = afterId ? items.get(afterId) : undefined;
    return placeBelow(
      anchor ? rectOf(anchor) : null,
      size,
      [...items.values()].map(rectOf)
    );
  };

  const putTextItem = (
    leafId: string,
    id: string,
    rect: Rect,
    text: string
  ) => {
    const yItem = new Y.Map<unknown>();
    yItem.set('id', id);
    yItem.set('kind', 'text');
    for (const key of ['x', 'y', 'w', 'h'] as const) yItem.set(key, rect[key]);
    yItem.set('z', nextZ(leafId));
    yItem.set('text', new Y.Text(text));
    itemsMapFor(leafId).set(id, yItem);
  };

  const textOf = (leafId: string, id: string): Y.Text | null => {
    const text = itemsMapFor(leafId).get(id)?.get('text');
    return text instanceof Y.Text ? text : null;
  };

  /** Rewrite a Y.Text as the smallest edit against its current body. */
  const applyText = (text: Y.Text, next: string) => {
    const { index, removed, inserted } = diffEdit(text.toString(), next);
    if (removed > 0) text.delete(index, removed);
    if (inserted) text.insert(index, inserted);
  };

  /** Adds a text chunk after `afterId` (null = at the top); returns its id. */
  const insertTextChunk = (
    leafId: string,
    afterId: string | null,
    text = ''
  ): string => {
    const id = createNoteId();
    doc.transact(() => {
      putTextItem(
        leafId,
        id,
        placeAfter(leafId, afterId, TEXT_CARD_SIZE),
        text
      );
      listAfter(leafId, afterId, id);
    }, TYPING_ORIGIN);
    return id;
  };

  /** Typing in a chunk: written as the smallest edit (see `diffEdit`). */
  const setChunkText = (leafId: string, id: string, next: string) => {
    const text = textOf(leafId, id);
    if (!text || text.toString() === next) return;
    doc.transact(() => applyText(text, next), TYPING_ORIGIN);
  };

  /**
   * Splits a chunk where `---` was typed: it keeps `before`, and a new chunk
   * right after it gets `after`. Returns the new chunk's id.
   */
  const splitChunk = (
    leafId: string,
    id: string,
    before: string,
    after: string
  ): string => {
    const newId = createNoteId();
    doc.transact(() => {
      const text = textOf(leafId, id);
      if (text) applyText(text, before);
      putTextItem(leafId, newId, placeAfter(leafId, id, TEXT_CARD_SIZE), after);
      listAfter(leafId, id, newId);
    }, TYPING_ORIGIN);
    return newId;
  };

  /**
   * Backspace at the start of a text chunk: its text joins the end of the
   * text chunk above (on a new line) and its card goes. Returns that chunk
   * and the caret position at the join, or null when the chunk above is an
   * image or there is none.
   */
  const mergeChunkUp = (
    leafId: string,
    id: string
  ): { id: string; caret: number } | null => {
    const order = chunkOrder(leafId);
    const prevId = order[order.indexOf(id) - 1];
    const prev = prevId ? textOf(leafId, prevId) : null;
    const text = textOf(leafId, id);
    if (!prevId || !prev || !text) return null;
    const caret = prev.length;
    const body = text.toString();
    doc.transact(() => {
      if (body) prev.insert(caret, caret > 0 ? `\n${body}` : body);
      itemsMapFor(leafId).delete(id);
      unlist(leafId, id);
    }, TYPING_ORIGIN);
    return { id: prevId, caret };
  };

  /**
   * Moves each leaf's old single notepad into a first text chunk, once. The
   * chunk's id is derived from the leaf, so two devices migrating at the same
   * time write the same card instead of two.
   */
  const migrateNotepads = () => {
    for (const leafId of leaves.keys()) {
      const notepad = notepadFor(leafId);
      if (notepad.length === 0) continue;
      const id = `notepad-${leafId}`;
      doc.transact(() => {
        if (!itemsMapFor(leafId).has(id))
          putTextItem(
            leafId,
            id,
            placeAfter(leafId, null, TEXT_CARD_SIZE),
            notepad.toString()
          );
        listAfter(leafId, null, id);
        notepad.delete(0, notepad.length);
      });
    }
  };

  /**
   * Deletes a leaf: its cards, its notes order and any old notepad. Refuses
   * the last leaf. Returns the blob hashes its images referenced, for the
   * caller to drop the ones nothing else uses (see delete-item). Not
   * undoable — the UI confirms.
   */
  const deleteLeaf = (leafId: string): string[] => {
    if (leaves.size <= 1 || !leaves.has(leafId)) return [];
    const hashes = new Set<string>();
    for (const yItem of itemsMapFor(leafId).values())
      for (const key of ['displayHash', 'originalHash']) {
        const hash = yItem.get(key);
        if (typeof hash === 'string') hashes.add(hash);
      }
    doc.transact(() => {
      leaves.delete(leafId);
      // Root types can't be removed, only emptied.
      const notepad = notepadFor(leafId);
      notepad.delete(0, notepad.length);
      const list = chunkListFor(leafId);
      list.delete(0, list.length);
    });
    return [...hashes];
  };

  const getItem = (canvasId: string, itemId: string): CanvasItem | undefined =>
    (itemsMapFor(canvasId).get(itemId)?.toJSON() as CanvasItem) ?? undefined;

  /**
   * Adds an image card. `afterId` places its chunk in the notes: after that
   * chunk (null = at the top); omitted = at the end, as for a canvas paste.
   */
  const addItem = (
    canvasId: string,
    item: ImageItem,
    afterId?: string | null
  ) =>
    transactUI(() => {
      const yItem = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(item)) yItem.set(key, value);
      itemsMapFor(canvasId).set(item.id, yItem);
      if (afterId !== undefined) listAfter(canvasId, afterId, item.id);
      else {
        materialize(canvasId);
        chunkListFor(canvasId).push([item.id]);
      }
    });

  /** An image pasted into the notes: its card lands below the chunk above. */
  const addImageChunk = (
    leafId: string,
    afterId: string | null,
    image: IngestedImage
  ): string => {
    const id = createNoteId();
    const rect = placeAfter(
      leafId,
      afterId,
      imageSizeFor({ w: image.displayW, h: image.displayH })
    );
    addItem(leafId, { ...image, id, ...rect, z: nextZ(leafId) }, afterId);
    return id;
  };

  const updateItem = (
    canvasId: string,
    itemId: string,
    patch: Partial<CanvasItem>
  ) =>
    transactUI(() => {
      const yItem = itemsMapFor(canvasId).get(itemId);
      if (!yItem) return;
      for (const [key, value] of Object.entries(patch))
        if (value !== undefined) yItem.set(key, value);
    });

  /** Deletes a card, and so its chunk in the notes. */
  const deleteItem = (canvasId: string, itemId: string) =>
    transactUI(() => {
      itemsMapFor(canvasId).delete(itemId);
      unlist(canvasId, itemId);
    });

  /** Stacking value for a newly added item: above everything present. */
  const nextZ = (canvasId: string): number => {
    let max = 0;
    for (const yItem of itemsMapFor(canvasId).values())
      max = Math.max(max, (yItem.get('z') as number) ?? 0);
    return max + 1;
  };

  /**
   * How many items (across ALL leaves) reference a blob hash. Blob bytes
   * may only be deleted when this drops to zero.
   */
  const referencesToHash = (hash: string): number => {
    let count = 0;
    for (const leaf of leaves.values()) {
      const items = leaf.get('items') as Y.Map<YItem>;
      for (const yItem of items.values())
        if (
          yItem.get('displayHash') === hash ||
          yItem.get('originalHash') === hash
        )
          count += 1;
    }
    return count;
  };

  /**
   * Undo/redo scoped to one leaf's cards and their notes order (so undoing a
   * delete puts the chunk back where it was); recreate on leaf switch. Call
   * stopCapturing() at each gesture start so quick successive ops stay
   * separate undo steps (default captureTimeout merges within 500ms).
   */
  const createUndoManager = (canvasId: string): Y.UndoManager =>
    new Y.UndoManager([itemsMapFor(canvasId), chunkListFor(canvasId)], {
      trackedOrigins: new Set([UI_ORIGIN]),
    });

  return {
    doc,
    leaves,
    transactUI,
    ensureDefaultLeaf,
    listLeaves,
    createLeaf,
    moveLeaf,
    deleteLeaf,
    notepadFor,
    chunkListFor,
    chunkOrder,
    insertTextChunk,
    setChunkText,
    splitChunk,
    mergeChunkUp,
    migrateNotepads,
    itemsMapFor,
    getItem,
    addItem,
    addImageChunk,
    updateItem,
    deleteItem,
    nextZ,
    referencesToHash,
    createUndoManager,
  };
}

export type NotesStore = ReturnType<typeof createNotesStore>;
