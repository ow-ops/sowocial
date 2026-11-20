import { format } from 'date-fns';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useModeratedPost } from '@/api/bsky/moderation';
import { Avatar } from '@/components/avatar';
import { useOpenAccount } from '@/hooks/use-open-account';
import { usePostView } from '@/hooks/use-post-view';
import { EditedMarker } from '@/components/edited-marker';
import { ActionBar } from '@/components/status-actions';
import { StatusBody } from '@/components/status-body';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { ThreadLine } from '@/components/thread-line';
import { Hairline, Press, Spacing } from '@/constants/theme';
import { dateLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { useDensity } from '@/prefs/store';
import type { Post } from '@/model/post';

const VISIBILITY = {
  public: 'status.hero.public',
  unlisted: 'status.hero.unlisted',
  private: 'status.hero.followersOnly',
  direct: 'status.hero.mentionedOnly',
} as const;

export function StatusHero({
  status: original,
  lineAbove,
  part,
}: {
  status: Post;
  lineAbove: boolean;
  part?: { index: number; total: number };
}) {
  const { t } = useTranslation();
  const status = useModeratedPost(original, 'contentView');
  const openAccount = useOpenAccount();
  const theme = useTheme();
  const density = useDensity();
  const view = usePostView(status);

  const details = [
    format(new Date(status.createdAt), t('status.hero.dateFormat'), { locale: dateLocale() }),
    status.visibility && t(VISIBILITY[status.visibility]),
    part && t('status.card.threadPart', part),
  ].filter(Boolean);

  const counts = [
    [status.counts.replies, t('status.hero.replies', { count: status.counts.replies }), null],
    [status.counts.reposts, t('status.hero.boosts', { count: status.counts.reposts }), 'reposts'],
    [status.counts.likes, t('status.hero.favourites', { count: status.counts.likes }), 'likes'],
  ] as const;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.page, borderBottomColor: theme.border, paddingHorizontal: density.padding, paddingTop: density.padding, gap: density.gap },
      ]}>
      {lineAbove && <ThreadLine center={density.padding + density.avatar / 2} height={density.padding - Spacing.one} />}

      <Pressable
        onPress={() => openAccount(status.author.id, status.accountKey)}
        accessibilityRole="button"
        accessibilityLabel={[t('status.hero.openAccount', { acct: status.author.handle }), status.author.pronouns].filter(Boolean).join(', ')}
        style={styles.author}>
        <Avatar uri={status.author.avatar} size={density.avatar} />
        <View style={styles.authorText}>
          <View style={styles.nameRow}>
            <EmojiText
              type="name"
              numberOfLines={1}
              style={styles.name}
              text={status.author.displayName}
              emojis={status.author.emojis}
            />
            {status.author.pronouns && (
              <ThemedText type="label" themeColor="primary" numberOfLines={1} style={styles.pronouns}>
                {status.author.pronouns}
              </ThemedText>
            )}
          </View>
          <ThemedText type="meta" numberOfLines={1}>
            @{status.author.handle}
          </ThemedText>
        </View>
      </Pressable>

      <View style={styles.body}>
        <StatusBody status={status} view={view} size="large" />
      </View>

      <ThemedText type="meta">
        {details.join(' · ')}
        {status.editedAt ? ' ' : ''}
        <EditedMarker status={status} />
      </ThemedText>

      {counts.some(([n]) => n > 0) && (
        <View style={styles.counts}>
          {counts
            .filter(([n]) => n > 0)
            .map(([n, label, kind]) => {
              const text = (
                <ThemedText type="meta">
                  <ThemedText type="meta" themeColor="heading">
                    {n}
                  </ThemedText>{' '}
                  {label}
                </ThemedText>
              );
              return kind ? (
                <Pressable
                  key={label}
                  hitSlop={Spacing.two}
                  accessibilityRole="button"
                  accessibilityLabel={t('status.interactions.show', { count: n, label })}
                  onPress={() =>
                    router.push({ pathname: '/interactions/[id]', params: { id: status.id, kind, account: status.accountKey } })
                  }
                  style={({ pressed }) => pressed && { opacity: Press.opacity }}>
                  {text}
                </Pressable>
              ) : (
                <View key={label}>{text}</View>
              );
            })}
        </View>
      )}

      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <ActionBar status={status} showCounts={false} size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: Hairline,
  },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.oneHalf,
  },
  authorText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
  pronouns: {
    marginLeft: 'auto',
    flexShrink: 0,
    maxWidth: '40%',
  },
  body: {
    gap: Spacing.two,
  },
  actions: {
    borderTopWidth: Hairline,
  },
});
