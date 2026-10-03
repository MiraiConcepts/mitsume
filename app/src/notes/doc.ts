import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

import { notesSyncUrl } from '@/config';

import { attachLocalPersistence } from './persistence';
import { createNotesStore, type NotesStore } from './store';

export type NotesHandle = {
  doc: Y.Doc;
  store: NotesStore;
  /** Resolves when the local cache has loaded (immediately on native). */
  ready: Promise<void>;
  /**
   * Resolves on the FIRST server sync (immediately when no provider is
   * configured; never when the server is unreachable — race with a timeout).
   * Seeding the first leaf must wait for this: seeding before the server
   * doc arrives creates a rival 'default' Y.Map whose same-key CRDT merge can
   * clobber the server's leaf — and its items — on a fresh cache.
   */
  synced: Promise<void>;
  /** Null when no sync URL is configured (e.g. native without EXPO_PUBLIC_SYNC_URL). */
  provider: HocuspocusProvider | null;
};

let handle: NotesHandle | null = null;

/**
 * Lazily opens the app-wide notes doc — one Y.Doc holding every leaf (V1),
 * meshing y-indexeddb (local cache) with the Hocuspocus provider (server =
 * source of truth; offline edits merge on reconnect). Lazy because module
 * scope also runs during the static web export (Node), where neither
 * indexedDB nor window exist: call from client code (mount effect), never at
 * module scope. All doc access goes through the store so a future
 * doc-per-leaf split stays mechanical.
 */
export function openNotes(): NotesHandle {
  if (handle) return handle;
  const doc = new Y.Doc();
  const store = createNotesStore(doc);
  const ready = attachLocalPersistence(doc);
  const url = notesSyncUrl();
  let synced = Promise.resolve();
  let provider: HocuspocusProvider | null = null;
  if (url) {
    synced = new Promise((resolve) => {
      provider = new HocuspocusProvider({
        url,
        name: 'mitsume-notes',
        document: doc,
        onSynced: () => resolve(),
      });
    });
  }
  handle = { doc, store, ready, synced, provider };
  return handle;
}
