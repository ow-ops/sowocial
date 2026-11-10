import { formatDistanceToNowStrict } from 'date-fns';
import { useRecyclingState } from '@shopify/flash-list';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRefreshPoll, useVotePoll } from '@/api/statuses';
import { accountKey, useAuthedSession, useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { EmojiText } from '@/components/status-content';
import { ThemedText } from '@/components/themed-text';
import { Outlined, Press, Spacing } from '@/constants/theme';
import { dateLocale } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import type { Emoji, Poll, PollOption, Post } from '@/model/post';

export function StatusPoll({ status, poll }: { status: Post; poll: Poll }) {
  const { t } = useTranslation();
  const active = useAuthedSession();
  const { sessions } = useSession();
  const { accountId } = sessions.find((s) => accountKey(s) === status.accountKey) ?? active;
  const vote = useVotePoll();
  const refresh = useRefreshPoll();
  const [choices, setChoices] = useRecyclingState<number[]>([], [status.uid]);
  const voting = vote.isPending && vote.variables.statusId === status.id;
  const refreshing = refresh.isPending && refresh.variables.statusId === status.id;
  const canVote = !poll.voted && !poll.expired && status.author.id !== accountId;

  const toggle = (index: number) =>
    setChoices((current) =>
      poll.multiple
        ? current.includes(index)
          ? current.filter((i) => i !== index)
          : [...current, index]
        : [index],
    );

  // Multiple-choice percentages are of voters, so they can add up past 100%.
  const total = poll.multiple ? (poll.votersCount ?? poll.votesCount) : poll.votesCount;
  const people = poll.votersCount ?? poll.votesCount;
  const ends = poll.expired
    ? t('status.poll.closed')
    : poll.expiresAt
      ? t('status.poll.endsIn', { time: formatDistanceToNowStrict(new Date(poll.expiresAt), { locale: dateLocale() }) })
      : null;

  return (
    <View style={styles.poll} accessibilityRole={canVote ? (poll.multiple ? 'list' : 'radiogroup') : 'list'}>
      {poll.options.map((option, index) =>
        canVote ? (
          <Choice
            key={index}
            option={option}
            emojis={[...option.emojis, ...(status.emojis ?? [])]}
            multiple={poll.multiple}
            selected={choices.includes(index)}
            onPress={() => toggle(index)}
          />
        ) : (
          <Result
            key={index}
            option={option}
            emojis={[...option.emojis, ...(status.emojis ?? [])]}
            share={total && option.votesCount != null ? option.votesCount / total : null}
            own={poll.ownVotes.includes(index)}
          />
        ),
      )}
      <View style={styles.footer}>
        <ThemedText type="meta" style={styles.footerText}>
          {[t('status.poll.people', { count: people }), ends].filter(Boolean).join(' · ')}
        </ThemedText>
        {canVote ? (
          <Button
            label={t('status.poll.vote')}
            size="small"
            disabled={choices.length === 0}
            loading={voting}
            onPress={() => vote.mutate({ statusId: status.id, account: status.accountKey, poll, choices })}
          />
        ) : (
          !poll.expired && (
            <Button
              label={t('status.poll.refresh')}
              size="small"
              variant="outline"
              loading={refreshing}
              onPress={() => refresh.mutate({ statusId: status.id, account: status.accountKey, poll })}
            />
          )
        )}
      </View>
    </View>
  );
}

function Choice({
  option,
  emojis,
  multiple,
  selected,
  onPress,
}: {
  option: PollOption;
  emojis: Emoji[];
  multiple: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.option,
        { borderColor: selected ? theme.primary : theme.border },
        pressed && { opacity: Press.opacity },
      ]}>
      <View
        style={[
          styles.mark,
          multiple ? styles.square : styles.round,
          { borderColor: selected ? theme.primary : theme.outline },
          selected && { backgroundColor: theme.primary },
        ]}
      />
      <EmojiText text={option.title} emojis={emojis} style={styles.title} />
    </Pressable>
  );
}

function Result({
  option,
  emojis,
  share,
  own,
}: {
  option: PollOption;
  emojis: Emoji[];
  share: number | null;
  own: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const percent = share === null ? null : Math.round(share * 100);
  return (
    <View
      style={[styles.option, { borderColor: theme.border }]}
      accessible
      accessibilityLabel={
        percent === null
          ? own
            ? t('status.poll.resultOwn', { title: option.title })
            : option.title
          : own
            ? t('status.poll.resultPercentOwn', { title: option.title, percent })
            : t('status.poll.resultPercent', { title: option.title, percent })
      }>
      {percent !== null && (
        <View
          style={[
            styles.bar,
            { width: `${percent}%`, backgroundColor: own ? theme.primary : theme.surface, opacity: own ? 0.25 : 1 },
          ]}
        />
      )}
      <EmojiText text={option.title} emojis={emojis} style={styles.title} />
      <ThemedText type="label" themeColor={own ? 'primary' : 'heading'}>
        {percent === null ? t('status.poll.hidden') : `${percent}%`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  poll: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    ...Outlined,
    overflow: 'hidden',
  },
  bar: {
    ...StyleSheet.absoluteFill,
    right: undefined,
  },
  mark: {
    width: 18,
    height: 18,
    borderWidth: 2,
  },
  round: { borderRadius: 9 },
  square: { borderRadius: 4 },
  title: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  footerText: {
    flex: 1,
  },
});
