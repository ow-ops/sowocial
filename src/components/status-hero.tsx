import { format } from 'date-fns';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useModeratedPost } from '@/api/bsky/moderation';
import { Avatar } from '@/components/avatar';
import { useOpenAccount } from '@/hooks/use-open-account';
import { EditedMarker } from '@/components/edited-marker';
import { ActionBar } from '@/components/status-actions';
import { StatusBody } from '@/components/status-body';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { ThreadLine } from '@/components/thread-line';
import { Hairline, Spacing } from '@/constants/theme';
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

export function StatusHero({ status: original, lineAbove }: { status: Post; lineAbove: boolean }) {
  const { t } = useTranslation();
  const status = useModeratedPost(original, 'contentView');
  const openAccount = useOpenAccount();
  const theme = useTheme();
  const density = useDensity();

  const details = [
    format(new Date(status.createdAt), t('status.hero.dateFormat'), { locale: dateLocale() }),
    status.visibility && t(VISIBILITY[status.visibility]),
  ].filter(Boolean);

  const counts = [
    [status.counts.replies, t('status.hero.replies', { count: status.counts.replies })],
    [status.counts.reposts, t('status.hero.boosts', { count: status.counts.reposts })],
    [status.counts.likes, t('status.hero.favourites', { count: status.counts.likes })],
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
        <StatusBody status={status} size="large" />
      </View>

      <ThemedText type="meta">
        {details.join(' · ')}
        {status.editedAt ? ' ' : ''}
        <EditedMarker status={status} />
      </ThemedText>

      {counts.some(([n]) => n > 0) && (
        <ThemedText type="meta">
          {counts
            .filter(([n]) => n > 0)
            .map(([n, label], i) => (
              <ThemedText key={label} type="meta">
                {i > 0 ? ' · ' : ''}
                <ThemedText type="meta" themeColor="heading">
                  {n}
                </ThemedText>{' '}
                {label}
              </ThemedText>
            ))}
        </ThemedText>
      )}

      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <ActionBar status={status} showCounts={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: Hairline,
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
