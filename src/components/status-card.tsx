import { SymbolView } from 'expo-symbols';
import { useRecyclingState } from '@shopify/flash-list';
import { memo, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useModeratedPost } from '@/api/bsky/moderation';
import { useAuthedSession } from '@/auth/session';
import { useOpenAccount } from '@/hooks/use-open-account';
import { useOpenUrl } from '@/hooks/use-open-url';
import { Avatar } from '@/components/avatar';
import { FilteredStatus } from '@/components/filtered-status';
import { EditedMarker } from '@/components/edited-marker';
import { LikeBurst, type BurstPoint } from '@/components/like-burst';
import { ActionBar, useStatusAccessibilityActions } from '@/components/status-actions';
import { useAccountSource, useBothNetworks } from '@/components/source-badge';
import { SourceMark } from '@/components/source-mark';
import { StatusBody } from '@/components/status-body';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { replyAvatar, replyInset, ThreadLine, ThreadRails } from '@/components/thread-line';
import { Hairline, Radius, Shadow, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useDoubleTapLike } from '@/hooks/use-double-tap-like';
import { useOpenStatus } from '@/hooks/use-open-status';
import { useTheme } from '@/hooks/use-theme';
import { firstContentLink } from '@/model/content';
import type { Post } from '@/model/post';
import { statusSummary } from '@/utils/accessibility';
import { shortRelativeTime } from '@/utils/relative-time';
import { replyHandle } from '@/utils/timeline';
import { ReplyParent } from '@/components/reply-parent';
import { useDensity } from '@/prefs/store';
import { useAutoReveal } from '@/prefs/use-auto-reveal';
import { useKeyboardFocus } from '@/shortcuts/use-keyboard-focus';

type Props = {
  status: Post;
  lineAbove?: boolean;
  // Thread line from the avatar to the bottom edge; hides the separator.
  lineBelow?: boolean;
  // Reply nesting level in a thread; 0 is a direct reply.
  depth?: number;
  // Thread-page replies only.
  rails?: boolean[];
  repliesBelow?: boolean;
  separator?: boolean;
  part?: { index: number; total: number };
  preview?: boolean;
  pinned?: boolean;
  showSource?: boolean;
  flat?: boolean;
};

function StatusCardView({
  status,
  lineAbove = false,
  lineBelow = false,
  depth = 0,
  rails,
  repliesBelow = false,
  separator = true,
  part,
  preview = false,
  pinned = false,
  showSource = false,
  flat = false,
}: Props) {
  const { t } = useTranslation();
  const openAccount = useOpenAccount();
  const theme = useTheme();
  const open = useOpenStatus();
  const openUrl = useOpenUrl();
  const [hovered, setHovered] = useRecyclingState(false, [status.key]);
  const accessibility = useStatusAccessibilityActions(status);
  const bothNetworks = useBothNetworks();
  const source = useAccountSource(showSource || bothNetworks, status.accountKey);
  const { accountId } = useAuthedSession();
  const density = useDensity();
  const padding = density.padding;
  const autoReveal = useAutoReveal(status);
  const [revealed, setRevealed] = useRecyclingState(autoReveal.warning, [status.key, autoReveal.warning]);
  const [burst, setBurst] = useRecyclingState<BurstPoint | null>(null, [status.key]);
  const { wide, card: cardColumn } = useColumn();
  const card = cardColumn && !flat && !preview && !lineAbove && !lineBelow && !rails;
  const hoverActions = wide && Platform.OS === 'web' && !preview;

  const nested = rails !== undefined;
  const avatar = nested ? replyAvatar(depth, density.avatar) : density.avatar;
  const inset = nested ? replyInset(depth, padding, density.avatar) : padding;
  const avatarCenter = inset + avatar / 2;

  const showParent = !!status.replyTo && !flat && !preview && !lineAbove;
  const hasWarning = !!status.contentWarning;
  const contentShown = !hasWarning || revealed;
  const link = firstContentLink(status.content);
  const poll = status.poll;
  const canVote = !!poll && !poll.voted && !poll.expired && status.author.id !== accountId;

  const extraActions = [
    { name: 'profile', label: t('status.card.openProfile') },
    ...(hasWarning ? [{ name: 'warning', label: revealed ? t('status.card.hideWarning') : t('status.card.showWarning') }] : []),
    ...(contentShown && status.media.length > 0 ? [{ name: 'media', label: t('status.card.openMedia') }] : []),
    ...(contentShown && canVote ? [{ name: 'vote', label: t('status.card.vote') }] : []),
    ...(contentShown && link ? [{ name: 'link', label: t('status.card.openLink') }] : []),
  ];

  const onAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    switch (event.nativeEvent.actionName) {
      case 'profile':
        return openAccount(status.author.id, status.accountKey);
      case 'warning':
        AccessibilityInfo.announceForAccessibility(revealed ? t('status.card.warningHidden') : t('status.card.warningShown'));
        return setRevealed((r) => !r);
      case 'media':
        return open(status, `/media/${status.id}?index=0`);
      case 'vote':
        return open(status, `/post/${status.id}`);
      case 'link':
        return link && openUrl(link);
      default:
        return accessibility.onAccessibilityAction(event);
    }
  };

  const cardRef = useRef<ComponentRef<typeof Pressable>>(null);
  const keyboard = useKeyboardFocus(status.key, cardRef);
  const onPress = useDoubleTapLike(
    status,
    cardRef,
    () => open(status, `/post/${status.id}`),
    (tap) => setBurst((b) => ({ id: (b?.id ?? 0) + 1, ...tap })),
  );

  const row = (
    <Pressable
      ref={cardRef}
      disabled={preview}
      onPress={onPress}
      // On web a button role renders a <button>, which cannot contain the card's own buttons.
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={(() => {
        const summary = statusSummary(status, {
          revealed,
          boostedBy: status.repostedBy?.displayName,
        });
        const pinnedSummary = pinned ? t('status.card.pinnedSummary', { summary }) : summary;
        return source ? `${source.label}. ${pinnedSummary}` : pinnedSummary;
      })()}
      accessibilityHint={preview ? undefined : t('status.card.opensPost')}
      {...(preview
        ? {}
        : {
            accessibilityActions: [...accessibility.accessibilityActions, ...extraActions],
            onAccessibilityAction,
          })}
      onFocus={keyboard.onFocus}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.container,
        { paddingRight: padding, paddingTop: padding, gap: density.gap },
        { backgroundColor: theme.page },
        !card && { borderBottomColor: theme.border },
        { paddingLeft: inset },
        (lineBelow || !separator) && styles.noSeparator,
        preview && { paddingBottom: Spacing.three },
        card
          ? [
              styles.card,
              { backgroundColor: pressed ? theme.page : theme.surface, borderColor: hovered ? theme.outline : theme.border },
            ]
          : (pressed || (hoverActions && hovered)) && { backgroundColor: theme.surface },
        keyboard.style,
      ]}>
      {rails && <ThreadRails depth={depth} rails={rails} anchor={padding + avatar / 2} padding={padding} avatar={density.avatar} />}
      {lineAbove && <ThreadLine center={avatarCenter} height={padding - Spacing.one} />}
      {lineBelow && <ThreadLine center={avatarCenter} top={padding + avatar + Spacing.one} bottom={0} />}
      {repliesBelow && <ThreadLine center={avatarCenter} top={padding + avatar + Spacing.one} bottom={0} faint />}

      {pinned && (
        <View style={[styles.reblogLine, { paddingLeft: avatar + 12 }]}>
          <SymbolView
            name={{ ios: 'pin.fill', android: 'push_pin', web: 'push_pin' }}
            size={13}
            tintColor={theme.muted}
          />
          <ThemedText type="meta">{t('status.card.pinned')}</ThemedText>
        </View>
      )}

      {status.repostedBy && (
        <View style={[styles.reblogLine, { paddingLeft: avatar + 12 }]}>
          <SymbolView
            name={{ ios: 'arrow.2.squarepath', android: 'repeat', web: 'repeat' }}
            size={13}
            tintColor={theme.muted}
          />
          <EmojiText
            type="meta"
            numberOfLines={1}
            text={t('status.card.boosted', { name: status.repostedBy.displayName })}
            emojis={status.repostedBy.emojis}
          />
        </View>
      )}

      <View style={styles.row}>
        <Pressable
          disabled={preview}
          onPress={() => openAccount(status.author.id, status.accountKey)}
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel={t('status.card.openAccount', { acct: status.author.handle })}>
          <Avatar uri={status.author.avatar} size={avatar} />
        </Pressable>

        <View style={[styles.body, { gap: density.gap }]}>
          <View style={styles.meta}>
            <EmojiText
              type="name"
              numberOfLines={1}
              style={styles.name}
              text={status.author.displayName}
              emojis={status.author.emojis}
            />
            <ThemedText type="meta" numberOfLines={1} style={styles.handle}>
              @{status.author.handle}
            </ThemedText>
            <ThemedText type="meta">{shortRelativeTime(status.createdAt)}</ThemedText>
            {part && (
              <ThemedText type="meta" accessibilityLabel={t('status.card.threadPart', part)}>
                · {part.index}/{part.total}
              </ThemedText>
            )}
            {source && <SourceMark source={source} />}
            <EditedMarker status={status} />
          </View>

          {showParent && <ReplyParent status={status} fallback={replyHandle(status)} />}

          <StatusBody status={status} revealed={revealed} onRevealedChange={setRevealed} />

          {!preview && !hoverActions && <ActionBar status={status} />}
        </View>
      </View>

      {burst && <LikeBurst key={burst.id} {...burst} />}

      {hoverActions && hovered && (
        <View style={[styles.toolbar, { backgroundColor: theme.page, borderColor: theme.border }]}>
          <ActionBar status={status} compact />
        </View>
      )}
    </Pressable>
  );

  return card ? <View style={styles.cardGap}>{row}</View> : row;
}

export const StatusCard = memo(function StatusCard(props: Props) {
  const status = useModeratedPost(props.status);
  return (
    <FilteredStatus status={status}>
      <StatusCardView {...props} status={status} />
    </FilteredStatus>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.one,
    borderBottomWidth: Hairline,
  },
  noSeparator: {
    borderBottomWidth: 0,
  },
  card: {
    borderWidth: Hairline,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingBottom: Spacing.two,
  },
  cardGap: {
    paddingBottom: Spacing.two,
  },
  reblogLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.oneHalf,
  },
  // The row stretches its children, which would make the whole left column open the profile.
  avatar: {
    alignSelf: 'flex-start',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  name: {
    flexShrink: 1,
  },
  handle: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  body: {
    flex: 1,
  },
  toolbar: {
    position: 'absolute',
    top: -Spacing.three,
    right: Spacing.two,
    borderWidth: Hairline,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.one,
    boxShadow: Shadow.raised,
  },
});
