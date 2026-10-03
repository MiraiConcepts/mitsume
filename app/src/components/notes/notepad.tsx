import { Platform, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useYSnapshot } from '@/notes/use-y-snapshot';

import type { NotesStore } from '@/notes/store';
import type { TextStyle } from 'react-native';

/**
 * A leaf's notepad: one free-form text field over its Y.Text. Mount with
 * key={leafId} — a fresh instance per leaf, like the canvas.
 */
export function Notepad({
  leafId,
  store,
}: {
  leafId: string;
  store: NotesStore;
}) {
  const theme = useTheme();
  // Pad the FIELD rather than inset the container, so the tap target still
  // covers the whole pane while the text itself clears Android's status
  // bar and gesture pill. Zero on web, where the page owns its own chrome.
  const insets = useSafeAreaInsets();
  // Y.Text.toJSON() is the body as a string, and observeDeep fires for both
  // local keystrokes and remote updates — so the snapshot hook the canvas
  // uses works here unchanged.
  const value = useYSnapshot<string>(store.notepadFor(leafId));

  return (
    <ThemedView style={styles.root}>
      <TextInput
        value={value}
        onChangeText={(next) => store.setNotepadText(leafId, next)}
        multiline
        // Android centers a multiline field's first line without this.
        textAlignVertical="top"
        placeholder="Start typing…"
        placeholderTextColor={theme.textSecondary}
        // Web opens with the caret ready. On Android the same prop throws the
        // keyboard up over the note before you have asked for it.
        autoFocus={Platform.OS === 'web'}
        style={[
          styles.input,
          {
            color: theme.text,
            paddingTop: Spacing.four + insets.top,
            paddingBottom: Spacing.four + insets.bottom,
            paddingLeft: Spacing.four,
            paddingRight: Spacing.four + insets.right,
          },
        ]}
      />
    </ThemedView>
  );
}

// RN Web renders a multiline TextInput as a <textarea> and draws a focus ring
// around it. The field IS the whole pane here, so that ring is an outline
// around the pane — not in the RN style types, hence the cast.
const noFocusRing = Platform.select({
  web: { outlineStyle: 'none' } as unknown as TextStyle,
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  input: {
    flex: 1,
    // Padding is applied inline — it has to fold in the safe-area insets.
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    ...noFocusRing,
  },
});
