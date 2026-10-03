import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isTextItem } from '@/notes/types';
import { useBlobUrl } from '@/notes/use-blob-url';

import type { Rect } from '@/notes/canvas-math';
import type { CanvasItem as CanvasItemData } from '@/notes/types';
import type { SettleRect } from './settle';
import type { SharedValue } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

const DRAG_MIN_DISTANCE = 2;

const webCursor = (cursor: string): ViewStyle | undefined =>
  Platform.OS === 'web' ? ({ cursor } as unknown as ViewStyle) : undefined;

/**
 * One card on the canvas — an image, or a text chunk of the notes —
 * positioned in SCREEN space by its own animated
 * style (translate = world·zoom + t, scaled about the top-left corner).
 * Screen-space positioning — not a transformed container — is what makes
 * hit-testing work on Android too (children outside a parent's bounds never
 * receive touches there) and lets items ride the camera animations frame by
 * frame. `rect` free-follows the pointer mid-gesture; while `settling`, the
 * shared settle rect eases the item into its committed snapped values.
 * Handlers must be referentially stable (RNGH detaches recreated gestures).
 */
export function CanvasItem({
  item,
  rect,
  settling,
  settle,
  tx,
  ty,
  zoom,
  onBegin,
  onMoveBy,
  onEnd,
  onCancel,
}: {
  item: CanvasItemData;
  rect: Rect;
  settling: boolean;
  settle: SettleRect;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  zoom: SharedValue<number>;
  onBegin: (id: string) => void;
  onMoveBy: (changeX: number, changeY: number) => void;
  onEnd: () => void;
  onCancel: () => void;
}) {
  const move = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(DRAG_MIN_DISTANCE)
        .runOnJS(true)
        .onBegin(() => onBegin(item.id))
        .onChange((e) => onMoveBy(e.changeX, e.changeY))
        .onEnd(onEnd)
        .onFinalize(onCancel),
    [item.id, onBegin, onMoveBy, onEnd, onCancel]
  );

  const animated = useAnimatedStyle(() => {
    const z = zoom.value;
    const x = settling ? settle.x.value : rect.x;
    const y = settling ? settle.y.value : rect.y;
    const w = settling ? settle.w.value : rect.w;
    const h = settling ? settle.h.value : rect.h;
    return {
      width: w,
      height: h,
      transform: [
        { translateX: x * z + tx.value },
        { translateY: y * z + ty.value },
        { scale: z },
      ],
    };
  });

  return (
    <GestureDetector gesture={move}>
      <Animated.View
        style={[
          styles.item,
          webCursor('pointer'),
          { zIndex: item.z },
          animated,
        ]}
        collapsable={false}
      >
        {isTextItem(item) ? (
          <TextCard text={item.text} />
        ) : (
          <ImageCard hash={item.displayHash} />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function ImageCard({ hash }: { hash: string }) {
  const url = useBlobUrl(hash);
  return url ? (
    <Image source={{ uri: url }} style={styles.image} contentFit="fill" />
  ) : (
    <Animated.View style={styles.placeholder} />
  );
}

/** A text chunk's card: its text, cut off where the card ends. */
function TextCard({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.textCard, { borderColor: theme.backgroundSelected }]}
    >
      <ThemedText style={styles.text}>{text}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  item: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
  image: {
    width: '100%',
    height: '100%',
    // The container owns pointer events — keeps the web <img> from starting
    // a native HTML5 drag mid-gesture.
    pointerEvents: 'none',
  },
  textCard: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two + Spacing.one,
    // Same as the image: the container owns pointer events, so dragging a
    // card never starts a text selection.
    pointerEvents: 'none',
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(128,128,128,0.15)',
    pointerEvents: 'none',
  },
});
