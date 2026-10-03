import * as Y from 'yjs';

import { createNoteId } from '@/utils/note-id';

import { diffEdit } from './text-edit';

import type { CanvasItem, LeafMeta } from './types';

/**
 * Transaction origin for user-initiated item edits. UndoManagers track ONLY
 * this origin, so provider-applied updates and setup writes (leaf creation)
 * are never undoable. Matched by reference — always import this constant.
 */
export const UI_ORIGIN = Symbol('mitsume-ui');

export const DEFAULT_LEAF_ID = 'default';
export const DEFAULT_LEAF_ICON = 'book';

type YLeaf = Y.Map<unknown>;
type YItem = Y.Map<unknown>;

/**
 * All access to the notes doc. A leaf is one notepad + one canvas, and the
 * leaves live in a root map keyed by id. Each leaf is a Y.Map { icon,
 * createdAt, order?, items: Y.Map<itemId, Y.Map> }; items are nested maps so
 * a move rewrites only x/y (small updates, precise undo). The canvas half
 * keeps its item APIs keyed by `canvasId`, which is the leaf's id.
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
   * A leaf's notepad body — a Y.Text root of its own rather than a field on
   * the leaf map. A root type needs no seeding: two devices that both touch
   * it just merge, where two rival Y.Texts set on the same map key would
   * have one discarded. (The single pre-leaf notepad at root 'notepad' is
   * left behind unused.)
   */
  const notepadFor = (leafId: string): Y.Text =>
    doc.getText(`notepad:${leafId}`);

  /**
   * Deletes a leaf: its canvas items and its notepad. Refuses the last leaf.
   * Returns the blob hashes its items referenced, for the caller to drop the
   * ones nothing else uses (see delete-item). Not undoable — the UI confirms.
   */
  const deleteLeaf = (leafId: string): string[] => {
    if (leaves.size <= 1 || !leaves.has(leafId)) return [];
    const hashes = new Set<string>();
    for (const yItem of itemsMapFor(leafId).values()) {
      hashes.add(yItem.get('displayHash') as string);
      hashes.add(yItem.get('originalHash') as string);
    }
    doc.transact(() => {
      leaves.delete(leafId);
      // A root Y.Text can't be removed, only emptied.
      const notepad = notepadFor(leafId);
      notepad.delete(0, notepad.length);
    });
    return [...hashes];
  };

  /**
   * Write a new notepad body as the smallest edit against the current one
   * (see `diffEdit`). Tagged UI_ORIGIN so provider-applied remote updates
   * never look like local ones.
   */
  const setNotepadText = (leafId: string, next: string) => {
    const text = notepadFor(leafId);
    const prev = text.toString();
    if (prev === next) return;
    const { index, removed, inserted } = diffEdit(prev, next);
    transactUI(() => {
      if (removed > 0) text.delete(index, removed);
      if (inserted) text.insert(index, inserted);
    });
  };

  const getItem = (canvasId: string, itemId: string): CanvasItem | undefined =>
    (itemsMapFor(canvasId).get(itemId)?.toJSON() as CanvasItem) ?? undefined;

  const addItem = (canvasId: string, item: CanvasItem) =>
    transactUI(() => {
      const yItem = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(item)) yItem.set(key, value);
      itemsMapFor(canvasId).set(item.id, yItem);
    });

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

  const deleteItem = (canvasId: string, itemId: string) =>
    transactUI(() => itemsMapFor(canvasId).delete(itemId));

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
   * Undo/redo scoped to one canvas's items; recreate on leaf switch. Call
   * stopCapturing() at each gesture start so quick successive ops stay
   * separate undo steps (default captureTimeout merges within 500ms).
   */
  const createUndoManager = (canvasId: string): Y.UndoManager =>
    new Y.UndoManager(itemsMapFor(canvasId), {
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
    setNotepadText,
    itemsMapFor,
    getItem,
    addItem,
    updateItem,
    deleteItem,
    nextZ,
    referencesToHash,
    createUndoManager,
  };
}

export type NotesStore = ReturnType<typeof createNotesStore>;
