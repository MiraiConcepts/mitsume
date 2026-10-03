import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestDurableStorage } from '@/notes/blob-cache';
import { deleteLeafWithBlobs } from '@/notes/delete-item';
import { openNotes } from '@/notes/doc';
import { startUploader } from '@/notes/uploader';
import { useYSnapshot } from '@/notes/use-y-snapshot';
import {
  forgetCamera,
  loadActiveLeaf,
  saveActiveLeaf,
} from '@/notes/viewport-memory';

import { CanvasView } from './canvas-view';
import { DeleteLeafDialog } from './delete-leaf-dialog';
import { IconPicker } from './icon-picker';
import { LeafBar } from './leaf-bar';
import { Notepad } from './notepad';

import type { LeafIconName } from '@/constants/icon-paths';
import type { NotesHandle } from '@/notes/doc';

/** Below this width the canvas is hidden: rail + notepad only. */
const SPLIT_MIN_WIDTH = 768;

/**
 * The whole app: opens the doc (local cache + sync), seeds the first leaf,
 * then renders the rail and the open leaf — its notepad on the left, its
 * canvas on the right. Rendering is gated on the local cache load so the
 * first paint never flashes an empty leaf.
 */
export function NotesScreen() {
  const [handle, setHandle] = useState<NotesHandle | null>(null);
  useEffect(() => {
    let live = true;
    const h = openNotes();
    const syncedOrTimeout = Promise.race([
      h.synced,
      // Offline fallback: don't block first paint forever on an unreachable
      // server — after the grace period, seed locally and merge later.
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    void Promise.all([h.ready, syncedOrTimeout]).then(() => {
      if (!live) return;
      // Only AFTER the server had its chance to deliver existing state —
      // seeding earlier would rival the server's 'default' leaf (see doc.ts).
      h.store.ensureDefaultLeaf();
      h.store.migrateNotepads();
      requestDurableStorage();
      startUploader();
      setHandle(h);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!handle) {
    return (
      <ThemedView style={styles.loading}>
        <ThemedText type="small" themeColor="textSecondary">
          Loading notes…
        </ThemedText>
      </ThemedView>
    );
  }
  return <NotesReady handle={handle} />;
}

function NotesReady({ handle }: { handle: NotesHandle }) {
  const { store } = handle;
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // Snapshot subscribes this component to leaf changes (from this device or
  // a remote peer); the store keeps the single sorting rule.
  const snapshot = useYSnapshot<unknown>(store.leaves);
  const leaves = useMemo(
    () => store.listLeaves(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot IS the store's change signal
    [store, snapshot]
  );

  // Two devices each deleting a different one of the last two leaves can
  // merge into none; seed a fresh first leaf rather than show nothing.
  useEffect(() => {
    if (leaves.length === 0) store.ensureDefaultLeaf();
  }, [leaves.length, store]);

  const [chosenId, setChosenId] = useState(() => loadActiveLeaf());
  // The chosen leaf can vanish under us (deleted here or on another device);
  // fall back to the first one rather than render a leaf that's gone.
  const activeId =
    leaves.find((leaf) => leaf.id === chosenId)?.id ?? leaves[0]?.id;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectLeaf = useCallback((id: string) => {
    setChosenId(id);
    saveActiveLeaf(id);
  }, []);
  const addLeaf = (icon: LeafIconName) => {
    setPickerOpen(false);
    selectLeaf(store.createLeaf(icon));
  };
  // The last leaf can't be deleted, so there is nothing to ask about.
  const askDelete = useCallback(
    (id: string) => {
      if (store.leaves.size > 1) setDeletingId(id);
    },
    [store]
  );
  const confirmDelete = () => {
    if (!deletingId) return;
    setDeletingId(null);
    // Open a neighbour first, so the leaf's views unmount before it goes.
    if (deletingId === activeId) {
      const index = leaves.findIndex((leaf) => leaf.id === deletingId);
      selectLeaf((leaves[index + 1] ?? leaves[index - 1]).id);
    }
    forgetCamera(deletingId);
    void deleteLeafWithBlobs(store, deletingId);
  };
  const moveLeaf = useCallback(
    (id: string, toIndex: number) => store.moveLeaf(id, toIndex),
    [store]
  );

  if (!activeId) return null;
  return (
    <ThemedView style={styles.root}>
      <LeafBar
        leaves={leaves}
        activeId={activeId}
        onSelect={selectLeaf}
        onAdd={() => setPickerOpen(true)}
        onDelete={askDelete}
        onMove={moveLeaf}
      />
      <View style={styles.notepad}>
        <Notepad key={activeId} leafId={activeId} store={store} />
      </View>
      {width >= SPLIT_MIN_WIDTH && (
        <>
          <View
            style={[
              styles.divider,
              { backgroundColor: theme.backgroundSelected },
            ]}
          />
          <View style={styles.canvas}>
            <CanvasView key={activeId} canvasId={activeId} store={store} />
          </View>
        </>
      )}
      <IconPicker
        visible={pickerOpen}
        onPick={addLeaf}
        onClose={() => setPickerOpen(false)}
      />
      <DeleteLeafDialog
        visible={deletingId !== null}
        onConfirm={confirmDelete}
        onClose={() => setDeletingId(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  notepad: {
    flex: 4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  canvas: {
    flex: 6,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
