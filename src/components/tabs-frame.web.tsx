import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { SideRail } from '@/components/side-rail';
import { RailContext, shellLayout } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import { usePref } from '@/prefs/store';

import '@/theme/web-rail.css';

export function TabsFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { rail, railWidth, feedWidth, margin } = shellLayout(useWindowDimensions().width, usePref('columns'));

  useEffect(() => {
    document.documentElement.toggleAttribute('data-sowocial-rail', rail);
    return () => document.documentElement.removeAttribute('data-sowocial-rail');
  }, [rail]);

  return (
    <RailContext value={rail ? feedWidth : null}>
      <View style={[styles.frame, rail && { paddingLeft: margin, backgroundColor: theme.canvas }]}>
        {rail && (
          <View style={[styles.railSlot, { width: railWidth }]}>
            <SideRail />
          </View>
        )}
        <View style={rail ? { width: feedWidth } : styles.content}>{children}</View>
      </View>
    </RailContext>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
  railSlot: { alignItems: 'flex-end' },
});
