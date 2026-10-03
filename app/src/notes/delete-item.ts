import { blobsBaseUrl } from '@/config';

import { removeBlob } from './blob-cache';

import type { NotesStore } from './store';

/**
 * Delete a canvas item AND its bytes (user decision: deletion removes the
 * image from browser cache and server). Bytes only go when no other item
 * references the hash. Locally the blob moves to the session trash so ctrl+Z
 * can restore and re-upload it; the server DELETE is best-effort (offline
 * deletes may orphan server bytes — accepted for V1).
 */
export async function deleteItemWithBlobs(
  store: NotesStore,
  canvasId: string,
  itemId: string
): Promise<void> {
  const item = store.getItem(canvasId, itemId);
  if (!item) return;
  store.deleteItem(canvasId, itemId);
  await dropUnreferencedBlobs(store, [item.displayHash, item.originalHash]);
}

/**
 * Delete a whole leaf — notepad, canvas items and the bytes of every image
 * no other leaf still uses. Same blob rules as a single item.
 */
export async function deleteLeafWithBlobs(
  store: NotesStore,
  leafId: string
): Promise<void> {
  await dropUnreferencedBlobs(store, store.deleteLeaf(leafId));
}

async function dropUnreferencedBlobs(
  store: NotesStore,
  hashes: Iterable<string>
): Promise<void> {
  const base = blobsBaseUrl();
  for (const hash of new Set(hashes)) {
    if (store.referencesToHash(hash) > 0) continue;
    await removeBlob(hash);
    if (base)
      void fetch(`${base}${hash}`, { method: 'DELETE' }).catch(() => {});
  }
}
