import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentRef,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { accountKey } from '@/auth/account-key';
import { useAuthedSession } from '@/auth/session';
import { ColumnVisibleContext } from '@/api/ap/streaming';
import { useCapabilities } from '@/api/backend';
import { useFollowedTags } from '@/api/ap/tags';
import { useFeedGenerator, useSavedFeeds } from '@/api/bsky/feeds';
import { useList, useLists } from '@/api/lists';
import { Button } from '@/components/button';
import { ListPosts } from '@/components/list-posts';
import type { MenuAction } from '@/components/menu-actions';
import { NativeMenu } from '@/components/native-menu';
import { FeedPosts } from '@/components/feed-posts';
import { NotificationsFeed } from '@/components/notifications-feed';
import { TagPosts } from '@/components/tag-posts';
import { TextField } from '@/components/text-field';
import { TimelinePosts } from '@/components/timeline-posts';
import { ThemedText } from '@/components/themed-text';
import { DeckColumnWidth, Hairline, Press, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { ColumnActiveContext } from '@/shortcuts/column-focus.web';
import { PaneContext, useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import { usePref } from '@/prefs/store';
import {
  activeColumnKey,
  addColumn,
  columnId,
  columnKey,
  columnKindsFor,
  FIXED_KINDS,
  KEYED_KINDS,
  moveColumn,
  readColumns,
  removeColumn,
  saveColumns,
  showColumns,
  type Column,
  type ColumnKind,
  type KeyedKind,
} from '@/utils/columns';

const ADD_WIDTH = 220;
// The active column's header rule is thicker, so the cue survives without the colour change.
const ACTIVE_RULE = 2;
const FOCUS_RING = 2;

// Web only renders the `web` name; a bare SF Symbol string would draw nothing.
type WebSymbol = Required<Extract<SymbolViewProps['name'], object>>;
type ViewRef = ComponentRef<typeof View>;
type ScrollerRef = { current: ComponentRef<typeof ScrollView> | null };

export function useColumnsEnabled() {
  const enabled = usePref('columns');
  const { width } = useColumn();
  return enabled && showColumns(width);
}

export function HomeColumns() {
  const account = accountKey(useAuthedSession());
  return <ColumnRow key={account} account={account} />;
}

function ColumnRow({ account }: { account: string }) {
  const theme = useTheme();
  const kinds = columnKindsFor(useCapabilities());
  const [columns, setColumns] = useState(() => readColumns(account, kinds));
  const [active, setActive] = useState<string | null>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const activeKey = activeColumnKey(columns, active);

  useEffect(() => {
    saveColumns(account, columns);
  }, [account, columns]);

  const onMove = useCallback(
    (column: Column, delta: 1 | -1) => setColumns((all) => moveColumn(all, column, delta)),
    [],
  );
  const onRemove = useCallback((column: Column) => setColumns((all) => removeColumn(all, column)), []);
  const onAdd = useCallback((column: Column) => setColumns((all) => addColumn(all, column)), []);

  return (
    <View nativeID="sowocial-columns" style={[styles.row, { backgroundColor: theme.canvas }]}>
      <style href="sowocial-columns" precedence="default">
        {`#sowocial-columns [role='button']:focus-visible { outline: ${FOCUS_RING}px solid ${theme.primary}; outline-offset: -${FOCUS_RING}px; }`}
      </style>
      <ScrollView ref={scroller} horizontal style={styles.scroller}>
        {columns.map((column, index) => {
          const key = columnKey(column);
          return (
            <ColumnPane
              key={key}
              column={column}
              scroller={scroller}
              active={key === activeKey}
              first={index === 0}
              last={index === columns.length - 1}
              onActivate={setActive}
              onMove={onMove}
              onRemove={onRemove}
            />
          );
        })}
        <AddColumn kinds={kinds} columns={columns} onAdd={onAdd} />
      </ScrollView>
    </View>
  );
}

const ColumnPane = memo(function ColumnPane({
  column,
  scroller,
  active,
  first,
  last,
  onActivate,
  onMove,
  onRemove,
}: {
  column: Column;
  scroller: ScrollerRef;
  active: boolean;
  first: boolean;
  last: boolean;
  onActivate: (key: string) => void;
  onMove: (column: Column, delta: 1 | -1) => void;
  onRemove: (column: Column) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { useTitle, Body } = PARTS[column.kind];
  const id = columnId(column);
  const title = useTitle(id);
  const activate = () => onActivate(columnKey(column));
  const pane = useRef<ViewRef>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = pane.current as unknown as HTMLElement | null;
    const root = scroller.current?.getScrollableNode() as HTMLElement | undefined;
    if (!node || !root) return;
    const observer = new IntersectionObserver((entries) => setVisible(entries.at(-1)?.isIntersecting ?? true), {
      root,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [scroller]);

  return (
    <View
      ref={pane}
      role="region"
      aria-label={title}
      aria-current={active ? 'true' : undefined}
      style={[styles.column, { borderColor: theme.border, backgroundColor: theme.page }]}
      onStartShouldSetResponderCapture={() => {
        activate();
        return false;
      }}
      onFocus={activate}>
      <View
        style={[
          styles.header,
          active
            ? {
                borderBottomColor: theme.primary,
                borderBottomWidth: ACTIVE_RULE,
              }
            : { borderBottomColor: theme.border },
        ]}>
        <ThemedText
          type="labelSmall"
          numberOfLines={1}
          themeColor={active ? 'primary' : undefined}
          style={styles.title}>
          {title}
        </ThemedText>
        <HeaderButton
          label={t('timeline.columns.moveLeft')}
          symbol={{
            ios: 'chevron.left',
            android: 'chevron_left',
            web: 'chevron_left',
          }}
          disabled={first}
          onPress={() => onMove(column, -1)}
        />
        <HeaderButton
          label={t('timeline.columns.moveRight')}
          symbol={{
            ios: 'chevron.right',
            android: 'chevron_right',
            web: 'chevron_right',
          }}
          disabled={last}
          onPress={() => onMove(column, 1)}
        />
        <HeaderButton
          label={t('timeline.columns.remove')}
          symbol={{ ios: 'xmark', android: 'close', web: 'close' }}
          onPress={() => onRemove(column)}
        />
      </View>
      <ColumnActiveContext value={active}>
        <ColumnVisibleContext value={visible}>
          <PaneContext value={DeckColumnWidth}>
            <View style={styles.body}>
              <Body id={id} />
            </View>
          </PaneContext>
        </ColumnVisibleContext>
      </ColumnActiveContext>
    </View>
  );
});

type Part = {
  useTitle: (id: string) => string;
  Body: ComponentType<{ id: string }>;
};

function tabTitle(kind: Exclude<ColumnKind, KeyedKind>) {
  return function useTabTitle() {
    return useTranslation().t(`timeline.tabs.${kind}`);
  };
}

const timelinePart = (timeline: 'home' | 'local'): Part => ({
  useTitle: tabTitle(timeline),
  Body: () => <TimelinePosts timeline={timeline} />,
});

function useListTitle(id: string) {
  const { t } = useTranslation();
  return useList(id).data?.title ?? t('profile.lists.title');
}

function useFeedTitle(id: string) {
  const { t } = useTranslation();
  return useFeedGenerator(id).data?.view.displayName ?? t('timeline.feeds.title');
}

const PARTS: Record<ColumnKind, Part> = {
  home: timelinePart('home'),
  local: timelinePart('local'),
  notifications: {
    useTitle: tabTitle('notifications'),
    Body: NotificationsFeed,
  },
  list: { useTitle: useListTitle, Body: ({ id }) => <ListPosts id={id} /> },
  feed: { useTitle: useFeedTitle, Body: ({ id }) => <FeedPosts uri={id} /> },
  tag: { useTitle: (id) => `#${id}`, Body: ({ id }) => <TagPosts name={id} /> },
};

function HeaderButton({
  label,
  symbol,
  disabled,
  onPress,
}: {
  label: string;
  symbol: WebSymbol;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={Spacing.two}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ hovered }) => [
        styles.button,
        hovered && !disabled && { backgroundColor: theme.surface },
        disabled && { opacity: Press.disabled },
      ]}>
      <SymbolView name={symbol} size={20} tintColor={theme.primary} />
    </Pressable>
  );
}

function AddColumn({
  kinds,
  columns,
  onAdd,
}: {
  kinds: ColumnKind[];
  columns: Column[];
  onAdd: (column: Column) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [step, setStep] = useState<KeyedKind | null>(null);
  const button = useRef<ViewRef>(null);
  const panelId = useId();
  const fixed = FIXED_KINDS.filter((kind) => kinds.includes(kind) && !columns.some((c) => c.kind === kind));
  const keyed = KEYED_KINDS.filter((kind) => kinds.includes(kind));

  const items: MenuAction[] = [
    ...fixed.map((kind) => ({
      key: kind,
      title: t(`timeline.tabs.${kind}`),
      icon: 'plus',
      onPress: () => onAdd({ kind }),
    })),
    ...keyed.map((kind) => ({
      key: kind,
      title: t(`timeline.columns.${kind}`),
      icon: 'plus',
      onPress: () => setStep(kind),
    })),
  ];
  const close = useCallback((restoreFocus: boolean) => {
    setStep(null);
    if (restoreFocus) button.current?.focus();
  }, []);
  const Picker = step && PICKERS[step];

  return (
    <ScrollView style={[styles.add, { borderColor: theme.border }]} contentContainerStyle={styles.addContent}>
      <NativeMenu
        label={t('timeline.columns.add')}
        trigger="text"
        groups={items.length > 0 ? [{ key: 'own', items }] : []}
        onCloseAutoFocus={(event) => {
          const panel = document.getElementById(panelId);
          if (!panel) return;
          event.preventDefault();
          focusFirst(panel);
        }}
        renderTrigger={(open, expanded) => (
          <Pressable
            ref={button}
            onPress={step ? () => close(false) : open}
            disabled={items.length === 0}
            accessibilityRole="button"
            aria-haspopup="menu"
            aria-expanded={expanded}
            aria-controls={step ? panelId : undefined}
            style={({ hovered }) => [
              styles.addButton,
              hovered && { backgroundColor: theme.surface },
              items.length === 0 && { opacity: Press.disabled },
            ]}>
            <ThemedText type="label" themeColor="primary">
              {t('timeline.columns.add')}
            </ThemedText>
          </Pressable>
        )}
      />
      {Picker && step && (
        <PickerPanel id={panelId} label={t(`timeline.columns.${step}`)} anchor={button} onClose={close}>
          <Picker
            onPick={(id) => {
              onAdd({ kind: step, id });
              close(true);
            }}
          />
        </PickerPanel>
      )}
    </ScrollView>
  );
}

const PICKERS: Record<KeyedKind, ComponentType<{ onPick: (id: string) => void }>> = {
  list: ListPicker,
  feed: FeedPicker,
  tag: TagPicker,
};

function focusFirst(panel: HTMLElement) {
  (panel.querySelector<HTMLElement>('input, [role="button"]') ?? panel).focus();
}

// Not a modal: it takes focus on open, closes on Escape or a click elsewhere, and hands focus back to the button.
function PickerPanel({
  id,
  label,
  anchor,
  onClose,
  children,
}: {
  id: string;
  label: string;
  anchor: { current: ViewRef | null };
  onClose: (restoreFocus: boolean) => void;
  children: ReactNode;
}) {
  const panel = useRef<ViewRef>(null);

  useEffect(() => {
    const node = panel.current as unknown as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const trigger = anchor.current as unknown as HTMLElement | null;
      if (!node?.contains(target) && !trigger?.contains(target)) onClose(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [anchor, onClose]);

  return (
    <View ref={panel} id={id} role="dialog" aria-label={label} tabIndex={-1} style={styles.panel}>
      {children}
    </View>
  );
}

function MenuItem({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ hovered, pressed }) => [
        styles.addButton,
        (hovered || pressed) && !disabled && { backgroundColor: theme.surface },
        disabled && { opacity: Press.disabled },
      ]}>
      <ThemedText>{label}</ThemedText>
    </Pressable>
  );
}

function PickList({
  heading,
  empty,
  rows,
  loading,
  failed,
  onRetry,
  onPick,
  children,
}: {
  heading: string;
  empty?: string;
  rows: { id: string; label: string }[];
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  onPick: (id: string) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const settled = !loading && !failed;
  return (
    <>
      {children}
      {loading && (
        <ThemedText role="status" themeColor="muted">
          {t('common.loading')}
        </ThemedText>
      )}
      {failed && (
        <>
          <ThemedText themeColor="danger">{t('common.error')}</ThemedText>
          {onRetry && <Button label={t('common.retry')} variant="outline" size="small" onPress={onRetry} />}
        </>
      )}
      {settled && rows.length === 0 && empty && <ThemedText>{empty}</ThemedText>}
      {rows.length > 0 && <ThemedText type="meta">{heading}</ThemedText>}
      {rows.map((row) => (
        <MenuItem key={row.id} label={row.label} onPress={() => onPick(row.id)} />
      ))}
    </>
  );
}

function ListPicker({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const { data = [], isLoading, isError, refetch } = useLists();
  const rows = data.filter((list) => list.purpose !== 'mod').map(({ id, title }) => ({ id, label: title }));
  return (
    <PickList
      heading={t('timeline.columns.pickList')}
      empty={t('timeline.columns.noLists')}
      rows={rows}
      loading={isLoading}
      failed={isError && rows.length === 0}
      onRetry={() => void refetch()}
      onPick={onPick}
    />
  );
}

function FeedPicker({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const { data = [], isLoading, isError, refetch } = useSavedFeeds();
  const rows = data.map(({ view }) => ({
    id: view.uri,
    label: view.displayName,
  }));
  return (
    <PickList
      heading={t('timeline.columns.pickFeed')}
      empty={t('timeline.columns.noFeeds')}
      rows={rows}
      loading={isLoading}
      failed={isError && rows.length === 0}
      onRetry={() => void refetch()}
      onPick={onPick}
    />
  );
}

function TagPicker({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const tags = useFollowedTags();
  const rows = (tags.data?.pages.flat() ?? []).map((item) => ({
    id: item.name,
    label: `#${item.name}`,
  }));
  const tag = name.trim().replace(/^#+/, '');
  const submit = () => tag && onPick(tag);
  return (
    <PickList heading={t('timeline.columns.followedTags')} rows={rows} loading={tags.isLoading} onPick={onPick}>
      <ThemedText type="meta">{t('timeline.columns.tagPlaceholder')}</ThemedText>
      <TextField
        value={name}
        onChangeText={setName}
        onSubmitEditing={submit}
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t('timeline.columns.tagPlaceholder')}
      />
      <MenuItem label={t('timeline.columns.addTag')} disabled={!tag} onPress={submit} />
    </PickList>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1 },
  scroller: { flex: 1 },
  column: { width: DeckColumnWidth, borderRightWidth: Hairline },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: TouchTarget,
    borderBottomWidth: Hairline,
  },
  title: { flex: 1, minWidth: 0 },
  button: {
    width: TouchTarget,
    height: TouchTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  body: { flex: 1, minHeight: 0 },
  add: {
    width: ADD_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    borderLeftWidth: Hairline,
  },
  addContent: { padding: Spacing.three, gap: Spacing.two },
  addButton: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
  },
  panel: { gap: Spacing.two },
});
