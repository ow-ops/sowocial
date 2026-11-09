import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  findNodeHandle,
  type HostInstance,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { accountKey, useSession } from '@/auth/session';
import { ThemedText } from '@/components/themed-text';
import { ThreadView } from '@/components/thread-view';
import { Fonts, Hairline, ListPaneWidth, MinSplitHeight, Spacing, WindowClass } from '@/constants/theme';
import { PaneContext, useColumn } from '@/hooks/use-column';
import { DetailContext } from '@/hooks/use-open-in-detail';
import { useTheme } from '@/hooks/use-theme';

// Native tablets only: on web the timeline stays one centered column and posts push /post/[id].
export function ListDetail({ children }: { children: ReactNode }) {
  return Platform.OS === 'web' ? children : <SplitLayout>{children}</SplitLayout>;
}

function SplitLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { tabBarInset } = useColumn();
  const { session } = useSession();
  const account = session ? accountKey(session) : null;
  const windowHeight = useWindowDimensions().height;
  // The window can be wider than the content area (iPad sidebar), so wait for the container.
  const [width, setWidth] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const split = width !== null && width >= WindowClass.expanded && windowHeight >= MinSplitHeight;
  const open = split ? setSelected : null;

  const titleRef = useRef<HostInstance>(null);
  useEffect(() => {
    const node = selected ? findNodeHandle(titleRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [selected]);

  const [resetKey, setResetKey] = useState({ split, account });
  if (resetKey.split !== split || resetKey.account !== account) {
    setResetKey({ split, account });
    setSelected(null);
  }

  return (
    <DetailContext value={open}>
      <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={split ? [styles.list, { borderColor: theme.border }] : styles.single}>
          <PaneContext value={split ? ListPaneWidth : null}>{children}</PaneContext>
        </View>
        {split && (
          <View
            style={[
              styles.detail,
              {
                backgroundColor: theme.page,
                paddingTop: Platform.OS === 'web' ? tabBarInset : insets.top,
              },
            ]}
          >
            <View style={styles.bar}>
              <View
                ref={titleRef}
                accessible
                accessibilityRole="header"
                style={Platform.OS === 'ios' && styles.titleCentered}
              >
                <Text style={[styles.title, { color: theme.heading }]}>{t('profile.listDetail.post')}</Text>
              </View>
              {selected && (
                <Pressable
                  onPress={() => setSelected(null)}
                  style={styles.close}
                  accessibilityLabel={t('profile.listDetail.closePost')}
                  accessibilityRole="button"
                >
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={18}
                    tintColor={theme.primary}
                  />
                </Pressable>
              )}
            </View>
            {selected ? (
              <PaneContext value={(width ?? 0) - ListPaneWidth}>
                <ThreadView key={selected} id={selected} />
              </PaneContext>
            ) : (
              <ThemedText themeColor="muted" style={styles.empty}>
                {t('profile.listDetail.select')}
              </ThemedText>
            )}
          </View>
        )}
      </View>
    </DetailContext>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  single: { flex: 1 },
  list: { width: ListPaneWidth, borderRightWidth: Hairline },
  detail: { flex: 1 },
  bar: {
    minHeight: Platform.OS === 'android' ? 64 : 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: Platform.OS === 'android' ? 22 : 17,
    fontWeight: Platform.OS === 'android' ? undefined : '600',
  },
  titleCentered: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  close: {
    marginLeft: 'auto',
    minWidth: Platform.OS === 'android' ? 48 : 44,
    minHeight: Platform.OS === 'android' ? 48 : 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: Spacing.five, textAlign: 'center' },
});
