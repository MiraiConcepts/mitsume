import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { CanvasIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CanvasIconBodies } from '@/constants/icon-paths';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { CanvasIconName } from '@/constants/icon-paths';

const ICONS = Object.keys(CanvasIconBodies) as CanvasIconName[];
const CELL_SIZE = 48;
const ICON_SIZE = 24;

/**
 * "New canvas" dialog: pick an icon from the curated Basil set and the
 * canvas is created immediately.
 */
export function IconPicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (icon: CanvasIconName) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">New canvas</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Pick an icon for it.
          </ThemedText>
          <View style={styles.grid}>
            {ICONS.map((name) => (
              <Pressable
                key={name}
                onPress={() => onPick(name)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <View
                  style={[styles.cell, { borderColor: theme.textSecondary }]}
                >
                  <CanvasIcon
                    name={name}
                    size={ICON_SIZE}
                    color={theme.textSecondary}
                  />
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.cancel}
            >
              Cancel
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  card: {
    borderRadius: Spacing.one,
    width: '100%',
    maxWidth: 360,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    textAlign: 'center',
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
