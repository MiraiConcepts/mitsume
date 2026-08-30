import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openNotes } from '@/notes/doc';
import { notepadText, setNotepadText } from '@/notes/notepad';
import { useYSnapshot } from '@/notes/use-y-snapshot';

import type { NotesHandle } from '@/notes/doc';
import type { TextStyle } from 'react-native';

/**
 * The notepad: one free-form text field over the shared doc. Rendering waits
 * on the local cache so the first paint never flashes an empty note over text
 * that is about to load; the server's copy merges in whenever it arrives,
 * which for a Y.Text root needs no seed and so no wait on the first sync.
 */
export function NotepadScreen() {
  const [handle, setHandle] = useState<NotesHandle | null>(null);
  useEffect(() => {
    let live = true;
    const h = openNotes();
    void h.ready.then(() => {
      if (live) setHandle(h);
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
  return <NotepadReady handle={handle} />;
}

function NotepadReady({ handle }: { handle: NotesHandle }) {
  const theme = useTheme();
  // Pad the FIELD rather than inset the container, so the tap target still
  // covers the whole screen while the text itself clears Android's status
  // bar and gesture pill. Zero on web, where the page owns its own chrome.
  const insets = useSafeAreaInsets();
  // Y.Text.toJSON() is the body as a string, and observeDeep fires for both
  // local keystrokes and remote updates — so the snapshot hook the canvas
  // uses works here unchanged.
  const value = useYSnapshot<string>(notepadText(handle.doc));

  return (
    <ThemedView style={styles.root}>
      <TextInput
        value={value}
        onChangeText={(next) => setNotepadText(handle.doc, next)}
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
            paddingLeft: Spacing.four + insets.left,
            paddingRight: Spacing.four + insets.right,
          },
        ]}
      />
    </ThemedView>
  );
}

// RN Web renders a multiline TextInput as a <textarea> and draws a focus ring
// around it. The field IS the whole screen here, so that ring is an outline
// around the viewport — not in the RN style types, hence the cast.
const noFocusRing = Platform.select({
  web: { outlineStyle: 'none' } as unknown as TextStyle,
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
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
