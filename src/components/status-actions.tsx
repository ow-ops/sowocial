import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
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
import { tapHaptic } from '@/utils/haptics';
import { quoteParams } from '@/utils/links';

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

const LABELS = {
  reblog: ['status.actions.boost', 'status.actions.undoBoost'],
  favourite: ['status.actions.favourite', 'status.actions.removeFavourite'],
  bookmark: ['status.actions.bookmark', 'status.actions.removeBookmark'],
} as const;

const TOGGLES = ['reblog', 'favourite', 'bookmark'] as const;

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
  const { t } = useTranslation();
  const theme = useTheme();
  const { isActive, canReply, canReblog, reply, toggle, canQuote, quote } = actions;
  const counts = {
    reblog: showCounts ? status.counts.reposts : null,
    favourite: showCounts ? status.counts.likes : null,
    bookmark: null,
  };

  return (
    <View style={compact ? styles.actionsCompact : styles.actions}>
      <ActionButton
        icon={{ ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' }}
        label={t('status.actions.reply')}
        count={showCounts ? status.counts.replies : null}
        color={theme.muted}
        iconSize={iconSize}
        disabled={!canReply}
        onPress={reply}
      />
      {TOGGLES.filter((action) => toggleAvailable(status, action)).map((action) => {
        const button = (onPress: () => void) => (
          <ActionButton
            key={action}
            active={isActive[action]}
            icon={isActive[action] ? ICONS[action].on : ICONS[action].off}
            label={t(LABELS[action][0])}
            count={counts[action]}
            color={isActive[action] ? theme.primary : theme.muted}
            iconSize={iconSize}
            disabled={action === 'reblog' && !canReblog}
            onPress={onPress}
          />
        );
        if (action !== 'reblog' || !canReblog || !canQuote || isActive.reblog) return button(() => toggle(action));
        return (
          <BoostMenu
            key={action}
            button={button}
            icon={{ name: ICONS.reblog.off, color: theme.muted, size: iconSize, count: counts.reblog }}
            boost={() => toggle('reblog')}
            quote={quote}
          />
        );
      })}
      <ReactAction status={status} iconSize={iconSize} />
      <PostMenu
        status={status}
        trigger={(onPress) => (
          <ActionButton
            icon={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
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
      // Native menus draw their own trigger, so they get the boost icon and count to draw.
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

function ActionButton(props: {
  active?: boolean;
  icon: SymbolViewProps['name'];
  label: string;
  count: number | null;
  color: string;
  iconSize: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityLabel={props.count ? t('status.actions.labelWithCount', { label: props.label, count: props.count }) : props.label}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active, disabled: props.disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.action,
        props.disabled ? { opacity: Press.disabled } : pressed && { opacity: Press.opacity },
      ]}>
      <SymbolView name={props.icon} size={props.iconSize} tintColor={props.color} />
      {props.count !== null && props.count > 0 && (
        <ThemedText type="meta" style={{ color: props.color }}>
          {props.count}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: Spacing.five,
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
