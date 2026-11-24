import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { mastodon } from 'masto';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount, usePostingDefaults } from '@/api/accounts';
import { useInstance } from '@/api/ap/instance';
import type { Suggestion } from '@/api/ap/suggestions';
import { useCapabilities } from '@/api/backend';
import { toInteractionPolicy, type PostDraft } from '@/api/backend/draft';
import { takeRedraft, useStatus, useStatusSource, useThread } from '@/api/statuses';
import { isPollValid, pollToDraft } from '@/api/ap/poll';
import { resolveLanguage, resolveVisibility } from '@/api/compose-defaults';
import { charactersLeft, postLimits } from '@/api/compose-limits';
import type { Chain } from '@/api/compose-thread';
import { accountKey, useAuthedSession } from '@/auth/session';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ComposeAttachments, KeptAttachments } from '@/components/compose-attachments';
import { ComposeCross, useCrossPost } from '@/components/compose-cross';
import { ComposeContext, useComposeState } from '@/components/compose-state';
import { ComposeVideo } from '@/components/compose-video';
import { ComposeMoreSheet } from '@/components/compose-extras';
import { ComposeOptions, VisibilityPill } from '@/components/compose-options';
import { ComposePoll } from '@/components/compose-poll';
import { ComposeThread } from '@/components/compose-thread';
import { EmojiSuggestions, RecipientField, SuggestionList } from '@/components/compose-suggestions';
import { QuotedPost } from '@/components/quoted-post';
import { useAccountSource } from '@/components/source-badge';
import { StatusCard } from '@/components/status-card';
import { ThemedText, useTextStyle } from '@/components/themed-text';
import { LINE_INTO_AVATAR, ThreadLine } from '@/components/thread-line';
import { MentionHighlight } from '@/components/mention-highlight';
import { ReplyAccount } from '@/components/reply-account';
import { ColumnWidth, frameless, Hairline, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useComposeDraft } from '@/hooks/use-compose-draft';
import { useComposeSend } from '@/hooks/use-compose-send';
import { useTheme } from '@/hooks/use-theme';
import { useDensity } from '@/prefs/store';
import type { Media, Post } from '@/model/post';
import { AUTO_DRAFT, getDraft, type DraftSegment } from '@/utils/drafts';

type Prefill = { visibility?: mastodon.v1.StatusVisibility; text?: string; quoteLink?: string };

export function Composer({
  replyTo: replyParam,
  edit,
  quote: quoteParam,
  draft,
  redraft,
  ...prefill
}: Prefill & { replyTo?: string; edit?: string; redraft?: string; quote?: string; draft?: string }) {
  const owner = accountKey(useAuthedSession());
  const [resumed] = useState(() => (draft ? getDraft(owner, draft) : null));
  if (edit) return <EditComposer id={edit} />;
  if (redraft) return <RedraftComposer id={redraft} />;
  const replyTo = replyParam ?? resumed?.replyTo;
  const quote = quoteParam ?? resumed?.quote;
  // Prefilled visibility or text must not be restored from, or saved into, a draft.
  const draftId = prefill.visibility || prefill.text || prefill.quoteLink ? undefined : (draft ?? (replyTo ? `reply:${replyTo}` : quote ? `quote:${quote}` : AUTO_DRAFT));
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
  return <ComposerForm quoted={quoted} prefill={prefill} draftId={draftId} />;
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

function RedraftComposer({ id }: { id: string }) {
  const theme = useTheme();
  const [draft] = useState(() => takeRedraft(id));
  const { data: parent } = useStatus(draft?.replyTo ?? '');

  if (!draft) return <ComposerForm />;
  if (draft.replyTo && !parent) return <ActivityIndicator color={theme.muted} style={styles.loading} />;
  return (
    <ComposerForm
      parent={parent}
      initialText={draft.text}
      initialWarning={draft.warning}
      initialKept={draft.media}
      prefill={{ visibility: draft.visibility }}
      draftId={`redraft:${id}`}
    />
  );
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
  initialKept,
  prefill = {},
  draftId,
}: {
  parent?: Post;
  quoted?: Post;
  editing?: Post;
  initialText?: string;
  initialWarning?: string;
  initialKept?: Media[];
  prefill?: Prefill;
  draftId?: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const density = useDensity();
  const bodyStyle = useTextStyle('body');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const session = useAuthedSession();
  const { accountId } = session;
  const draftOwner = accountKey(session);
  const { data: me } = useAccount(accountId);
  const { data: instance } = useInstance();
  const capabilities = useCapabilities();
  const source = useAccountSource(true, draftOwner);
  const defaults = usePostingDefaults();

  const isNew = !parent && !editing;
  const { visibility: initialVisibility, text: prefillText, quoteLink } = prefill;
  const linkQuote = isNew && !prefillText && quoteLink ? `\n\nRE: ${quoteLink}` : undefined;
  const [saved] = useState(() => (draftId ? getDraft(draftOwner, draftId) : null));
  const [first, ...rest] = saved?.segments ?? [];
  const pollLimits = instance?.configuration.polls;

  const state = useComposeState({
    text: saved ? first.text : initialText || (isNew ? (prefillText ?? linkQuote) : undefined) || '',
    caret: linkQuote ? 0 : undefined,
    warning: saved ? saved.warning : initialWarning,
    showWarning: saved ? saved.showWarning : !!initialWarning,
    visibility: resolveVisibility({ editing: editing?.visibility, parent: parent?.visibility, prefill: initialVisibility, saved: saved?.visibility, defaults }),
    language: resolveLanguage(saved?.language, defaults),
    sensitive: !!defaults?.sensitive,
    editing,
    kept: initialKept,
    media: first?.media,
    video: first?.video,
    poll: first?.poll ?? (editing?.poll ? pollToDraft(editing.poll, pollLimits) : undefined),
    extras: rest.map(({ text, media }) => ({ text, media })),
    selfLabel: saved?.selfLabel,
    interactions: saved?.interactions,
    chain: saved?.chain,
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
    keptAttributes,
    selfLabel,
    interactions,
    video,
    poll,
    setPoll,
    extras,
    chain,
    altFocus,
    setAltFocus,
    setEmojiOpen,
    segments,
    advance,
  } = state;
  const scrollRef = useRef<ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const ancestors = useThread(parent?.id ?? '', !!parent).data?.ancestors ?? [];
  // Added after the first frame so maintainVisibleContentPosition keeps the reply in view.
  const [showThread, setShowThread] = useState(false);
  const threadScrolled = useRef(false);
  const [viewport, setViewport] = useState(0);
  const [threadHeight, setThreadHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  // Opens on the post being answered, with the earlier posts a scroll up; the reply below fills the screen so there
  // is room to scroll past them. iOS keeps its place through maintainVisibleContentPosition and its header inset;
  // Android needs the scroll, and react-native-web ignores that prop.
  useEffect(() => {
    if (Platform.OS === 'ios' || threadScrolled.current || !threadHeight || !viewport) return;
    threadScrolled.current = true;
    scrollRef.current?.scrollTo({ y: threadHeight, animated: false });
  }, [threadHeight, viewport]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShowThread(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const thread = showThread ? ancestors : [];
  useEffect(() => {
    if (!pollLimits) return;
    setPoll((current) => {
      if (!current) return current;
      const expiresIn = Math.min(Math.max(current.expiresIn, pollLimits.minExpiration), pollLimits.maxExpiration);
      return expiresIn === current.expiresIn ? current : { ...current, expiresIn };
    });
  }, [pollLimits, setPoll]);
  const pickRecipients = isNew && capabilities.mentionRecipients && visibility === 'direct';

  const discardDraft = useComposeDraft(
    draftOwner,
    draftId
      ? {
          id: draftId,
          updatedAt: 0,
          segments,
          warning,
          showWarning,
          visibility: visibilityChoice ?? saved?.visibility,
          language: languageChoice ?? saved?.language,
          replyTo: parent?.id,
          quote: quoted?.id,
          chain,
          selfLabel: selfLabel ?? undefined,
          interactions: capabilities.interactionControls ? interactions : undefined,
        }
      : null,
    // A re-draft's text exists nowhere else once its post is deleted, so it is kept even unchanged.
    initialKept ? '' : initialText,
  );

  const beforeCaret = text.slice(0, selection.start);
  const token = /(?:^|\s)([@#])([\w.@-]*)$/.exec(beforeCaret);
  const completion = capabilities.suggestions && token && { kind: token[1] === '@' ? ('account' as const) : ('tag' as const), query: token[2] };

  const emojiQuery = capabilities.customEmojis ? /(?:^|\s):([\w-]{2,})$/.exec(beforeCaret)?.[1] : undefined;

  const mentions = pickRecipients ? recipients.map((a) => `@${a.handle}`).join(' ') : '';
  const withMentions = (value: string) => (mentions ? `${mentions} ${value}` : value);

  const limits = postLimits(capabilities, instance?.configuration.statuses) ?? { characters: 500, reservedPerUrl: 23 };
  const remainingOf = (value: string) => charactersLeft(capabilities, value, showWarning ? warning : '', limits);
  const remaining = remainingOf(withMentions(text));
  const threadable = !editing && !scheduledAt;
  const extrasValid = extras.every((e) => (e.text.trim().length > 0 || e.media.length > 0) && remainingOf(withMentions(e.text)) >= 0);
  const pollValid = !poll || (!!pollLimits && text.trim().length > 0 && isPollValid(poll, pollLimits));
  const valid =
    (text.trim().length > 0 || media.length > 0 || kept.length > 0 || !!quoted || !!video) &&
    (!pickRecipients || recipients.length > 0 || /@\w/.test(text)) &&
    remaining >= 0 &&
    pollValid &&
    (extras.length === 0 || threadable) &&
    extrasValid;

  const insertSuggestion = (s: Suggestion) => {
    if (!completion) return;
    const start = selection.start - completion.query.length - 1;
    const inserted = `${completion.kind === 'account' ? '@' : '#'}${s.kind === 'account' ? s.account.handle : s.name} `;
    setText(text.slice(0, start) + inserted + text.slice(selection.start));
    const caret = start + inserted.length;
    setSelection({ start: caret, end: caret });
  };

  const insertEmoji = (shortcode: string) => {
    if (!emojiQuery) return;
    const start = selection.start - emojiQuery.length - 1;
    const inserted = `:${shortcode}: `;
    setText(text.slice(0, start) + inserted + text.slice(selection.start));
    const caret = start + inserted.length;
    setSelection({ start: caret, end: caret });
  };

  const draftFor = (segment: DraftSegment, at: Chain | undefined): PostDraft => {
    const common = {
      status: withMentions(segment.text),
      spoilerText: showWarning ? warning : undefined,
      visibility,
      inReplyToId: at ? at.inReplyToId : parent?.id,
      media: segment.media,
      poll: segment.poll,
      editId: editing?.id,
      quote: at ? undefined : quoted,
      language: editing ? undefined : language,
      sensitive: !capabilities.selfLabels && segment.media.length > 0 ? sensitive : undefined,
    };
    if (capabilities.protocol === 'bsky') {
      return {
        ...common,
        bsky: {
          parent: at ? undefined : parent,
          replyRef: at?.replyRef,
          video: segment.video,
          label: selfLabel ?? undefined,
          interactions,
        },
      };
    }
    return {
      ...common,
      ap: {
        keepMediaIds: kept.map((m) => m.id),
        mediaAttributes: keptAttributes,
        gts: editing
          ? undefined
          : {
              localOnly: localOnly || undefined,
              contentType: markdown ? 'text/markdown' : undefined,
              interactionPolicy: toInteractionPolicy(audiences),
              scheduledAt: scheduledAt?.toISOString(),
            },
      },
    };
  };

  const cross = useCrossPost(
    draftOwner,
    isNew && !quoted && !poll && extras.length === 0 && !scheduledAt,
    () => draftFor({ ...segments[0], poll: undefined }, undefined),
  );
  const { submit, pending, error, videoProgress } = useComposeSend({
    owner: draftOwner,
    parent,
    segments,
    chain,
    draftFor,
    advance,
    focusAlt: setAltFocus,
    onSent: () => {
      cross.send();
      discardDraft();
    },
  });
  const canPost = valid && !cross.blocked && !pending;

  return (
    <ComposeContext value={state}>
      <Stack.Screen
        options={{
          title: editing ? t('compose.titleEdit') : parent ? t('compose.titleReply') : t('compose.titleNew'),
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={styles.headerButton}>
              {Platform.OS === 'android' ? (
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={24} tintColor={theme.heading} />
              ) : (
                <ThemedText type="label" themeColor="primary">
                  {t('common.cancel')}
                </ThemedText>
              )}
            </Pressable>
          ),
          headerRight: () =>
            Platform.OS === 'android' ? (
              <Button
                label={editing ? t('common.save') : parent ? t('compose.submitReply') : t('compose.submitPost')}
                onPress={submit}
                disabled={!canPost}
                loading={pending}
                size="small"
              />
            ) : pending ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Pressable
                onPress={submit}
                disabled={!canPost}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canPost }}
                style={styles.headerButton}>
                <ThemedText type="label" themeColor={canPost ? 'primary' : 'muted'}>
                  {editing ? t('common.save') : parent ? t('compose.submitReply') : t('compose.submitPost')}
                </ThemedText>
              </Pressable>
            ),
        }}
      />
      <View style={styles.screen}>
        <KeyboardAwareScrollView
          ref={scrollRef}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
          style={column.listStyle}
          contentContainerStyle={styles.scroll}
          contentInsetAdjustmentBehavior="automatic"
          // The footer rides on the keyboard, so the caret has to clear both.
          bottomOffset={footerHeight + Spacing.three}
          keyboardShouldPersistTaps="handled">
          {thread.length > 0 && (
            <View
              style={[styles.column, styles.thread, { backgroundColor: theme.page }]}
              onLayout={(e) => setThreadHeight(e.nativeEvent.layout.height)}>
              {thread.map((post, i) => (
                <StatusCard key={post.key} status={post} preview lineAbove={i > 0} lineBelow />
              ))}
            </View>
          )}
          <View style={[styles.column, { backgroundColor: theme.page }, thread.length > 0 && { minHeight: viewport }]}>
            {(source || (!editing && capabilities.visibility)) && (
              <View style={styles.postingAs}>
                {source && <ReplyAccount
                  owner={draftOwner}
                  parent={editing ? undefined : parent}
                  text={initialText && text.startsWith(initialText) ? text.slice(initialText.length) : text}
                  // A quoted post's id belongs to this account's server, so a quote stays here.
                  isNew={isNew && !quoted}
                  leavesBehind={media.length > 0 || kept.length > 0 || !!video || !!poll || (showWarning && !!warning) || extras.length > 0}
                  onLeave={discardDraft}
                />}
                {!editing && capabilities.visibility && <VisibilityPill />}
              </View>
            )}

            {parent && <StatusCard status={parent} preview lineAbove={thread.length > 0} lineBelow />}

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
                    onFocus={() => setEmojiOpen(false)}
                    placeholder={t('compose.contentWarningPlaceholder')}
                    placeholderTextColor={theme.muted}
                    selectionColor={theme.primary}
                    style={[styles.warning, bodyStyle, { color: theme.heading, borderBottomColor: theme.border }]}
                  />
                )}

                <View>
                  {Platform.OS === 'web' && (
                    <ThemedText
                      aria-hidden
                      style={[styles.text, styles.mirror, bodyStyle]}>
                      <MentionHighlight text={text} />
                      {'\u200b'}
                    </ThemedText>
                  )}
                  <TextInput
                    value={Platform.OS === 'ios' ? undefined : text}
                    onChangeText={setText}
                    selection={selection}
                    onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                    onFocus={() => setEmojiOpen(false)}
                    placeholder={parent ? t('compose.placeholderReply') : t('compose.placeholderPost')}
                    placeholderTextColor={theme.muted}
                    selectionColor={theme.primary}
                    multiline
                    autoFocus
                    accessibilityLabel={parent ? t('compose.labelReply') : t('compose.labelPost')}
                    style={[styles.text, bodyStyle, { color: theme.heading }, Platform.OS === 'web' && styles.overMirror]}>
                    {Platform.OS === 'ios' ? <MentionHighlight text={text} /> : undefined}
                  </TextInput>
                </View>

                {completion && <SuggestionList kind={completion.kind} query={completion.query} onPick={insertSuggestion} />}
                {emojiQuery && <EmojiSuggestions query={emojiQuery} onPick={insertEmoji} />}

                <KeptAttachments media={kept} onChange={state.updateKept} />

                <ComposeAttachments
                  media={media}
                  onChange={state.updateMedia}
                  focusUri={altFocus}
                  onFocused={() => setAltFocus(null)}
                />

                {pollLimits && <ComposePoll limits={pollLimits} />}

                {capabilities.video && <ComposeVideo progress={videoProgress} busy={pending} />}

                {quoted && !chain && <QuotedPost post={quoted} />}

                {!editing && <ComposeThread canAdd={threadable} remainingOf={remainingOf} />}

                {error && <ThemedText themeColor="danger">{error.message}</ThemedText>}
              </View>
            </View>

            {cross.shown && <ComposeCross {...cross.props} />}
          </View>
        </KeyboardAwareScrollView>
        <KeyboardStickyView offset={{ opened: insets.bottom }}>
          <View style={[column.listStyle, { paddingBottom: insets.bottom }]}>
            <View style={styles.footer} onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
              <ComposeOptions remaining={remaining} canGateReplies={!parent} canAddPost={threadable} />
            </View>
          </View>
        </KeyboardStickyView>
      </View>
      {!editing && <ComposeMoreSheet open={state.moreOpen} onClose={() => state.setMoreOpen(false)} />}
    </ComposeContext>
  );
}

const styles = StyleSheet.create({
  loading: {
    padding: Spacing.five,
  },
  screen: {
    flex: 1,
  },
  footer: {
    width: '100%',
    maxWidth: ColumnWidth,
    alignSelf: 'center',
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
  thread: {
    flexGrow: 0,
  },
  postingAs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
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
  mirror: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    color: 'transparent',
    pointerEvents: 'none',
  },
  // Positioned so it stacks above the absolute mirror; otherwise the mirror takes the clicks.
  overMirror: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
});
