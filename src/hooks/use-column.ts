import { createContext, useContext } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import {
  ColumnWidth,
  ColumnWidthExpanded,
  RailWidth,
  WindowClass,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// On web, NativeTabs is a floating pill fixed 24px from the top (40px tall); tab screens
// hide their header and start below it.
const WEB_TAB_BAR_INSET = 24 + 40 + 16;

export const PaneContext = createContext<number | null>(null);
// The width beside the rail, or null when no rail is shown.
export const RailContext = createContext<number | null>(null);

export type ShellLayout = { rail: boolean; railWidth: number; feedWidth: number; margin: number };


const railSpace = (windowWidth: number) => Math.max(RailWidth, Math.floor((windowWidth - ColumnWidth) / 2));

// `columns` keeps the rail narrow so the columns get the rest of the window; otherwise the rail
// takes whatever centres a single feed column.
export function shellLayout(windowWidth: number, columns = false): ShellLayout {
  if (windowWidth < WindowClass.rail) return { rail: false, railWidth: 0, feedWidth: windowWidth, margin: 0 };
  const railWidth = columns ? RailWidth : railSpace(windowWidth);
  return { rail: true, railWidth, feedWidth: windowWidth - railWidth, margin: 0 };
}

export function useColumn() {
  const windowWidth = useWindowDimensions().width;
  const theme = useTheme();
  const paneWidth = useContext(PaneContext);
  const inPane = paneWidth !== null;
  const web = Platform.OS === 'web';
  const feedWidth = useContext(RailContext);
  const railShown = feedWidth !== null;
  const rail = railShown && !inPane;
  const width = paneWidth ?? feedWidth ?? windowWidth;
  const columnWidth = rail
    ? ColumnWidth
    : windowWidth >= WindowClass.expanded && !web
      ? ColumnWidthExpanded
      : ColumnWidth;
  const wide = width >= ColumnWidth;
  const free = wide && !inPane ? width - columnWidth : 0;
  const gutterLeft = rail ? 0 : Math.floor(free / 2);
  const gutterRight = free - gutterLeft;

  return {
    width,
    wide,
    web,
    rail,
    columnWidth,
    card: wide && web && !inPane,
    tabBarInset: web && !railShown ? WEB_TAB_BAR_INSET : 0,
    gutter: gutterRight,
    gutterLeft,
    gutterRight,
    listStyle: { backgroundColor: wide && !inPane ? theme.canvas : theme.page },
    contentStyle: { paddingLeft: gutterLeft, paddingRight: gutterRight },
  };
}
