import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Row, Section } from '@/components/settings';
import { ThemeSwatches } from '@/components/theme-swatches';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { accountKey } from '@/auth/account-key';
import type { Session } from '@/auth/types';
import { sessionHandle } from '@/components/source-badge';
import { useThemeState } from '@/hooks/use-theme';
import { resolvePalette, selectAccountTheme, selectTheme, themeColors } from '@/theme/store';
import { parseThemeFile, type ThemeKind } from '@/theme/theme-file';

export function ThemeSlot({ kind, account }: { kind: ThemeKind; account?: string }) {
  const { t } = useTranslation();
  const state = useThemeState();
  const themes = state.themes.filter((custom) => custom.kind === kind);
  const selected = account ? state.byAccount[account]?.[kind] : state.selected[kind];
  const choose = (id: string | null) => (account ? selectAccountTheme(account, kind, id) : selectTheme(kind, id));

  return (
    <Section title={kind === 'light' ? t('settings.themes.lightTheme') : t('settings.themes.darkTheme')}>
      {account && (
        <Row
          title={t('settings.accountTheme.same')}
          role="radio"
          selected={selected === undefined}
          leading={<ThemeSwatches colors={resolvePalette(state, kind)} />}
          onPress={() => selectAccountTheme(account, kind, undefined)}
        />
      )}
      <Row
        title={t('settings.themes.default')}
        role="radio"
        selected={selected === null}
        leading={<ThemeSwatches colors={Colors[kind]} />}
        onPress={() => choose(null)}
      />
      {themes.map((custom) => {
        const file = parseThemeFile(custom.css);
        return (
          <Row
            key={custom.id}
            title={custom.name}
            detail={typeof file === 'string' ? undefined : (file.meta.author ?? undefined)}
            role="radio"
            selected={selected === custom.id}
            leading={<ThemeSwatches colors={themeColors(custom.css, kind)} />}
            trailing={
              account ? undefined : (
                <Button
                  label={t('common.edit')}
                  size="small"
                  variant="outline"
                  onPress={() => router.push({ pathname: '/settings/theme/[id]', params: { id: custom.id } })}
                />
              )
            }
            onPress={() => choose(custom.id)}
          />
        );
      })}
      {themes.length === 0 && (
        <ThemedText type="meta">{kind === 'light' ? t('settings.themes.noneLight') : t('settings.themes.noneDark')}</ThemedText>
      )}
    </Section>
  );
}

export function OwnThemeNote({ session }: { session: Session }) {
  const { t } = useTranslation();
  const own = !!useThemeState().byAccount[accountKey(session)];
  if (!own) return null;
  return (
    <Row
      title={t('settings.accountTheme.note', { handle: sessionHandle(session) })}
      chevron
      onPress={() => router.push({ pathname: '/settings/account-theme', params: { account: accountKey(session) } })}
    />
  );
}
