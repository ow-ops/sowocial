import { MaterialSymbols_400Regular_Filled } from '@expo-google-fonts/material-symbols/400Regular_Filled';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useCanWriteQuotes, useSeedStatus, useStatusAction, type StatusAction } from '@/api/statuses';
import { NativeMenu, type NativeMenuProps } from '@/components/native-menu';
import { PostMenu } from '@/components/post-menu';
import { ReactAction } from '@/components/status-reactions';
import { ThemedText } from '@/components/themed-text';
import { Press, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Post } from '@/model/post';
import { webTitle } from '@/utils/accessibility';
import { tapHaptic } from '@/utils/haptics';
import { quoteParams } from '@/utils/links';
import { shortCount } from '@/utils/text';

const ICONS: Record<StatusAction, { off: SymbolViewProps['name']; on: SymbolViewProps['name'] }> = {
  reblog: {
    off: { ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' },
    on: { ios: 'arrow.2.squarepath', android: 'repeat_on', web: 'repeat_on' },
  },
  favourite: {
    off: { ios: 'star', android: 'star', web: 'star' },
    on: { ios: 'star.fill', android: 'star', web: 'star' },
  },
  bookmark: {
    off: { ios: 'bookmark', android: 'bookmark', web: 'bookmark' },
    on: { ios: 'bookmark.fill', android: 'bookmark_added', web: 'bookmark_added' },
  },
};

// The Material Symbols font only has an outlined star, so Android and web switch to the filled font.
const FILLED_FONT = { name: 'MaterialSymbols_400Regular_Filled', font: MaterialSymbols_400Regular_Filled };
const FILLED: SymbolViewProps['weight'] = { ios: 'unspecified', android: FILLED_FONT };
const FILLED_FONT_MAP = Platform.OS === 'ios' ? {} : { [FILLED_FONT.name]: FILLED_FONT.font };
// iOS has one boost glyph, so a boosted post is drawn heavier as well as tinted.
const ACTIVE_WEIGHT: Record<StatusAction, SymbolViewProps['weight']> = {
  reblog: Platform.OS === 'ios' ? 'bold' : undefined,
  favourite: FILLED,
  bookmark: undefined,
};

const LABELS = {
  reblog: ['status.actions.boost', 'status.actions.undoBoost'],
  favourite: ['status.actions.favourite', 'status.actions.removeFavourite'],
  bookmark: ['status.actions.bookmark', 'status.actions.removeBookmark'],
} as const;

const TOGGLES = ['reblog', 'favourite', 'bookmark'] as const;

const MORE_ICON: SymbolViewProps['name'] = { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' };

const toggleAvailable = (status: Post, action: StatusAction) => action !== 'bookmark' || status.capabilities.bookmark;

export function useStatusActions(status: Post) {
  const router = useRouter();
  const seed = useSeedStatus();
  const { mutate } = useStatusAction();
  const quote = quoteParams(status, useCanWriteQuotes());
  const isActive = {
    reblog: status.viewer.reposted,
    favourite: status.viewer.liked,
    bookmark: !!status.viewer.bookmarked,
  };
  return {
    isActive,
    canReply: !status.viewer.replyDisabled,
    canReblog: status.capabilities.reblog,
    reply: () => {
      seed(status);
      router.push({ pathname: '/compose', params: { replyTo: status.id, account: status.accountKey } });
    },
    canQuote: !!quote,
    quote: () => {
      seed(status);
      router.push({ pathname: '/compose', params: { ...quote, account: status.accountKey } });
    },
    toggle: (action: StatusAction) => {
      tapHaptic();
      mutate({ status, action });
    },
    like: () => mutate({ status, action: 'favourite' }),
    // Seeded so the menu opens without a fetch.
    more: () => {
      seed(status);
      router.push({ pathname: '/status-menu/[id]', params: { id: status.id, account: status.accountKey } });
    },
  };
}

// Screen readers treat a pressable row as one element, so its buttons are also
// offered as accessibility actions on the row (VoiceOver rotor, TalkBack actions menu).
export function useStatusAccessibilityActions(status: Post, actions: StatusActions) {
  const { t } = useTranslation();
  const { isActive, canReply, canReblog, reply, toggle, more } = actions;
  const toggles = TOGGLES.filter((a) => (a !== 'reblog' || canReblog) && toggleAvailable(status, a));
  return {
    accessibilityActions: [
      ...(canReply ? [{ name: 'reply', label: t('status.actions.reply') }] : []),
      ...toggles.map((a) => ({ name: a, label: t(LABELS[a][isActive[a] ? 1 : 0]) })),
      { name: 'more', label: t('status.actions.more') },
    ],
    onAccessibilityAction: ({ nativeEvent }: { nativeEvent: { actionName: string } }) => {
      if (nativeEvent.actionName === 'reply') reply();
      else if (nativeEvent.actionName === 'more') more();
      else if ((TOGGLES as readonly string[]).includes(nativeEvent.actionName)) {
        toggle(nativeEvent.actionName as StatusAction);
      }
    },
  };
}

type StatusActions = ReturnType<typeof useStatusActions>;

const ActionIcon = { regular: 22, large: 24 } as const;

type ActionBarProps = {
  status: Post;
  compact?: boolean;
  showCounts?: boolean;
  size?: keyof typeof ActionIcon;
};

export function ActionBar(props: ActionBarProps) {
  return <SharedActionBar {...props} actions={useStatusActions(props.status)} />;
}

// For a card that already holds the post's actions, so a row subscribes to them once.
export function SharedActionBar({
  status,
  actions,
  compact = false,
  showCounts = true,
  size = 'regular',
}: ActionBarProps & { actions: StatusActions }) {
  const iconSize = ActionIcon[size];
  // SymbolView loads its font only on mount, so the filled one must be ready before a tap swaps it in.
  useFonts(FILLED_FONT_MAP);
  const { t } = useTranslation();
  const theme = useTheme();
  const { isActive, canReply, canReblog, reply, toggle, canQuote, quote } = actions;
  const counts = {
    reply: showCounts ? status.counts.replies : null,
    reblog: showCounts ? status.counts.reposts : null,
    favourite: showCounts ? status.counts.likes : null,
    bookmark: null,
  };

  // Actions with a count get equal columns, so icons line up from post to post, and the rest sit at the
  // trailing edge. The margin puts the outer icons flush with the post text.
  const inset = (48 - iconSize) / 2;
  const column = (key: 'reply' | StatusAction, node: ReactNode) =>
    compact ? node : (
      <Column key={key} count={counts[key]}>
        {node}
      </Column>
    );

  return (
    <View style={compact ? styles.actionsCompact : [styles.actions, { marginHorizontal: -inset }]}>
      {column(
        'reply',
        <ActionButton
          icon={{ ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' }}
          label={t('status.actions.reply')}
          count={counts.reply}
          hint={canReply ? undefined : t('status.repliesLimited')}
          color={theme.muted}
          iconSize={iconSize}
          inset={compact ? undefined : inset}
          disabled={!canReply}
          onPress={reply}
        />,
      )}
      {TOGGLES.filter((action) => toggleAvailable(status, action)).map((action) => {
        const wrap = (node: ReactNode) => (action === 'bookmark' ? node : column(action, node));
        const button = (onPress: () => void) => (
          <ActionButton
            key={action}
            active={isActive[action]}
            icon={isActive[action] ? ICONS[action].on : ICONS[action].off}
            weight={isActive[action] ? ACTIVE_WEIGHT[action] : undefined}
            label={t(LABELS[action][0])}
            count={counts[action]}
            color={isActive[action] ? theme.primary : theme.muted}
            iconSize={iconSize}
            inset={compact ? undefined : inset}
            disabled={action === 'reblog' && !canReblog}
            onPress={onPress}
          />
        );
        if (action !== 'reblog' || !canReblog || !canQuote || isActive.reblog) return wrap(button(() => toggle(action)));
        return wrap(
          <BoostMenu
            key={action}
            button={button}
            icon={{ name: ICONS.reblog.off, color: theme.muted, size: iconSize, count: counts.reblog }}
            boost={() => toggle('reblog')}
            quote={quote}
          />,
        );
      })}
      <ReactAction status={status} iconSize={iconSize} />
      <PostMenu
        status={status}
        icon={{ name: MORE_ICON, color: theme.muted, size: iconSize }}
        trigger={(onPress) => (
          <ActionButton
            icon={MORE_ICON}
            label={t('status.actions.more')}
            count={null}
            color={theme.muted}
            iconSize={iconSize}
            onPress={onPress}
          />
        )}
      />
    </View>
  );
}

// Like PostMenu, Android mounts the Compose menu on the first tap instead of in every row.
function BoostMenu({
  button,
  icon,
  boost,
  quote,
}: {
  button: (onPress: () => void) => ReactNode;
  icon: NonNullable<NativeMenuProps['icon']>;
  boost: () => void;
  quote: () => void;
}) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  if (Platform.OS === 'android' && !armed) return button(() => setArmed(true));
  const label = t('status.actions.boost');
  return (
    <NativeMenu
      label={icon.count ? t('status.actions.labelWithCount', { label, count: icon.count }) : label}
      trigger="icon"
      icon={icon}
      initiallyOpen={armed}
      groups={[
        {
          key: 'post',
          items: [
            { key: 'boost', title: label, icon: 'arrow.2.squarepath', onPress: boost },
            { key: 'quote', title: t('status.menu.quote'), icon: 'quote.bubble', onPress: quote },
          ],
        },
      ]}
      renderTrigger={button}
    />
  );
}

// Yoga has no min-content, so an equal column learns its content's width to keep a long count off the next icon.
function Column({ count, children }: { count: number | null; children: ReactNode }) {
  const content = useRef<ComponentRef<typeof View>>(null);
  const [minWidth, setMinWidth] = useState(0);
  // Measured before paint when the count changes; onLayout catches a native menu, which sizes itself later.
  useLayoutEffect(() => {
    content.current?.measure((_x: number, _y: number, width: number) => setMinWidth(width));
  }, [count]);
  return (
    <View style={[styles.column, { minWidth }]}>
      <View ref={content} onLayout={(event) => setMinWidth(event.nativeEvent.layout.width)}>
        {children}
      </View>
    </View>
  );
}

function ActionButton(props: {
  active?: boolean;
  icon: SymbolViewProps['name'];
  weight?: SymbolViewProps['weight'];
  label: string;
  hint?: string;
  count: number | null;
  color: string;
  iconSize: number;
  // Keeps the icon in place and lets the count grow to its right, where a centred button would shift both.
  inset?: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      ref={webTitle(props.label)}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityHint={props.hint}
      accessibilityLabel={props.count ? t('status.actions.labelWithCount', { label: props.label, count: props.count }) : props.label}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active, disabled: props.disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.action,
        props.inset !== undefined && { justifyContent: 'flex-start', paddingStart: props.inset },
        props.disabled ? { opacity: Press.disabled } : pressed && { opacity: Press.opacity },
      ]}>
      <SymbolView name={props.icon} weight={props.weight} size={props.iconSize} tintColor={props.color} />
      {props.count !== null && props.count > 0 && (
        <ThemedText type="meta" style={{ color: props.color }}>
          {shortCount(props.count)}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  column: {
    flex: 1,
    alignItems: 'flex-start',
  },
  actionsCompact: {
    flexDirection: 'row',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minWidth: 48,
    minHeight: Platform.OS === 'android' ? 48 : 44,
  },
});
