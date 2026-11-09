import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useHomeSources } from '@/api/home-sources';
import { useSession } from '@/auth/session';
import { Badge } from '@/components/badge';
import { Row, Section, SettingsScreen } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { isAvailable, keyLabel, SHORTCUT_GROUPS } from '@/shortcuts/definitions';

function Key({ children }: { children: string }) {
  return <Badge style={styles.key}>{children}</Badge>;
}

function Combos({ keys }: { keys: string[] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.combos}>
      {keys.map((combo, i) => (
        <Fragment key={combo}>
          {i > 0 && <ThemedText type="meta">{t('shortcuts.or')}</ThemedText>}
          {combo.split(' ').map((press, j) => (
            <Fragment key={press}>
              {j > 0 && <ThemedText type="meta">{t('shortcuts.then')}</ThemedText>}
              <Key>{keyLabel(press)}</Key>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </View>
  );
}

export default function ShortcutsScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { accounts } = useHomeSources();
  const context = { protocol: session?.protocol ?? 'ap', mixed: !!accounts } as const;
  return (
    <SettingsScreen title={t('shortcuts.title')}>
      {SHORTCUT_GROUPS.map((group) => (
        <Section key={group.id} title={t(`shortcuts.groups.${group.id}`)}>
          {group.shortcuts
            .filter(({ action }) => isAvailable(action, context))
            .map(({ action, keys }) => (
              <Row key={action} title={t(`shortcuts.actions.${action}`)} trailing={<Combos keys={keys} />} />
            ))}
        </Section>
      ))}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  combos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  key: {
    minWidth: 24,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
});
