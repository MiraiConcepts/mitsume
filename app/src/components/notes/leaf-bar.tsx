import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddIcon, LeafIcon } from '@/components/icons';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, OnAccentColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { LeafMeta } from '@/notes/types';
import type { ViewStyle } from 'react-native';

const BUTTON_SIZE = 40;
const ICON_SIZE = 22;
const GAP = Spacing.two;
/** One rail slot: a button plus the gap below it. */
const STEP = BUTTON_SIZE + GAP;
/** Distinguishes a drag from a click. */
const DRAG_MIN_DISTANCE = 4;

const webCursor = (cursor: string): ViewStyle | undefined =>
  Platform.OS === 'web' ? ({ cursor } as unknown as ViewStyle) : undefined;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * The rail on the far left: one circular icon per leaf (the open one filled
 * with the accent color), plus + at the end to add a leaf via the icon picker.
 * Right-click a leaf (long-press on Android) to delete it; drag one up or down
 * with the mouse to reorder (web only — long-press is delete on Android).
 */
export function LeafBar({
  leaves,
  activeId,
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: {
  leaves: LeafMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The leaf being dragged and how far. Ephemeral — only the drop is written
  // to the doc, so peers see one move, not every pixel of it.
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);

  const targetIndex = useCallback(
    (id: string, dy: number) => {
      const from = leaves.findIndex((leaf) => leaf.id === id);
      return clamp(from + Math.round(dy / STEP), 0, leaves.length - 1);
    },
    [leaves]
  );
  const onDrag = useCallback((id: string, dy: number) => {
    setDrag({ id, dy });
  }, []);
  const onDrop = useCallback(
    (id: string, dy: number) => {
      setDrag(null);
      const from = leaves.findIndex((leaf) => leaf.id === id);
      const to = targetIndex(id, dy);
      if (to !== from) onMove(id, to);
    },
    [leaves, targetIndex, onMove]
  );
  const onCancel = useCallback(() => setDrag(null), []);

  // Mid-drag the list keeps its order (moving DOM nodes would drop the
  // pointer); the dragged button follows the pointer and the ones it passes
  // shift a slot to make room.
  const from = drag ? leaves.findIndex((leaf) => leaf.id === drag.id) : -1;
  const to = drag ? targetIndex(drag.id, drag.dy) : -1;
  const offsetAt = (index: number): number => {
    if (!drag) return 0;
    if (index === from) return drag.dy;
    if (from < to && index > from && index <= to) return -STEP;
    if (to < from && index >= to && index < from) return STEP;
    return 0;
  };

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.bar, { width: styles.bar.width + insets.left }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.list,
          {
            paddingTop: Spacing.three + insets.top,
            paddingBottom: Spacing.three + insets.bottom,
            paddingLeft: insets.left,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {leaves.map((leaf, index) => (
          <LeafButton
            key={leaf.id}
            leaf={leaf}
            active={leaf.id === activeId}
            dragging={leaf.id === drag?.id}
            offset={offsetAt(index)}
            onSelect={onSelect}
            onDelete={onDelete}
            onDrag={onDrag}
            onDrop={onDrop}
            onCancel={onCancel}
          />
        ))}
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <View
            style={[styles.button, { borderColor: theme.backgroundSelected }]}
          >
            <AddIcon size={ICON_SIZE} color={theme.textSecondary} />
          </View>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function LeafButton({
  leaf,
  active,
  dragging,
  offset,
  onSelect,
  onDelete,
  onDrag,
  onDrop,
  onCancel,
}: {
  leaf: LeafMeta;
  active: boolean;
  dragging: boolean;
  offset: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDrag: (id: string, dy: number) => void;
  onDrop: (id: string, dy: number) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const { id } = leaf;
  // Gestures must stay referentially stable while one runs (a recreated
  // gesture detaches mid-drag), so the callbacks they close over are stable
  // too — the rail's drag state changes every move, these don't.
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_, success) => {
        if (success) onSelect(id);
      });
    const start = { y: 0 };
    // Distance from where the pointer went DOWN: RNGH's translation on web
    // counts from where the pan activated, which drops the activation slop
    // (and all of a coarse pointer jump).
    const drag = Gesture.Pan()
      .enabled(Platform.OS === 'web')
      .minDistance(DRAG_MIN_DISTANCE)
      .runOnJS(true)
      .onBegin((e) => {
        start.y = e.absoluteY;
      })
      .onUpdate((e) => onDrag(id, e.absoluteY - start.y))
      .onEnd((e) => onDrop(id, e.absoluteY - start.y))
      .onFinalize((_, success) => {
        if (!success) onCancel();
      });
    const hold = Gesture.LongPress()
      .enabled(Platform.OS !== 'web')
      .runOnJS(true)
      .onStart(() => onDelete(id));
    return Gesture.Race(drag, hold, tap);
  }, [id, onSelect, onDelete, onDrag, onDrop, onCancel]);

  // Right-click is a DOM event RN's types don't list; RN Web forwards it.
  const contextMenu =
    Platform.OS === 'web'
      ? {
          onContextMenu: (e: { preventDefault: () => void }) => {
            e.preventDefault();
            onDelete(id);
          },
        }
      : {};

  return (
    <GestureDetector gesture={gesture}>
      <View
        {...contextMenu}
        style={[
          styles.button,
          webCursor(dragging ? 'grabbing' : 'pointer'),
          {
            backgroundColor: active ? AccentColor : 'transparent',
            borderColor: active ? AccentColor : theme.textSecondary,
            transform: [{ translateY: offset }],
          },
          dragging && styles.dragging,
        ]}
        collapsable={false}
      >
        <LeafIcon
          name={leaf.icon}
          size={ICON_SIZE}
          color={active ? OnAccentColor : theme.textSecondary}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: 56,
  },
  list: {
    alignItems: 'center',
    gap: GAP,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    // Circular per the rail's reference design (an intentional exception
    // to the app's 4px radius convention).
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragging: {
    zIndex: 1,
    opacity: 0.85,
  },
  pressed: {
    opacity: 0.7,
  },
});
