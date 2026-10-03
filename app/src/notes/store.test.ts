import * as Y from 'yjs';

import { DEFAULT_LEAF_ID, createNotesStore } from './store';

import type { ImageItem, IngestedImage, TextItem } from './types';

const makeItem = (overrides: Partial<ImageItem> = {}): ImageItem => ({
  id: 'item-1',
  x: 0,
  y: 0,
  w: 64,
  h: 64,
  z: 1,
  displayHash: 'display-hash',
  displayMime: 'image/webp',
  displayW: 64,
  displayH: 64,
  originalHash: 'original-hash',
  originalMime: 'image/png',
  originalSize: 1234,
  ...overrides,
});

/** Just the blob-derived fields, as the ingest pipeline hands them over. */
const ingested = (): IngestedImage => {
  const { displayHash, displayMime, displayW, displayH } = makeItem();
  const { originalHash, originalMime, originalSize } = makeItem();
  return {
    displayHash,
    displayMime,
    displayW,
    displayH,
    originalHash,
    originalMime,
    originalSize,
  };
};

describe('createNotesStore', () => {
  it('seeds the first leaf idempotently', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    store.ensureDefaultLeaf();
    expect(store.listLeaves()).toHaveLength(1);
    expect(store.listLeaves()[0].id).toBe(DEFAULT_LEAF_ID);
  });

  it('adds new leaves at the end of the rail', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    // Created "earlier" than the seeded leaf, yet still listed after it.
    const a = store.createLeaf('heart', 1000);
    const b = store.createLeaf('cart', 2000);
    const listed = store.listLeaves().map((leaf) => leaf.id);
    expect(listed).toEqual([DEFAULT_LEAF_ID, a, b]);
    expect(store.listLeaves()[1].icon).toBe('heart');
  });

  it('lists leaves that were never moved in creation order', () => {
    const doc = new Y.Doc();
    const store = createNotesStore(doc);
    // Leaves from before reordering existed have no `order` field.
    for (const [id, createdAt] of [
      ['late', 2000],
      ['early', 1000],
    ] as const) {
      const leaf = new Y.Map<unknown>();
      leaf.set('icon', 'book');
      leaf.set('createdAt', createdAt);
      leaf.set('items', new Y.Map());
      store.leaves.set(id, leaf);
    }
    expect(store.listLeaves().map((leaf) => leaf.id)).toEqual([
      'early',
      'late',
    ]);
  });

  it('moves a leaf to any position', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    const a = store.createLeaf('heart');
    const b = store.createLeaf('cart');
    const ids = () => store.listLeaves().map((leaf) => leaf.id);
    store.moveLeaf(b, 0);
    expect(ids()).toEqual([b, DEFAULT_LEAF_ID, a]);
    store.moveLeaf(b, 1);
    expect(ids()).toEqual([DEFAULT_LEAF_ID, b, a]);
    store.moveLeaf(DEFAULT_LEAF_ID, 2);
    expect(ids()).toEqual([b, a, DEFAULT_LEAF_ID]);
  });

  it('deletes a leaf with its items and notepad, returning its hashes', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    const other = store.createLeaf('heart');
    store.addItem(other, makeItem());
    store.insertTextChunk(other, null, 'gone soon');
    const hashes = store.deleteLeaf(other);
    expect(hashes.sort()).toEqual(['display-hash', 'original-hash']);
    expect(store.listLeaves().map((leaf) => leaf.id)).toEqual([
      DEFAULT_LEAF_ID,
    ]);
    expect(store.chunkListFor(other).length).toBe(0);
    expect(store.referencesToHash('display-hash')).toBe(0);
  });

  it('refuses to delete the last leaf', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    expect(store.deleteLeaf(DEFAULT_LEAF_ID)).toEqual([]);
    expect(store.listLeaves()).toHaveLength(1);
  });

  it('does not bring back a deleted first leaf', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    const other = store.createLeaf('heart');
    store.deleteLeaf(DEFAULT_LEAF_ID);
    store.ensureDefaultLeaf();
    expect(store.listLeaves().map((leaf) => leaf.id)).toEqual([other]);
  });

  describe('chunks', () => {
    const setup = () => {
      const store = createNotesStore(new Y.Doc());
      store.ensureDefaultLeaf();
      return store;
    };
    const L = DEFAULT_LEAF_ID;
    const textOf = (store: ReturnType<typeof setup>, id: string) =>
      (store.getItem(L, id) as TextItem).text;

    it('lists images from before chunks at the end, oldest first', () => {
      const store = setup();
      // Written straight to the map: no notes order, like pre-chunk images.
      for (const id of ['b-2', 'a-1']) {
        const yItem = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(makeItem({ id })))
          yItem.set(key, value);
        store.itemsMapFor(L).set(id, yItem);
      }
      const first = store.insertTextChunk(L, null, 'top');
      expect(store.chunkOrder(L)).toEqual([first, 'a-1', 'b-2']);
    });

    it('adds text chunks in order, each card below the one above', () => {
      const store = setup();
      const a = store.insertTextChunk(L, null, 'a');
      const b = store.insertTextChunk(L, a, 'b');
      const c = store.insertTextChunk(L, a, 'c');
      expect(store.chunkOrder(L)).toEqual([a, c, b]);
      const cardA = store.getItem(L, a)!;
      const cardC = store.getItem(L, c)!;
      expect(cardA).toMatchObject({ kind: 'text', text: 'a', x: 32, y: 32 });
      expect(cardC.x).toBe(cardA.x);
      expect(cardC.y).toBeGreaterThanOrEqual(cardA.y + cardA.h);
    });

    it('splits a chunk where --- was typed', () => {
      const store = setup();
      const a = store.insertTextChunk(L, null, 'one\n---\ntwo');
      const b = store.splitChunk(L, a, 'one', 'two');
      expect(store.chunkOrder(L)).toEqual([a, b]);
      expect(textOf(store, a)).toBe('one');
      expect(textOf(store, b)).toBe('two');
    });

    it('merges a chunk into the text chunk above', () => {
      const store = setup();
      const a = store.insertTextChunk(L, null, 'one');
      const b = store.insertTextChunk(L, a, 'two');
      expect(store.mergeChunkUp(L, b)).toEqual({ id: a, caret: 3 });
      expect(store.chunkOrder(L)).toEqual([a]);
      expect(textOf(store, a)).toBe('one\ntwo');
      expect(store.getItem(L, b)).toBeUndefined();
    });

    it('does not merge into an image or past the top', () => {
      const store = setup();
      const image = store.addImageChunk(L, null, ingested());
      const text = store.insertTextChunk(L, image, 'under the image');
      expect(store.mergeChunkUp(L, text)).toBeNull();
      expect(store.mergeChunkUp(L, image)).toBeNull();
      expect(store.chunkOrder(L)).toEqual([image, text]);
    });

    it('places an image pasted in the notes after its chunk', () => {
      const store = setup();
      const a = store.insertTextChunk(L, null, 'a');
      const b = store.insertTextChunk(L, a, 'b');
      const image = store.addImageChunk(L, a, ingested());
      expect(store.chunkOrder(L)).toEqual([a, image, b]);
      const cardA = store.getItem(L, a)!;
      expect(store.getItem(L, image)!.y).toBeGreaterThanOrEqual(
        cardA.y + cardA.h
      );
    });

    it('adds a canvas paste at the end of the notes', () => {
      const store = setup();
      const a = store.insertTextChunk(L, null, 'a');
      store.addItem(L, makeItem({ id: 'pasted' }));
      expect(store.chunkOrder(L)).toEqual([a, 'pasted']);
    });

    it('deletes a card from the notes too, and undo restores both', () => {
      const store = setup();
      const undo = store.createUndoManager(L);
      const a = store.insertTextChunk(L, null, 'a');
      const b = store.insertTextChunk(L, a, 'b');
      const c = store.insertTextChunk(L, b, 'c');
      store.deleteItem(L, b);
      expect(store.chunkOrder(L)).toEqual([a, c]);
      undo.undo();
      expect(store.chunkOrder(L)).toEqual([a, b, c]);
      expect(textOf(store, b)).toBe('b');
    });

    it('keeps typing out of the canvas undo', () => {
      const store = setup();
      const a = store.insertTextChunk(L, null, 'a');
      const undo = store.createUndoManager(L);
      store.setChunkText(L, a, 'a, edited');
      expect(undo.canUndo()).toBe(false);
      expect(textOf(store, a)).toBe('a, edited');
    });

    it('moves an old notepad into a first chunk, once', () => {
      const store = setup();
      const later = store.insertTextChunk(L, null, 'later');
      store.notepadFor(L).insert(0, 'old notes');
      store.migrateNotepads();
      store.migrateNotepads();
      const order = store.chunkOrder(L);
      expect(order).toEqual([`notepad-${L}`, later]);
      expect(textOf(store, order[0])).toBe('old notes');
      expect(store.notepadFor(L).length).toBe(0);
    });
  });

  it('round-trips item add / get / update / delete', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    store.addItem(DEFAULT_LEAF_ID, makeItem());
    expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toMatchObject({
      x: 0,
      displayHash: 'display-hash',
    });
    store.updateItem(DEFAULT_LEAF_ID, 'item-1', { x: 96, y: 32 });
    expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toMatchObject({
      x: 96,
      y: 32,
      w: 64,
    });
    store.deleteItem(DEFAULT_LEAF_ID, 'item-1');
    expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toBeUndefined();
  });

  it('computes nextZ above all existing items', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    expect(store.nextZ(DEFAULT_LEAF_ID)).toBe(1);
    store.addItem(DEFAULT_LEAF_ID, makeItem({ id: 'a', z: 5 }));
    store.addItem(DEFAULT_LEAF_ID, makeItem({ id: 'b', z: 2 }));
    expect(store.nextZ(DEFAULT_LEAF_ID)).toBe(6);
  });

  it('counts blob references across all leaves', () => {
    const store = createNotesStore(new Y.Doc());
    store.ensureDefaultLeaf();
    const other = store.createLeaf('disc');
    store.addItem(DEFAULT_LEAF_ID, makeItem({ id: 'a' }));
    store.addItem(other, makeItem({ id: 'b' }));
    store.addItem(
      other,
      makeItem({ id: 'c', displayHash: 'unique', originalHash: 'unique-orig' })
    );
    expect(store.referencesToHash('display-hash')).toBe(2);
    expect(store.referencesToHash('original-hash')).toBe(2);
    expect(store.referencesToHash('unique')).toBe(1);
    expect(store.referencesToHash('nope')).toBe(0);
  });

  describe('undo', () => {
    it('undoes and redoes UI item operations', () => {
      const store = createNotesStore(new Y.Doc());
      store.ensureDefaultLeaf();
      const undo = store.createUndoManager(DEFAULT_LEAF_ID);
      store.addItem(DEFAULT_LEAF_ID, makeItem());
      undo.undo();
      expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toBeUndefined();
      undo.redo();
      expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toMatchObject({
        w: 64,
      });
    });

    it('restores a deleted item with all fields on undo', () => {
      const store = createNotesStore(new Y.Doc());
      store.ensureDefaultLeaf();
      const undo = store.createUndoManager(DEFAULT_LEAF_ID);
      store.addItem(DEFAULT_LEAF_ID, makeItem({ x: 128 }));
      undo.stopCapturing();
      store.deleteItem(DEFAULT_LEAF_ID, 'item-1');
      undo.undo();
      expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toMatchObject({
        x: 128,
        originalHash: 'original-hash',
      });
    });

    it('keeps separate undo steps across stopCapturing boundaries', () => {
      const store = createNotesStore(new Y.Doc());
      store.ensureDefaultLeaf();
      const undo = store.createUndoManager(DEFAULT_LEAF_ID);
      store.addItem(DEFAULT_LEAF_ID, makeItem());
      undo.stopCapturing();
      store.updateItem(DEFAULT_LEAF_ID, 'item-1', { x: 96 });
      undo.undo(); // reverts only the move
      expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toMatchObject({
        x: 0,
      });
    });

    it('ignores changes made outside the UI origin', () => {
      const store = createNotesStore(new Y.Doc());
      store.ensureDefaultLeaf();
      const undo = store.createUndoManager(DEFAULT_LEAF_ID);
      // Simulates a provider/remote write: no UI origin on the transaction.
      store.doc.transact(() => {
        const yItem = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(makeItem()))
          yItem.set(key, value);
        store.itemsMapFor(DEFAULT_LEAF_ID).set('item-1', yItem);
      });
      expect(undo.canUndo()).toBe(false);
      undo.undo();
      expect(store.getItem(DEFAULT_LEAF_ID, 'item-1')).toBeDefined();
    });

    it('scopes undo to its own canvas', () => {
      const store = createNotesStore(new Y.Doc());
      store.ensureDefaultLeaf();
      const other = store.createLeaf('brain');
      const undoDefault = store.createUndoManager(DEFAULT_LEAF_ID);
      store.addItem(other, makeItem());
      expect(undoDefault.canUndo()).toBe(false);
      undoDefault.undo();
      expect(store.getItem(other, 'item-1')).toBeDefined();
    });
  });
});
