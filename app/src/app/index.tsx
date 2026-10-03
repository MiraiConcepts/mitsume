import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { NotepadScreen } from '@/components/notes/notepad-screen';
import { NotesScreen } from '@/components/notes/notes-screen';
import { useTheme } from '@/hooks/use-theme';

/** Below this width the canvas hides and the notepad fills the window
 * (hitome's wide-layout threshold). Desktop-first for now. */
const SPLIT_MIN_WIDTH = 768;

/**
 * Home: the notepad (40%) beside the image canvas (60%), fixed split. Both
 * panes open the same synced doc. Safe to read the window width directly —
 * the root layout holds a boot screen until hydration has finished.
 */
export default function HomeRoute() {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  if (width < SPLIT_MIN_WIDTH) return <NotepadScreen />;

  return (
    <View style={styles.row}>
      <View style={styles.notepad}>
        <NotepadScreen />
      </View>
      <View
        style={[styles.divider, { backgroundColor: theme.backgroundSelected }]}
      />
      <View style={styles.canvas}>
        <NotesScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
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
});
