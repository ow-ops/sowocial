import { Stack, useRouter } from 'expo-router';
import type { mastodon } from 'masto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { graphemeCount, MAX_GRAPHEMES } from '@/api/bsky/compose';
import type { VideoProgress } from '@/api/bsky/video';
import { resolveLanguage, resolveVisibility, toInteractionPolicy, type Suggestion } from '@/api/ap/compose';
import { useAccount, usePostingDefaults } from '@/api/accounts';
import { useCapabilities } from '@/api/backend';
import { useInstance } from '@/api/ap/instance';
import { usePostStatus, useStatus, useStatusSource } from '@/api/statuses';
import { isPollValid, pollToDraft } from '@/api/ap/poll';
import { missingAlt } from '@/api/compose-alt';
import { nextChain, type Chain } from '@/api/compose-thread';
import type { PostDraft } from '@/api/backend/types';
import { accountKey, useAuthedSession } from '@/auth/session';
import { Avatar } from '@/components/avatar';
import { ComposeAttachments } from '@/components/compose-attachments';
import { ComposeContext, useComposeState } from '@/components/compose-state';
import { ComposeExtras } from '@/components/compose-extras';
import { ComposeVideo } from '@/components/compose-video';
import { ComposeOptions } from '@/components/compose-options';
import { ComposePoll } from '@/components/compose-poll';
import { ComposeThread } from '@/components/compose-thread';
import { RecipientField, SuggestionList } from '@/components/compose-suggestions';
import { QuotedPost } from '@/components/quoted-post';
import { NetworkGlyph, networkColor, useAccountSource } from '@/components/source-badge';
import { StatusCard } from '@/components/status-card';
import { ThemedText, useTextStyle } from '@/components/themed-text';
import { LINE_INTO_AVATAR, ThreadLine } from '@/components/thread-line';
import { ColumnWidth, frameless, Hairline, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import { getPref, useDensity } from '@/prefs/store';
import type { BskyPost, Post } from '@/model/post';
import { confirmAction } from '@/utils/dialog';
import { AUTO_DRAFT, deleteDraft, getDraft, saveDraft } from '@/utils/drafts';
import { showError } from '@/utils/toast';
import { countCharacters } from '@/utils/text';

type Segment = { text: string; media: PostDraft['media']; video?: PostDraft['video']; poll?: PostDraft['poll'] };

type Prefill = { visibility?: mastodon.v1.StatusVisibility; text?: string };

export function Composer({
  replyTo: replyParam,
  edit,
  quote: quoteParam,
  draft,
  ...prefill
}: Prefill & { replyTo?: string; edit?: string; quote?: string; draft?: string }) {
  const owner = accountKey(useAuthedSession());
  const [resumed] = useState(() => (draft ? getDraft(owner, draft) : null));
  if (edit) return <EditComposer id={edit} />;
  const replyTo = replyParam ?? resumed?.replyTo;
  const quote = quoteParam ?? resumed?.quote;
  // Prefilled visibility or text must not be restored from, or saved into, a draft.
  const draftId = prefill.visibility || prefill.text ? undefined : (draft ?? (replyTo ? `reply:${replyTo}` : quote ? `quote:${quote}` : AUTO_DRAFT));
  if (quote) return <QuoteComposer id={quote} prefill={prefill} draftId={draftId} />;
  return replyTo ? (
    <ReplyComposer replyTo={replyTo} prefill={prefill} draftId={draftId} />
  ) : (
    <ComposerForm prefill={prefill} draftId={draftId} />
  );
}

function QuoteComposer({ id, prefill, draftId }: { id: string; prefill: Prefill; draftId?: string }) {
  const theme = useTheme();
  const { data: quoted } = useStatus(id);

  if (!quoted) return <ActivityIndicator color={theme.muted} style={styles.loading} />;
  return <ComposerForm quoted={quoted.protocol === 'bsky' ? quoted : undefined} prefill={prefill} draftId={draftId} />;
}

// Edits start from the source text the author typed, not the server's HTML.
function EditComposer({ id }: { id: string }) {
  const theme = useTheme();
  const { data: status } = useStatus(id);
  const { data: source, error } = useStatusSource(id);

  if (error) return <ThemedText themeColor="danger" style={styles.loading}>{error.message}</ThemedText>;
  if (!status || !source) return <ActivityIndicator color={theme.muted} style={styles.loading} />;
  return <ComposerForm editing={status} initialText={source.text} initialWarning={source.spoilerText} />;
}

function ReplyComposer({ replyTo, prefill, draftId }: { replyTo: string; prefill: Prefill; draftId?: string }) {
  const theme = useTheme();
  const { accountId } = useAuthedSession();
  const { data: parent } = useStatus(replyTo);

  if (!parent) return <ActivityIndicator color={theme.muted} style={styles.loading} />;

  const handles =
    parent.protocol === 'bsky'
      ? []
      : [parent.author, ...(parent.mentions ?? [])].filter((a) => a.id !== accountId).map((a) => `@${a.handle}`);
  const initialText = handles.length ? `${[...new Set(handles)].join(' ')} ` : '';

  return <ComposerForm parent={parent} initialText={initialText} prefill={prefill} draftId={draftId} />;
}

function ComposerForm({
  parent,
  quoted,
  editing,
  initialText = '',
  initialWarning = parent?.contentWarning ?? '',
  prefill = {},
  draftId,
}: {
  parent?: Post;
  quoted?: BskyPost;
  editing?: Post;
  initialText?: string;
  initialWarning?: string;
  prefill?: Prefill;
  draftId?: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const density = useDensity();
  const bodyStyle = useTextStyle('body');
  const router = useRouter();
  const column = useColumn();
  const session = useAuthedSession();
  const { accountId } = session;
  const draftOwner = accountKey(session);
  const { data: me } = useAccount(accountId);
  const { data: instance } = useInstance();
  const post = usePostStatus();
  const capabilities = useCapabilities();
  const source = useAccountSource(true, draftOwner);
  const defaults = usePostingDefaults();

  const isNew = !parent && !editing;
  const { visibility: initialVisibility, text: prefillText } = prefill;
  const [saved] = useState(() => (draftId ? getDraft(draftOwner, draftId) : null));
  const [first, ...rest] = saved?.segments ?? [];
  const pollLimits = instance?.configuration.polls;

  const state = useComposeState({
    text: saved ? first.text : initialText || (isNew ? prefillText : undefined) || '',
    warning: saved ? saved.warning : initialWarning,
    showWarning: saved ? saved.showWarning : !!initialWarning,
    visibility: resolveVisibility({ editing: editing?.visibility, parent: parent?.visibility, prefill: initialVisibility, saved: saved?.visibility, defaults }),
    language: resolveLanguage(saved?.language, defaults),
    sensitive: !!defaults?.sensitive,
    editing,
    media: first?.media,
    video: first?.video,
    poll: first?.poll ?? (editing?.poll ? pollToDraft(editing.poll, pollLimits) : undefined),
    extras: rest.map(({ text, media }) => ({ text, media })),
    selfLabel: saved?.selfLabel,
    interactions: saved?.interactions,
  });
  const {
    text,
    setText,
    selection,
    setSelection,
    warning,
    setWarning,
    showWarning,
    visibility,
    visibilityChoice,
    language,
    languageChoice,
    sensitive,
    localOnly,
    markdown,
    audiences,
    scheduledAt,
    recipients,
    setRecipients,
    media,
    kept,
    selfLabel,
    interactions,
    video,
    setVideo,
    poll,
    setPoll,
    extras,
    setExtras,
    updateExtra,
    setMedia,
  } = state;
  const sent = useRef(false);
  const original = editing?.poll && pollToDraft(editing.poll, pollLimits);
  const resetsVotes =
    !!poll && !!original && (poll.multiple !== original.multiple || poll.options.join('\n') !== original.options.join('\n'));
  const [chain, setChain] = useState<Chain | undefined>(saved?.chain);
  const [altFocus, setAltFocus] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<VideoProgress | null>(null);
  useEffect(() => {
    if (!pollLimits) return;
    setPoll((current) => {
      if (!current) return current;
      const expiresIn = Math.min(Math.max(current.expiresIn, pollLimits.minExpiration), pollLimits.maxExpiration);
      return expiresIn === current.expiresIn ? current : { ...current, expiresIn };
    });
  }, [pollLimits, setPoll]);
  const pickRecipients = isNew && capabilities.mentionRecipients && visibility === 'direct';

  useEffect(() => {
    if (!draftId || sent.current) return;
    saveDraft(
      draftOwner,
      {
        id: draftId,
        updatedAt: 0,
        segments: [{ text, media, video: video ?? undefined, poll: poll ?? undefined }, ...extras],
        warning,
        showWarning,
        visibility: visibilityChoice ?? saved?.visibility,
        language: languageChoice ?? saved?.language,
        replyTo: parent?.id,
        quote: quoted?.id,
        chain,
        selfLabel: selfLabel ?? undefined,
        interactions: capabilities.interactionControls ? interactions : undefined,
      },
      initialText,
    );
  }, [draftId, draftOwner, text, media, video, poll, extras, warning, showWarning, visibilityChoice, languageChoice, saved, chain, parent?.id, quoted?.id, initialText, selfLabel, interactions, capabilities.interactionControls]);

  const token = /(?:^|\s)([@#])([\w.@-]*)$/.exec(text.slice(0, selection.start));
  const completion = capabilities.suggestions && token && { kind: token[1] === '@' ? ('account' as const) : ('tag' as const), query: token[2] };

  const mentions = pickRecipients ? recipients.map((a) => `@${a.handle}`).join(' ') : '';
  const withMentions = (value: string) => (mentions ? `${mentions} ${value}` : value);

  const limits = instance?.configuration.statuses;
  const remainingOf = (value: string) =>
    capabilities.graphemeLimit
      ? MAX_GRAPHEMES - graphemeCount(value.trim())
      : (limits?.maxCharacters ?? 500) -
        countCharacters(value + (showWarning ? warning : ''), limits?.charactersReservedPerUrl ?? 23);
  const remaining = remainingOf(withMentions(text));
  const threadable = !editing && !scheduledAt;
  const extrasValid = extras.every((e) => (e.text.trim().length > 0 || e.media.length > 0) && remainingOf(withMentions(e.text)) >= 0);
  const pollValid = !poll || (!!pollLimits && text.trim().length > 0 && isPollValid(poll, pollLimits));
  const canSubmit =
    (text.trim().length > 0 || media.length > 0 || kept.length > 0 || !!quoted || !!video) &&
    (!pickRecipients || recipients.length > 0 || /@\w/.test(text)) &&
    remaining >= 0 &&
    pollValid &&
    (extras.length === 0 || threadable) &&
    extrasValid &&
    !post.isPending;

  const insertSuggestion = (s: Suggestion) => {
    if (!completion) return;
    const start = selection.start - completion.query.length - 1;
    const inserted = `${completion.kind === 'account' ? '@' : '#'}${s.kind === 'account' ? s.account.handle : s.name} `;
    setText(text.slice(0, start) + inserted + text.slice(selection.start));
    const caret = start + inserted.length;
    setSelection({ start: caret, end: caret });
  };

  const draftFor = (segment: Segment, at: Chain | undefined): PostDraft => ({
    status: withMentions(segment.text),
    spoilerText: showWarning ? warning : undefined,
    visibility,
    inReplyToId: at ? at.inReplyToId : parent?.id,
    replyRef: at?.replyRef,
    media: segment.media,
    video: segment.video,
    poll: segment.poll,
    onVideoProgress: setVideoProgress,
    editId: editing?.id,
    keepMediaIds: kept.map((m) => m.id),
    parent: !at && parent?.protocol === 'bsky' ? parent : undefined,
    quote: at ? undefined : quoted,
    label: selfLabel ?? undefined,
    interactions: capabilities.interactionControls ? interactions : undefined,
    language: editing ? undefined : language,
    sensitive: !capabilities.selfLabels && segment.media.length > 0 ? sensitive : undefined,
    gts: editing
      ? undefined
      : {
          localOnly: localOnly || undefined,
          contentType: markdown ? 'text/markdown' : undefined,
          interactionPolicy: toInteractionPolicy(audiences),
          scheduledAt: scheduledAt?.toISOString(),
        },
  });

  // The single place a post is about to be sent; each unsent segment is promoted into the main fields as the one before it succeeds.
  const submit = () => {
    const [firstMissing] = getPref('altReminder') ? missingAlt([{ media, video }, ...extras]) : [];
    if (firstMissing === undefined) return void send();
    confirmAction(t('compose.altReminder.title'), t('compose.altReminder.postAnyway'), () => void send(), {
      cancelLabel: t('compose.altReminder.add'),
      onCancel: () => setAltFocus(firstMissing),
      destructive: false,
    });
  };

  const send = async () => {
    const queue: Segment[] = [{ text, media, video: video ?? undefined, poll: poll ?? undefined }, ...extras];
    let at = chain;
    for (let i = 0; i < queue.length; i++) {
      let outcome;
      try {
        outcome = await post.mutateAsync(draftFor(queue[i], at));
      } catch (error) {
        showError(
          queue.length > 1 ? t('compose.thread.failed', { number: i + 1, total: queue.length }) : t('compose.submitFailed'),
          error instanceof Error ? error.message : undefined,
        );
        return;
      }
      at = nextChain(outcome, at, parent?.protocol === 'bsky' ? parent : undefined);
      if (i === queue.length - 1) break;
      const next = queue[i + 1];
      setChain(at);
      setText(next.text);
      setSelection({ start: next.text.length, end: next.text.length });
      setMedia(next.media);
      setVideo(null);
      setPoll(null);
      setExtras(queue.slice(i + 2));
    }
    sent.current = true;
    if (draftId) deleteDraft(draftOwner, draftId);
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: editing ? t('compose.titleEdit') : parent ? t('compose.titleReply') : t('compose.titleNew'),
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              style={styles.headerButton}>
              <ThemedText type="label" themeColor="primary">
                {t('common.cancel')}
              </ThemedText>
            </Pressable>
          ),
          headerRight: () =>
            post.isPending ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                style={styles.headerButton}>
                <ThemedText type="label" themeColor={canSubmit ? 'primary' : 'muted'}>
                  {editing ? t('common.save') : parent ? t('compose.submitReply') : t('compose.submitPost')}
                </ThemedText>
              </Pressable>
            ),
        }}
      />
      <KeyboardAwareScrollView
        style={column.listStyle}
        contentContainerStyle={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        bottomOffset={Spacing.three}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.column, { backgroundColor: theme.page }]}>
          {source && (
            <View
              style={styles.postingAs}
              accessible
              accessibilityLabel={t('auth.network.postingAs', { handle: source.handle, network: source.network })}>
              <NetworkGlyph protocol={source.protocol} />
              <ThemedText type="meta" themeColor={networkColor(source.protocol)}>
                {source.network}
              </ThemedText>
              <ThemedText type="meta" numberOfLines={1} style={styles.postingHandle}>
                {source.handle}
              </ThemedText>
            </View>
          )}

          {parent && <StatusCard status={parent} preview lineBelow />}

          <View style={[styles.draft, { paddingHorizontal: density.padding }]}>
            <View style={[styles.avatarColumn, { width: density.avatar }]}>
              {parent && <ThreadLine center={density.avatar / 2} height={LINE_INTO_AVATAR} />}
              {me ? (
                <Avatar uri={me.avatar} size={density.avatar} />
              ) : (
                <View style={{ width: density.avatar, height: density.avatar }} />
              )}
            </View>

            <View style={styles.fields}>
              {parent && (
                <ThemedText type="meta" numberOfLines={1}>
                  <Trans
                    i18nKey="compose.replyingTo"
                    values={{ acct: parent.author.handle }}
                    components={{ handle: <ThemedText type="meta" themeColor="primary" /> }}
                  />
                  {parent.author.pronouns && (
                    <>
                      {' · '}
                      <ThemedText type="meta" themeColor="primary">
                        {parent.author.pronouns}
                      </ThemedText>
                    </>
                  )}
                </ThemedText>
              )}

              {pickRecipients && <RecipientField recipients={recipients} onChange={setRecipients} />}

              {showWarning && (
                <TextInput
                  value={warning}
                  onChangeText={setWarning}
                  placeholder={t('compose.contentWarningPlaceholder')}
                  placeholderTextColor={theme.muted}
                  selectionColor={theme.primary}
                  style={[styles.warning, bodyStyle, { color: theme.heading, borderBottomColor: theme.border }]}
                />
              )}

              <TextInput
                value={text}
                onChangeText={setText}
                selection={selection}
                onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                placeholder={parent ? t('compose.placeholderReply') : t('compose.placeholderPost')}
                placeholderTextColor={theme.muted}
                selectionColor={theme.primary}
                multiline
                autoFocus
                accessibilityLabel={parent ? t('compose.labelReply') : t('compose.labelPost')}
                style={[styles.text, bodyStyle, { color: theme.heading }]}
              />

              {completion && <SuggestionList kind={completion.kind} query={completion.query} onPick={insertSuggestion} />}

              <ComposeAttachments
                media={media}
                onChange={state.updateMedia}
                focusUri={altFocus}
                onFocused={() => setAltFocus(null)}
              />

              {poll && pollLimits && (
                <ComposePoll
                  poll={poll}
                  limits={pollLimits}
                  onChange={setPoll}
                  onRemove={() => setPoll(null)}
                  resetsVotes={resetsVotes}
                />
              )}

              {capabilities.video && (
                <ComposeVideo
                  video={video}
                  onChange={setVideo}
                  hasImages={media.length > 0}
                  progress={videoProgress}
                  busy={post.isPending}
                  focusUri={altFocus}
                  onFocused={() => setAltFocus(null)}
                />
              )}

              {quoted && !chain && <QuotedPost post={quoted} />}

              {!editing && (
                <ComposeThread
                  segments={extras}
                  onChange={updateExtra}
                  onAdd={() => setExtras((current) => [...current, { text: '', media: [] }])}
                  canAdd={threadable}
                  remainingOf={remainingOf}
                  focusUri={altFocus}
                  onFocused={() => setAltFocus(null)}
                />
              )}

              {post.isError && <ThemedText themeColor="danger">{post.error.message}</ThemedText>}
            </View>
          </View>

          <ComposeContext value={state}>
            <ComposeOptions remaining={remaining} canGateReplies={!parent} />
            <ComposeExtras />
          </ComposeContext>
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    padding: Spacing.five,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: ColumnWidth,
  },
  postingAs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  postingHandle: {
    flexShrink: 1,
  },
  draft: {
    flexDirection: 'row',
    gap: Spacing.oneHalf,
    paddingBottom: Spacing.three,
  },
  avatarColumn: {
    paddingTop: Spacing.three,
  },
  fields: {
    flex: 1,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  headerButton: {
    paddingHorizontal: Spacing.two,
  },
  warning: {
    ...frameless,
    paddingVertical: Spacing.two,
    borderBottomWidth: Hairline,
  },
  text: {
    ...frameless,
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
