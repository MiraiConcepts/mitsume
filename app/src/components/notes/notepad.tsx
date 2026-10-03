import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isTextItem } from '@/notes/types';
import { useBlobUrl } from '@/notes/use-blob-url';
import { useYSnapshot } from '@/notes/use-y-snapshot';

import { usePasteImages } from './use-paste';

import type { NotesStore } from '@/notes/store';
import type {
  CanvasItems,
  ImageItem,
  IngestedImage,
  TextItem,
} from '@/notes/types';
import type {
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  TextStyle,
} from 'react-native';

/** A line that is only `---` splits a chunk there (the Markdown divider). */
const SPLIT = /(^|\n)---[ \t]*(\n|$)/;

/** Where the caret should go once the field it belongs to has rendered. */
type Focus = { id: string; caret: number };

/**
 * A leaf's notes: its chunks in notes order, each one a card on the canvas
 * too. Text chunks are plain fields, image chunks show the picture, and a
 * thin line separates them. Typing `---` on its own line splits a chunk;
 * Backspace at the start of one merges it into the text chunk above. Mount
 * with key={leafId} — a fresh instance per leaf, like the canvas.
 */
export function Notepad({
  leafId,
  store,
}: {
  leafId: string;
  store: NotesStore;
}) {
  const theme = useTheme();
  // Pad the column rather than inset the pane, so the text clears Android's
  // status bar and gesture pill. Zero on web, where the page owns its chrome.
  const insets = useSafeAreaInsets();

  // Both snapshots are change signals; the store keeps the one ordering rule.
  const items = useYSnapshot<CanvasItems>(store.itemsMapFor(leafId));
  const list = useYSnapshot<string[]>(store.chunkListFor(leafId));
  const chunks = useMemo(
    () =>
      store
        .chunkOrder(leafId)
        .map((id) => items[id])
        .filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list IS a change signal
    [store, leafId, items, list]
  );
  const last = chunks.at(-1);
  // Somewhere to type after an image, and the whole page when empty.
  const tail = !last || !isTextItem(last);

  const fields = useRef(new Map<string, TextInput>());
  const pendingFocus = useRef<Focus | null>(null);
  // The chunk an image pasted into the notes goes after: the focused one,
  // or (from the tail field) the last; undefined when no field is focused.
  const pasteAfter = useRef<string | null | undefined>(undefined);
  // Native has no DOM caret to read, so it is tracked from selection events.
  const carets = useRef(new Map<string, { start: number; end: number }>());

  // After a split or merge, put the caret in the field it now belongs to.
  useEffect(() => {
    const focus = pendingFocus.current;
    const field = focus && fields.current.get(focus.id);
    if (!focus || !field) return;
    pendingFocus.current = null;
    field.focus();
    setCaret(field, focus.caret);
  });

  const onChange = (id: string, next: string) => {
    // One paste can hold several dividers: split at each in turn.
    let current = id;
    let rest = next;
    let match = SPLIT.exec(rest);
    if (!match) {
      store.setChunkText(leafId, id, next);
      return;
    }
    while (match) {
      const before = rest.slice(0, match.index);
      rest = rest.slice(match.index + match[0].length);
      current = store.splitChunk(leafId, current, before, rest);
      match = SPLIT.exec(rest);
    }
    pendingFocus.current = { id: current, caret: 0 };
  };

  const onKeyPress = (
    id: string,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (e.nativeEvent.key !== 'Backspace') return;
    const caret = caretOf(e.target) ?? carets.current.get(id);
    if (!caret || caret.start !== 0 || caret.end !== 0) return;
    const merged = store.mergeChunkUp(leafId, id);
    if (!merged) return;
    e.preventDefault();
    pendingFocus.current = merged;
  };

  const onTailChange = (next: string) => {
    const id = store.insertTextChunk(leafId, last?.id ?? null, '');
    onChange(id, next);
    pendingFocus.current ??= { id, caret: next.length };
  };

  const lastPasted = useRef<string | null>(null);
  const onIngested = useCallback(
    (image: IngestedImage, index: number) => {
      const after = index === 0 ? pasteAfter.current : lastPasted.current;
      if (after === undefined) return;
      lastPasted.current = store.addImageChunk(leafId, after, image);
    },
    [store, leafId]
  );
  usePasteImages(onIngested, 'text');

  const textStyle: TextStyle[] = [styles.text, { color: theme.text }];

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.column,
          {
            paddingTop: Spacing.four + insets.top,
            paddingBottom: Spacing.four + insets.bottom,
            paddingRight: Spacing.four + insets.right,
          },
        ]}
      >
        {chunks.map((item, index) => (
          <View
            key={item.id}
            // The last text chunk fills the rest of the pane, so a click
            // anywhere below the notes lands in it.
            style={!tail && index === chunks.length - 1 && styles.grow}
          >
            {index > 0 && (
              <View
                style={[
                  styles.divider,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              />
            )}
            {isTextItem(item) ? (
              <TextChunk
                item={item}
                style={
                  !tail && index === chunks.length - 1
                    ? [...textStyle, styles.grow]
                    : textStyle
                }
                placeholder={chunks.length === 1 ? 'Start typing…' : undefined}
                placeholderColor={theme.textSecondary}
                register={(field) => {
                  if (field) fields.current.set(item.id, field);
                  else fields.current.delete(item.id);
                }}
                onChange={(next) => onChange(item.id, next)}
                onKeyPress={(e) => onKeyPress(item.id, e)}
                onCaret={(caret) => carets.current.set(item.id, caret)}
                onFocus={() => {
                  pasteAfter.current = item.id;
                }}
                onBlur={() => {
                  pasteAfter.current = undefined;
                }}
              />
            ) : (
              <ImageChunk item={item} />
            )}
          </View>
        ))}
        {tail && (
          <TextInput
            value=""
            onChangeText={onTailChange}
            multiline
            textAlignVertical="top"
            placeholder="Start typing…"
            placeholderTextColor={theme.textSecondary}
            // Web opens an empty leaf with the caret ready. On Android the
            // same prop throws the keyboard up before you have asked for it.
            autoFocus={Platform.OS === 'web' && !last}
            onFocus={() => {
              pasteAfter.current = last?.id ?? null;
            }}
            onBlur={() => {
              pasteAfter.current = undefined;
            }}
            style={[...textStyle, styles.grow, last && styles.tailAfterImage]}
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

function TextChunk({
  item,
  style,
  placeholder,
  placeholderColor,
  register,
  onChange,
  onKeyPress,
  onCaret,
  onFocus,
  onBlur,
}: {
  item: TextItem;
  style: TextStyle[];
  placeholder: string | undefined;
  placeholderColor: string;
  register: (field: TextInput | null) => void;
  onChange: (next: string) => void;
  onKeyPress: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  onCaret: (caret: { start: number; end: number }) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <TextInput
      ref={register}
      value={item.text}
      onChangeText={onChange}
      onKeyPress={onKeyPress}
      onSelectionChange={(e) => onCaret(e.nativeEvent.selection)}
      onFocus={onFocus}
      onBlur={onBlur}
      multiline
      // Android centers a multiline field's first line without this.
      textAlignVertical="top"
      placeholder={placeholder}
      placeholderTextColor={placeholderColor}
      style={style}
    />
  );
}

function ImageChunk({ item }: { item: ImageItem }) {
  const url = useBlobUrl(item.displayHash);
  const aspectRatio = item.displayW / item.displayH;
  return url ? (
    <Image
      source={{ uri: url }}
      style={[styles.image, { aspectRatio }]}
      contentFit="contain"
    />
  ) : (
    <View style={[styles.image, styles.placeholder, { aspectRatio }]} />
  );
}

/** The caret on web, read off the textarea (selection events lag there). */
function caretOf(target: unknown): { start: number; end: number } | null {
  const field = target as { selectionStart?: number; selectionEnd?: number };
  return typeof field?.selectionStart === 'number'
    ? { start: field.selectionStart, end: field.selectionEnd ?? 0 }
    : null;
}

function setCaret(field: TextInput, caret: number) {
  // Web hands back the textarea itself; native has setSelection.
  const target = field as unknown as {
    setSelectionRange?: (start: number, end: number) => void;
  };
  if (target.setSelectionRange) target.setSelectionRange(caret, caret);
  else field.setSelection(caret, caret);
}

// RN Web renders a multiline TextInput as a <textarea>: drop the focus ring
// (the fields are borderless page text) and size each one to its content —
// field-sizing isn't in the RN style types, hence the cast. Native multiline
// fields already grow with their text.
const webText = Platform.select({
  web: { outlineStyle: 'none', fieldSizing: 'content' } as unknown as TextStyle,
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  column: {
    paddingLeft: Spacing.four,
    flexGrow: 1,
  },
  text: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 24,
    padding: 0,
    ...webText,
  },
  grow: {
    flexGrow: 1,
  },
  tailAfterImage: {
    marginTop: Spacing.three,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.three,
  },
  image: {
    width: '100%',
    borderRadius: Spacing.one,
  },
  placeholder: {
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
});
