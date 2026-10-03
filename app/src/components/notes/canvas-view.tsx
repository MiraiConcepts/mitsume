/* eslint-disable react-hooks/refs --
 * RNGH requires gesture objects (and therefore the callbacks inside them) to
 * stay REFERENTIALLY STABLE while a gesture runs — a recreated gesture
 * detaches the active handler mid-drag. The documented pattern is stable
 * callbacks reading current values through a ref; those reads happen in
 * event context, not render, which the react-hooks/refs rule can't see
 * through the closures. Disabled file-wide with that understanding.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedView } from '@/components/themed-view';
import {
  GRID,
  chooseFocusTarget,
  pasteRectFor,
  resizeRect,
  resizeRectFree,
  snap,
} from '@/notes/canvas-math';
import { deleteItemWithBlobs } from '@/notes/delete-item';
import { useYSnapshot } from '@/notes/use-y-snapshot';
import { useTheme } from '@/hooks/use-theme';
import { createNoteId } from '@/utils/note-id';

import { CanvasItem } from './canvas-item';
import { DotGrid } from './dot-grid';
import { GhostRect } from './ghost-rect';
import { SelectionChrome } from './selection-chrome';
import { useCamera } from './use-camera';
import { useCanvasHotkeys } from './use-hotkeys';
import { usePasteImages } from './use-paste';
import { useWheel } from './use-wheel';
import { ZoomControl } from './zoom-control';

import type { Corner, Rect, Size } from '@/notes/canvas-math';
import type { NotesStore } from '@/notes/store';
import type {
  CanvasItem as CanvasItemData,
  CanvasItems,
  IngestedImage,
} from '@/notes/types';
import type { ViewStyle } from 'react-native';
import type * as Y from 'yjs';

const WHEEL_ZOOM_SENSITIVITY = 0.002;
/** ctrl+wheel = trackpad pinch (small continuous deltas) — needs more gain. */
const PINCH_WHEEL_SENSITIVITY = 0.01;
/**
 * Pixels per wheel delta by WheelEvent.deltaMode: pixel, line (Firefox mice).
 * Page mode falls back to the viewport height.
 */
const WHEEL_UNIT: Record<number, number> = { 0: 1, 1: 16 };
const ZOOM_STEP = 1.25;
/** Distinguishes a drag from a click so taps can reach items/deselection. */
const PAN_MIN_DISTANCE = 4;
/** Release → snapped-grid ease. */
const SETTLE = { duration: 120, easing: Easing.out(Easing.cubic) };

const webCursor = (cursor: string): ViewStyle | undefined =>
  Platform.OS === 'web' ? ({ cursor } as unknown as ViewStyle) : undefined;

/** An in-flight item drag/resize (ephemeral — committed to Yjs on drop). */
type Interaction =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'resize'; corner: Corner; dx: number };

/** Mid-gesture rect: follows the pointer EXACTLY (grid applies on release). */
function freeRect(item: CanvasItemData, g: Interaction | null): Rect {
  if (!g) return { x: item.x, y: item.y, w: item.w, h: item.h };
  if (g.kind === 'move')
    return { x: item.x + g.dx, y: item.y + g.dy, w: item.w, h: item.h };
  return resizeRectFree(item, g.corner, g.dx);
}

/** The snapped rect a gesture commits (and the ghost previews). */
function commitRect(item: CanvasItemData, g: Interaction): Rect {
  if (g.kind === 'move')
    return {
      x: snap(item.x + g.dx),
      y: snap(item.y + g.dy),
      w: item.w,
      h: item.h,
    };
  return resizeRect(item, g.corner, g.dx);
}

/**
 * The infinite pan/zoom surface. Camera lives on reanimated shared values
 * (use-camera: withDecay fling with content-aware spring landings, withTiming
 * zoom glide, exact cursor anchoring). Everything renders in SCREEN space —
 * grid, items, ghost,
 * chrome each derive their frame from the camera via animated styles; there
 * is no transformed container (Android would clip its children's touch
 * targets). Items free-follow the pointer mid-gesture, preview their snapped
 * landing spot as a ghost, and ease into the committed grid rect on release.
 * Mount with key={canvasId} — a fresh instance per canvas.
 */
export function CanvasView({
  canvasId,
  store,
}: {
  canvasId: string;
  store: NotesStore;
}) {
  const theme = useTheme();
  const { tx, ty, zoom, zoomPercent, api } = useCamera(canvasId);
  const [viewport, setViewport] = useState<Size>({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [interaction, setInteractionState] = useState<Interaction | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const viewportRef = useRef<View>(null);

  const items = useYSnapshot<CanvasItems>(store.itemsMapFor(canvasId));

  // The one in-flight settle animation (single interacting item at a time).
  const settle = {
    x: useSharedValue(0),
    y: useSharedValue(0),
    w: useSharedValue(0),
    h: useSharedValue(0),
  };
  const settleRef = useRef(settle);

  // Undo/redo scoped to this canvas; one manager per mount (key=canvasId).
  const [undoManager] = useState<Y.UndoManager>(() =>
    store.createUndoManager(canvasId)
  );
  useEffect(() => () => undoManager.destroy(), [undoManager]);

  // Current values for the stable gesture handlers; synced every render.
  // selectedId/interaction are also written SYNCHRONOUSLY by the handlers so
  // a begin→change sequence within one frame never reads stale values.
  const live = useRef({ items, selectedId, interaction, viewport });
  useEffect(() => {
    live.current.items = items;
    live.current.viewport = viewport;
  });

  // Stable handler set shared by items and chrome (identity never changes).
  const handlers = useMemo(() => {
    const s = settleRef.current;
    const setSelected = (id: string | null) => {
      live.current.selectedId = id;
      setSelectedIdState(id);
    };
    const setInteraction = (next: Interaction | null) => {
      live.current.interaction = next;
      setInteractionState(next);
    };
    const clearSettle = () => setSettlingId(null);
    const cancelSettle = () => {
      cancelAnimation(s.x);
      cancelAnimation(s.y);
      cancelAnimation(s.w);
      cancelAnimation(s.h);
      setSettlingId(null);
    };
    const startSettle = (id: string, from: Rect, to: Rect) => {
      s.x.value = from.x;
      s.y.value = from.y;
      s.w.value = from.w;
      s.h.value = from.h;
      setSettlingId(id);
      s.x.value = withTiming(to.x, SETTLE, (finished) => {
        if (finished) runOnJS(clearSettle)();
      });
      s.y.value = withTiming(to.y, SETTLE);
      s.w.value = withTiming(to.w, SETTLE);
      s.h.value = withTiming(to.h, SETTLE);
    };
    return {
      select: setSelected,
      begin: (id: string) => {
        cancelSettle();
        setSelected(id);
        undoManager.stopCapturing();
      },
      beginSelected: () => {
        cancelSettle();
        undoManager.stopCapturing();
      },
      moveBy: (changeX: number, changeY: number) => {
        const g = live.current.interaction;
        const z = zoom.value;
        const dx = changeX / z;
        const dy = changeY / z;
        setInteraction(
          g?.kind === 'move'
            ? { ...g, dx: g.dx + dx, dy: g.dy + dy }
            : { kind: 'move', dx, dy }
        );
      },
      resizeBy: (corner: Corner, changeX: number) => {
        const g = live.current.interaction;
        const dx = changeX / zoom.value;
        setInteraction(
          g?.kind === 'resize' && g.corner === corner
            ? { ...g, dx: g.dx + dx }
            : { kind: 'resize', corner, dx }
        );
      },
      end: () => {
        const { selectedId: id, interaction: g, items: current } = live.current;
        setInteraction(null);
        if (!id || !g) return;
        const item = current[id];
        if (!item) return;
        const free = freeRect(item, g);
        const commit = commitRect(item, g);
        if (
          commit.x !== item.x ||
          commit.y !== item.y ||
          commit.w !== item.w ||
          commit.h !== item.h
        )
          store.updateItem(canvasId, id, commit);
        // Ease from the released free rect into the snapped one.
        if (
          free.x !== commit.x ||
          free.y !== commit.y ||
          free.w !== commit.w ||
          free.h !== commit.h
        )
          startSettle(id, free, commit);
      },
      cancel: () => {
        if (live.current.interaction) setInteraction(null);
      },
    };
  }, [undoManager, store, canvasId, zoom]);

  // Scrolling pans and modifiers zoom — the Figma/Miro convention, so a
  // trackpad's two-finger scroll moves the board (macOS adds the momentum).
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const el = viewportRef.current as unknown as HTMLElement | null;
      if (!el || !('getBoundingClientRect' in el)) return;
      const rect = el.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (e.ctrlKey) {
        // Trackpad pinch: continuous input, apply directly.
        api.pinchAt(point, Math.exp(-e.deltaY * PINCH_WHEEL_SENSITIVITY));
      } else if (e.metaKey) {
        // Cmd + mouse wheel: glide toward the compounded target.
        api.glideZoomBy(point, Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY));
      } else {
        api.stopAll();
        const unit = WHEEL_UNIT[e.deltaMode] ?? rect.height;
        let dx = e.deltaX * unit;
        let dy = e.deltaY * unit;
        // Shift + mouse wheel scrolls sideways (most browsers already swap).
        if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
        api.panBy(-dx, -dy);
      }
    },
    [api]
  );
  useWheel(viewportRef, onWheel);

  // Background gestures write straight to the camera shared values.
  const backgroundGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(PAN_MIN_DISTANCE)
      .runOnJS(true)
      .onStart(() => {
        api.stopAll();
        setPanning(true);
      })
      .onChange((e) => api.panBy(e.changeX, e.changeY))
      // Every release resolves a content-aware landing: if an image sits near
      // where the momentum would rest, the camera springs it into view.
      .onEnd((e) =>
        api.fling(e.velocityX, e.velocityY, (natural) =>
          chooseFocusTarget(
            natural,
            live.current.viewport,
            Object.values(live.current.items)
          )
        )
      )
      .onFinalize(() => setPanning(false));
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => api.stopAll())
      .onChange((e) =>
        api.pinchAt({ x: e.focalX, y: e.focalY }, e.scaleChange)
      );
    // Clicking empty canvas (reaches the background only) clears selection.
    const deselect = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_e, success) => {
        if (success) handlers.select(null);
      });
    return Gesture.Simultaneous(pan, pinch, deselect);
  }, [api, handlers]);

  const onIngested = useCallback(
    (image: IngestedImage, index: number) => {
      undoManager.stopCapturing();
      const rect = pasteRectFor(
        { w: image.displayW, h: image.displayH },
        viewport,
        api.snapshot()
      );
      const id = createNoteId();
      store.addItem(canvasId, {
        id,
        x: rect.x + index * GRID,
        y: rect.y + index * GRID,
        w: rect.w,
        h: rect.h,
        z: store.nextZ(canvasId),
        ...image,
      });
      handlers.select(id);
    },
    [undoManager, viewport, api, store, canvasId, handlers]
  );
  usePasteImages(onIngested);

  useCanvasHotkeys({
    onDelete: () => {
      if (!selectedId) return;
      undoManager.stopCapturing();
      void deleteItemWithBlobs(store, canvasId, selectedId);
      handlers.select(null);
    },
    onUndo: () => undoManager.undo(),
    onRedo: () => undoManager.redo(),
  });

  const viewportCenter = () => ({ x: viewport.w / 2, y: viewport.h / 2 });
  const zoomStep = (direction: 1 | -1) =>
    api.glideZoomBy(
      viewportCenter(),
      direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP
    );
  const zoomReset = () => api.glideZoomTo(viewportCenter(), 1);

  const sorted = Object.values(items).sort(
    (a, b) => a.z - b.z || a.id.localeCompare(b.id)
  );
  const selectedItem = selectedId ? (items[selectedId] ?? null) : null;
  const chromeRect = selectedItem ? freeRect(selectedItem, interaction) : null;
  const ghost =
    selectedItem && interaction ? commitRect(selectedItem, interaction) : null;

  return (
    <ThemedView style={styles.root}>
      <View
        ref={viewportRef}
        style={[styles.viewport, webCursor(panning ? 'grabbing' : 'grab')]}
        onLayout={(e) =>
          setViewport({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
      >
        <DotGrid tx={tx} ty={ty} zoom={zoom} />
        <GestureDetector gesture={backgroundGesture}>
          <View style={styles.surface} collapsable={false} />
        </GestureDetector>
        {sorted.map((item) => (
          <CanvasItem
            key={item.id}
            item={item}
            rect={
              item.id === selectedId
                ? freeRect(item, interaction)
                : { x: item.x, y: item.y, w: item.w, h: item.h }
            }
            settling={item.id === settlingId}
            settle={settle}
            tx={tx}
            ty={ty}
            zoom={zoom}
            onBegin={handlers.begin}
            onMoveBy={handlers.moveBy}
            onEnd={handlers.end}
            onCancel={handlers.cancel}
          />
        ))}
        {ghost && (
          <GhostRect
            rect={ghost}
            tx={tx}
            ty={ty}
            zoom={zoom}
            color={theme.textSecondary}
          />
        )}
        {chromeRect && (
          <SelectionChrome
            rect={chromeRect}
            settling={selectedId !== null && selectedId === settlingId}
            settle={settle}
            tx={tx}
            ty={ty}
            zoom={zoom}
            onBegin={handlers.beginSelected}
            onResizeBy={handlers.resizeBy}
            onEnd={handlers.end}
            onCancel={handlers.cancel}
          />
        )}
        <ZoomControl
          percent={zoomPercent}
          onStep={zoomStep}
          onReset={zoomReset}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  surface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
