import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Children, createContext, Fragment, isValidElement, use, type ReactElement, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { ThemedText } from '@/components/themed-text';
import { ColumnWidth, Hairline, Outlined, Press, Radius, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';

export function SettingsScreen({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  const column = useColumn();
  return (
    <>
      {title && <Stack.Screen options={{ title }} />}
      <KeyboardAwareScrollView
        style={column.listStyle}
        contentContainerStyle={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        bottomOffset={Spacing.three}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.column, { backgroundColor: theme.page }]}>{children}</View>
      </KeyboardAwareScrollView>
    </>
  );
}

const GroupContext = createContext(false);

function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement(child) && child.type === Fragment
      ? flatten((child as ReactElement<{ children?: ReactNode }>).props.children)
      : [child],
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const blocks: ReactNode[][] = [];
  let previousWasRow = false;
  for (const child of flatten(children)) {
    const isRow = isValidElement(child) && child.type === Row;
    if (isRow && previousWasRow) blocks[blocks.length - 1].push(child);
    else blocks.push([child]);
    previousWasRow = isRow;
  }

  return (
    <View style={styles.section} accessibilityRole="none">
      <ThemedText
        type={Platform.OS === 'ios' ? 'meta' : 'label'}
        themeColor={Platform.OS === 'android' ? 'primary' : undefined}
        style={Platform.OS === 'ios' ? styles.iosTitle : styles.title}
        accessibilityRole="header">
        {title}
      </ThemedText>
      {blocks.map((block, index) =>
        isValidElement(block[0]) && block[0].type === Row ? (
          <View key={index} style={[styles.group, { backgroundColor: theme.surface }]}>
            <GroupContext value>
              {block.map((row, i) => (
                <Fragment key={(row as ReactElement).key ?? i}>
                  {i > 0 && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                  {row}
                </Fragment>
              ))}
            </GroupContext>
          </View>
        ) : (
          <Fragment key={index}>{block}</Fragment>
        ),
      )}
    </View>
  );
}

type RowProps = {
  title: string;
  detail?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  role?: 'button' | 'radio' | 'switch';
  chevron?: boolean;
};

export function Row({ title, detail, leading, trailing, onPress, selected, role, chevron }: RowProps) {
  const theme = useTheme();
  const grouped = use(GroupContext);
  const accessibilityRole = role ?? (onPress ? 'button' : undefined);
  // The pressable area and trailing controls are siblings so VoiceOver can reach both.
  return (
    <View style={[styles.rowShell, !grouped && [styles.card, { borderColor: selected ? theme.primary : theme.border }]]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessible={accessibilityRole ? undefined : false}
        accessibilityRole={accessibilityRole}
        accessibilityState={role === 'radio' || role === 'switch' ? { checked: !!selected } : undefined}
        style={({ pressed }) => [
          styles.row,
          trailing ? styles.rowWithTrailing : null,
          grouped ? pressed && { backgroundColor: theme.border } : pressed && { opacity: Press.opacity },
        ]}>
        {leading}
        <View style={styles.rowText}>
          <ThemedText type="name">{title}</ThemedText>
          {detail ? <ThemedText type="meta">{detail}</ThemedText> : null}
        </View>
        {grouped && role === 'radio' && (
          <View style={styles.check}>
            {selected && (
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={16}
                tintColor={theme.primary}
              />
            )}
          </View>
        )}
        {chevron && (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={theme.muted}
          />
        )}
      </Pressable>
      {trailing ? (
        // A switch row has switch semantics already; hiding the inner control avoids a double focus stop.
        <View
          style={styles.trailing}
          accessibilityElementsHidden={role === 'switch'}
          importantForAccessibility={role === 'switch' ? 'no-hide-descendants' : 'auto'}>
          {trailing}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: ColumnWidth,
    padding: Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  title: {
    paddingHorizontal: Spacing.three,
  },
  iosTitle: {
    paddingHorizontal: Spacing.three,
    textTransform: 'uppercase',
  },
  group: {
    overflow: 'hidden',
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  separator: {
    height: Hairline,
    marginLeft: Spacing.three,
  },
  rowShell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowWithTrailing: {
    paddingRight: Spacing.three,
  },
  trailing: {
    paddingRight: Spacing.three,
  },
  card: {
    ...Outlined,
  },
  check: {
    width: 16,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
});
