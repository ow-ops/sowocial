import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { accountKey } from '@/auth/session';
import type { Session } from '@/auth/types';
import { NativeMenu } from '@/components/native-menu';
import { sessionHandle } from '@/components/source-badge';
import { ThemedText } from '@/components/themed-text';
import { Press, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AccountSelectProps = {
  label: string;
  current: Session;
  choices: Session[];
  onSelect: (session: Session) => void;
};

export function AccountSelect({ label, current, choices, onSelect }: AccountSelectProps) {
  const theme = useTheme();
  const currentKey = accountKey(current);
  return (
    <NativeMenu
      label={label}
      trigger="custom"
      groups={[
        {
          key: 'own',
          items: choices.map((s) => ({
            key: accountKey(s),
            title: sessionHandle(s),
            icon: accountKey(s) === currentKey ? 'checkmark' : 'person.crop.circle',
            onPress: () => {
              if (accountKey(s) !== currentKey) onSelect(s);
            },
          })),
        },
      ]}
      renderTrigger={(open, expanded) => (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={label}
          aria-haspopup="menu"
          aria-expanded={expanded}
          style={({ pressed }) => [styles.select, pressed && { opacity: Press.opacity }]}>
          <ThemedText type="meta" themeColor="primary" numberOfLines={1} style={styles.value}>
            {sessionHandle(current)}
          </ThemedText>
          <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more', web: 'unfold_more' }} size={14} tintColor={theme.primary} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    minHeight: TouchTarget,
    flexShrink: 1,
  },
  value: {
    flexShrink: 1,
  },
});
