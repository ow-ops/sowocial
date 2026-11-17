import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { intlLocale } from '@/i18n';
import { useProfileModeration } from '@/api/bsky/moderation';
import { useAccountPinned, useProfileStatuses, useSetAccountNote, type ProfileTab } from '@/api/accounts';
import { capabilitiesFor } from '@/api/backend/capabilities';
import { keys } from '@/api/keys';
import { useAccount, useRelationship, useToggleFollow } from '@/api/accounts';
import { useInstance } from '@/api/ap/instance';
import { useAccountScope, useAuthedSession } from '@/auth/session';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { CrossNetworkRow } from '@/components/cross-network-row';
import { AccountMenuButton } from '@/components/post-menu';
import { ActorStarterPacks, EndorsedAccounts, FamiliarFollowers, FeaturedTags, FollowRequestsButton, MovedBanner } from '@/components/profile-extras';
import { SegmentedControl } from '@/components/segmented-control';
import { StatusCard } from '@/components/status-card';
import { EmojiText, StatusContent } from '@/components/status-content';
import { StatusList } from '@/components/status-list';
import { ThemedText, textStyles } from '@/components/themed-text';
import { BorderWidth, Hairline, Outlined, Press, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Author, ProfileField } from '@/model/post';
import { domainOf, fullHandle } from '@/utils/acct';
import { tapHaptic } from '@/utils/haptics';

export function AccountProfile({ id, underTabs = false }: { id: string; underTabs?: boolean }) {
  const { t } = useTranslation();
  const tabs: { value: ProfileTab; label: string }[] = [
    { value: 'posts', label: t('profile.tabs.posts') },
    { value: 'replies', label: t('profile.tabs.replies') },
    { value: 'media', label: t('profile.tabs.media') },
  ];
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [hideBoosts, setHideBoosts] = useState(false);
  const scope = useAccountScope();
  const pinned = useAccountPinned(id, tab === 'posts');
  const pinnedStatuses = tab === 'posts' ? (pinned.data?.pages.flat() ?? []) : [];
  const hidden = new Set(pinnedStatuses.map((s) => s.id));

  return (
    <StatusList
      query={useProfileStatuses(id, tab, hidden, tab === 'posts' && hideBoosts)}
      queryKey={keys.accountStatuses(scope, id, tab)}
      emptyText={t(`profile.empty.${tab}`)}
      header={
        <>
          <ProfileHeader id={id} />
          <View style={styles.tabs}>
            <SegmentedControl label={t('profile.tabs.label')} options={tabs} value={tab} onChange={setTab} />
            {tab === 'posts' && (
              <View style={styles.hideBoosts}>
                <Button
                  label={t('profile.tabs.hideBoosts')}
                  size="small"
                  role="switch"
                  selected={hideBoosts}
                  onPress={() => setHideBoosts(!hideBoosts)}
                />
              </View>
            )}
          </View>
          {pinnedStatuses.map((status) => (
            <StatusCard key={status.key} status={status} pinned />
          ))}
        </>
      }
      underTabs={underTabs}
    />
  );
}

function ProfileHeader({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { accountId } = useAuthedSession();
  const { data: account } = useAccount(id);
  const domain = useInstance().data?.domain;
  const capabilities = account && capabilitiesFor(account.protocol);
  const moderation = useProfileModeration(account);

  if (!account) return <ActivityIndicator color={theme.muted} style={styles.loading} />;
  const counts = account.counts ?? { posts: 0, following: 0, followers: 0 };

  return (
    <View style={[styles.container, { backgroundColor: theme.page, borderBottomColor: theme.border }]}>
      {account.moved && <MovedBanner target={account.moved} />}
      <Image
        source={account.header}
        style={[styles.banner, { backgroundColor: theme.surface }, account.moved && styles.movedDim]}
        contentFit="cover"
      />
      <View style={styles.info}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatarRing, { backgroundColor: theme.page }]}>
            <View style={account.moved && styles.movedDim}>
              <Avatar uri={account.avatar} size={80} blurred={moderation.blurAvatar} />
            </View>
          </View>
          {id === accountId ? (
            <View style={styles.profileActions}>
              {capabilities?.editProfile && (
                <Button label={t('profile.header.edit')} variant="outline" size="small" onPress={() => router.push('/profile/edit')} />
              )}
              {capabilities?.followRequests && <FollowRequestsButton />}
              <AccountMenuButton account={account} own renderTrigger={(open) => <MoreButton onPress={open} />} />
            </View>
          ) : (
            <View style={styles.profileActions}>
              <FollowButton id={id} locked={!!account.locked} />
              <AccountMenuButton account={account} renderTrigger={(open) => <MoreButton onPress={open} />} />
            </View>
          )}
        </View>

        <EmojiText
          type="display"
          text={account.displayName}
          emojis={account.emojis}
        />
        <View style={styles.handleRow}>
          <ThemedText type="meta" selectable>
            @{fullHandle(account.handle, domain)}
          </ThemedText>
          {account.locked && (
            <SymbolView
              name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
              size={14}
              tintColor={theme.muted}
              accessibilityLabel={t('profile.badges.locked')}
            />
          )}
          {id !== accountId && <RelationshipBadges id={id} />}
        </View>

        <AccountBadges account={account} domain={domainOf(fullHandle(account.handle, domain)) ?? undefined} />

        {moderation.labels.length > 0 && (
          <View style={styles.labels}>
            {moderation.labels.map((label) => (
              <Badge key={label}>{label}</Badge>
            ))}
          </View>
        )}

        {account.note ? (
          <View style={styles.note}>
            <StatusContent content={account.note} />
          </View>
        ) : null}

        {account.fields && account.fields.length > 0 && <ProfileFields fields={account.fields} />}

        <CrossNetworkRow account={account} />

        {id !== accountId && capabilities?.privateNotes && <PrivateNote id={id} />}

        {capabilities?.profileExtras && (
          <>
            {id !== accountId && <FamiliarFollowers id={id} />}
            <FeaturedTags id={id} />
            <EndorsedAccounts id={id} />
          </>
        )}

        {capabilities?.starterPacks && <ActorStarterPacks id={id} />}

        <View style={styles.counts}>
          <Count value={counts.posts} label={t('profile.counts.posts', { count: counts.posts })} />
          <ThemedText type="meta">·</ThemedText>
          <Count
            value={counts.following}
            label={t('profile.counts.following')}
            onPress={() => router.push({ pathname: '/follows/[id]', params: { id, kind: 'following' } })}
          />
          <ThemedText type="meta">·</ThemedText>
          <Count
            value={counts.followers}
            label={t('profile.counts.followers', { count: counts.followers })}
            onPress={() => router.push({ pathname: '/follows/[id]', params: { id, kind: 'followers' } })}
          />
        </View>

        {account.createdAt && (
          <ThemedText type="meta" style={styles.joined}>
            {t('profile.joined', { date: monthYear(account.createdAt) })}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' });

function AccountBadges({ account, domain }: { account: Author; domain?: string }) {
  const { t } = useTranslation();
  const roles = account.roles ?? [];
  if (!roles.length && !account.bot) return null;
  return (
    <View style={styles.labels}>
      {roles.map((role) => (
        <Badge key={role.name} accessibilityLabel={t('profile.badges.role', { name: role.name })}>
          <ThemedText type="meta" themeColor="heading">
            {role.name}
          </ThemedText>
          {domain && <ThemedText type="meta">{domain}</ThemedText>}
        </Badge>
      ))}
      {account.bot && <Badge accessibilityLabel={t('profile.badges.botA11y')}>{t('profile.badges.bot')}</Badge>}
    </View>
  );
}

function ProfileFields({ fields }: { fields: ProfileField[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessibilityRole="list"
      accessibilityLabel={t('profile.fields.label')}
      style={[styles.fields, { backgroundColor: theme.surface }]}>
      {fields.map((field, index) => (
        <View key={`${field.name}:${index}`}>
          {index > 0 && <View style={[styles.fieldSeparator, { backgroundColor: theme.border }]} />}
          <FieldRow field={field} />
        </View>
      ))}
    </View>
  );
}

function FieldRow({ field }: { field: ProfileField }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const verified = field.verifiedAt ? monthYear(field.verifiedAt) : undefined;
  return (
    <View style={styles.field}>
      <ThemedText type="labelSmall" themeColor="muted" style={styles.fieldName} numberOfLines={2}>
        {field.name}
      </ThemedText>
      <View style={styles.fieldValue}>
        <StatusContent content={field.value} compact />
      </View>
      {verified && (
        <SymbolView
          name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
          size={16}
          tintColor={theme.primary}
          accessibilityLabel={t('profile.fields.verified', { date: verified })}
          style={styles.fieldVerified}
        />
      )}
    </View>
  );
}

function PrivateNote({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: relationship } = useRelationship(id);
  const save = useSetAccountNote(id);
  const [draft, setDraft] = useState<string | null>(null);

  if (!relationship) return null;
  const note = relationship.note ?? '';

  if (draft === null) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={note ? t('profile.note.editA11y', { note }) : t('profile.note.add')}
        accessibilityHint={t('profile.note.hint')}
        onPress={() => setDraft(note)}
        style={({ pressed }) => [
          styles.privateNote,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && { opacity: Press.opacity },
        ]}>
        <ThemedText type="meta">{t('profile.note.title')}</ThemedText>
        <ThemedText themeColor={note ? 'heading' : 'muted'}>{note || t('profile.note.add')}</ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.privateNote, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <ThemedText type="meta">{t('profile.note.title')}</ThemedText>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        autoFocus
        multiline
        maxLength={2000}
        placeholder={t('profile.note.add')}
        placeholderTextColor={theme.muted}
        selectionColor={theme.primary}
        accessibilityLabel={t('profile.note.inputA11y')}
        style={[styles.noteInput, { color: theme.heading }]}
      />
      <View style={styles.noteActions}>
        <Button label={t('common.cancel')} variant="outline" size="small" onPress={() => setDraft(null)} />
        <Button
          label={t('common.save')}
          size="small"
          loading={save.isPending}
          onPress={() => save.mutate(draft.trim(), { onSuccess: () => setDraft(null) })}
        />
      </View>
    </View>
  );
}

function RelationshipBadges({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: relationship } = useRelationship(id);
  if (!relationship) return null;

  const labels = [
    relationship.followedBy && t('profile.header.followsYou'),
    relationship.blocking && t('profile.header.blocked'),
    relationship.muting && t('profile.header.muted'),
  ].filter((label) => typeof label === 'string');

  return labels.map((label) => (
    <View key={label} style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText type="meta" themeColor="heading">
        {label}
      </ThemedText>
    </View>
  ));
}

function Count({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  const { t } = useTranslation();
  const text = (
    <ThemedText type="meta">
      <ThemedText type="meta" themeColor="heading">
        {value}
      </ThemedText>{' '}
      {label}
    </ThemedText>
  );
  if (!onPress) return text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('profile.counts.a11y', { count: value, label })}
      hitSlop={{ top: 13, bottom: 13, left: Spacing.one, right: Spacing.one }}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: Press.opacity }}>
      {text}
    </Pressable>
  );
}

function MoreButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('status.actions.more')}
      hitSlop={(TouchTarget - MORE_SIZE) / 2}
      onPress={onPress}
      style={({ pressed }) => [styles.more, { borderColor: theme.outline }, pressed && { opacity: Press.opacity }]}>
      <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }} size={18} tintColor={theme.heading} />
    </Pressable>
  );
}

function FollowButton({ id, locked }: { id: string; locked: boolean }) {
  const { t } = useTranslation();
  const { data: relationship } = useRelationship(id);
  const toggle = useToggleFollow(id);

  if (!relationship) return null;

  const active = relationship.following || relationship.requested;
  const label = relationship.following
    ? t('profile.follow.unfollow')
    : relationship.requested
      ? t('profile.follow.cancelRequest')
      : locked
        ? t('profile.follow.request')
        : t('profile.follow.follow');

  return (
    <Button
      label={label}
      variant={active ? 'outline' : 'primary'}
      size="small"
      loading={toggle.isPending}
      onPress={() => {
        tapHaptic();
        toggle.mutate(!active);
      }}
    />
  );
}

const MORE_SIZE = 36;

const AVATAR_OVERLAP = 40;

const styles = StyleSheet.create({
  more: {
    width: MORE_SIZE,
    height: MORE_SIZE,
    borderRadius: MORE_SIZE / 2,
    borderWidth: BorderWidth.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movedDim: {
    opacity: 0.5,
  },
  tabs: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  hideBoosts: {
    flexDirection: 'row',
  },
  handleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.two,
    rowGap: Spacing.one,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    borderWidth: Hairline,
  },
  profileActions: {
    flex: 1,
    alignSelf: 'flex-start',
    // Starts below the banner, so wrapped buttons grow down instead of over the header photo.
    marginTop: AVATAR_OVERLAP + Spacing.two,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  fields: {
    marginVertical: Spacing.three,
    overflow: 'hidden',
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  fieldSeparator: {
    height: Hairline,
    marginLeft: Spacing.three,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: TouchTarget,
    paddingVertical: Spacing.oneHalf,
    paddingHorizontal: Spacing.three,
  },
  fieldName: {
    width: '32%',
    maxWidth: 160,
    textTransform: 'uppercase',
  },
  fieldValue: {
    flex: 1,
    minWidth: 0,
  },
  fieldVerified: {
    alignSelf: 'center',
  },
  joined: {
    marginTop: Spacing.one,
  },
  loading: {
    padding: Spacing.five,
  },
  container: {
    borderBottomWidth: Hairline,
    paddingBottom: Spacing.four,
  },
  banner: {
    height: 150,
  },
  info: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: -AVATAR_OVERLAP,
    marginBottom: Spacing.three,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 44,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  note: {
    marginTop: Spacing.three,
  },
  privateNote: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    ...Outlined,
  },
  noteInput: {
    ...textStyles.input,
    minHeight: 44,
    padding: 0,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.one,
  },
});
