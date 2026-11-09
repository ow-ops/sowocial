import { Stack, useRouter } from 'expo-router';
import type { mastodon } from 'masto';
import { useEffect, useState } from 'react';
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
import { accountKey, useAuthedSession } from '@/auth/session';
import { Avatar, AVATAR_SIZE } from '@/components/avatar';
import { ComposeAttachments } from '@/components/compose-attachments';
import { ComposeContext, useComposeState } from '@/components/compose-state';
import { ComposeExtras } from '@/components/compose-extras';
import { ComposeVideo } from '@/components/compose-video';
import { ComposeOptions } from '@/components/compose-options';
import { RecipientField, SuggestionList } from '@/components/compose-suggestions';
import { QuotedPost } from '@/components/quoted-post';
import { NetworkGlyph, networkColor, useAccountSource } from '@/components/source-badge';
import { StatusCard } from '@/components/status-card';
import { ThemedText, textStyles } from '@/components/themed-text';
import { LINE_INTO_AVATAR, ThreadLine } from '@/components/thread-line';
import { ColumnWidth, frameless, Hairline, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';
import type { BskyPost, Post } from '@/model/post';
import { clearDraft, loadDraft, saveDraft } from '@/utils/drafts';
import { countCharacters } from '@/utils/text';

type Prefill = { visibility?: mastodon.v1.StatusVisibility; text?: string };

export function Composer({ replyTo, edit, quote, ...prefill }: Prefill & { replyTo?: string; edit?: string; quote?: string }) {
  if (edit) return <EditComposer id={edit} />;
  if (quote) return <QuoteComposer id={quote} prefill={prefill} />;
  return replyTo ? <ReplyComposer replyTo={replyTo} prefill={prefill} /> : <ComposerForm prefill={prefill} />;
}

function QuoteComposer({ id, prefill }: { id: string; prefill: Prefill }) {
  const theme = useTheme();
  const { data: quoted } = useStatus(id);

  if (!quoted) return <ActivityIndicator color={theme.muted} style={styles.loading} />;
  return <ComposerForm quoted={quoted.protocol === 'bsky' ? quoted : undefined} prefill={prefill} />;
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

function ReplyComposer({ replyTo, prefill }: { replyTo: string; prefill: Prefill }) {
  const theme = useTheme();
  const { accountId } = useAuthedSession();
  const { data: parent } = useStatus(replyTo);

  if (!parent) return <ActivityIndicator color={theme.muted} style={styles.loading} />;

  const handles =
    parent.protocol === 'bsky'
      ? []
      : [parent.author, ...(parent.mentions ?? [])].filter((a) => a.id !== accountId).map((a) => `@${a.handle}`);
  const initialText = handles.length ? `${[...new Set(handles)].join(' ')} ` : '';

  return <ComposerForm parent={parent} initialText={initialText} prefill={prefill} />;
}

function ComposerForm({
  parent,
  quoted,
  editing,
  initialText = '',
  initialWarning = parent?.contentWarning ?? '',
  prefill = {},
}: {
  parent?: Post;
  quoted?: BskyPost;
  editing?: Post;
  initialText?: string;
  initialWarning?: string;
  prefill?: Prefill;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
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
  // A prefilled visibility or text must not be restored from, or saved into, the normal draft.
  const useDraft = isNew && !initialVisibility && !prefillText;
  const [saved] = useState(() => (useDraft ? loadDraft(draftOwner) : null));

  const state = useComposeState({
    text: initialText || (isNew ? prefillText : undefined) || saved?.text || '',
    warning: initialWarning || saved?.warning || '',
    showWarning: !!initialWarning || !!saved?.showWarning,
    visibility: resolveVisibility({ editing: editing?.visibility, parent: parent?.visibility, prefill: initialVisibility, saved: saved?.visibility, defaults }),
    language: resolveLanguage(saved?.language, defaults),
    sensitive: !!defaults?.sensitive,
    editing,
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
  } = state;
  const [videoProgress, setVideoProgress] = useState<VideoProgress | null>(null);
  const pickRecipients = isNew && capabilities.mentionRecipients && visibility === 'direct';

  useEffect(() => {
    if (useDraft) {
      saveDraft(draftOwner, {
        text,
        warning,
        showWarning,
        visibility: visibilityChoice ?? saved?.visibility,
        language: languageChoice ?? saved?.language,
      });
    }
  }, [useDraft, draftOwner, text, warning, showWarning, visibilityChoice, languageChoice, saved]);

  const token = /(?:^|\s)([@#])([\w.@-]*)$/.exec(text.slice(0, selection.start));
  const completion = capabilities.suggestions && token && { kind: token[1] === '@' ? ('account' as const) : ('tag' as const), query: token[2] };

  const mentions = pickRecipients ? recipients.map((a) => `@${a.handle}`).join(' ') : '';
  const body = mentions ? `${mentions} ${text}` : text;

  const limits = instance?.configuration.statuses;
  const remaining = capabilities.graphemeLimit
    ? MAX_GRAPHEMES - graphemeCount(text.trim())
    : (limits?.maxCharacters ?? 500) -
      countCharacters(body + (showWarning ? warning : ''), limits?.charactersReservedPerUrl ?? 23);
  const canSubmit =
    (text.trim().length > 0 || media.length > 0 || kept.length > 0 || !!quoted || !!video) &&
    (!pickRecipients || recipients.length > 0 || /@\w/.test(text)) &&
    remaining >= 0 &&
    !post.isPending;

  const insertSuggestion = (s: Suggestion) => {
    if (!completion) return;
    const start = selection.start - completion.query.length - 1;
    const inserted = `${completion.kind === 'account' ? '@' : '#'}${s.kind === 'account' ? s.account.handle : s.name} `;
    setText(text.slice(0, start) + inserted + text.slice(selection.start));
    const caret = start + inserted.length;
    setSelection({ start: caret, end: caret });
  };

  const submit = () =>
    post.mutate(
      {
        status: body,
        spoilerText: showWarning ? warning : undefined,
        visibility,
        inReplyToId: parent?.id,
        media,
        video: video ?? undefined,
        onVideoProgress: setVideoProgress,
        editId: editing?.id,
        keepMediaIds: kept.map((m) => m.id),
        parent: parent?.protocol === 'bsky' ? parent : undefined,
        quote: quoted,
        label: selfLabel ?? undefined,
        interactions: capabilities.interactionControls ? interactions : undefined,
        language: editing ? undefined : language,
        sensitive: !capabilities.selfLabels && media.length > 0 ? sensitive : undefined,
        gts: editing
          ? undefined
          : {
              localOnly: localOnly || undefined,
              contentType: markdown ? 'text/markdown' : undefined,
              interactionPolicy: toInteractionPolicy(audiences),
              scheduledAt: scheduledAt?.toISOString(),
            },
      },
      {
        onSuccess: () => {
          if (useDraft) clearDraft(draftOwner);
          router.back();
        },
      },
    );

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

          <View style={styles.draft}>
            <View style={styles.avatarColumn}>
              {parent && <ThreadLine center={AVATAR_SIZE / 2} height={LINE_INTO_AVATAR} />}
              {me ? (
                <Avatar uri={me.avatar} />
              ) : (
                <View style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
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
                  style={[styles.warning, { color: theme.heading, borderBottomColor: theme.border }]}
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
                style={[styles.text, { color: theme.heading }]}
              />

              {completion && <SuggestionList kind={completion.kind} query={completion.query} onPick={insertSuggestion} />}

              <ComposeAttachments
                media={media}
                onChange={state.updateMedia}
              />

              {capabilities.video && (
                <ComposeVideo
                  video={video}
                  onChange={setVideo}
                  hasImages={media.length > 0}
                  progress={videoProgress}
                  busy={post.isPending}
                />
              )}

              {quoted && <QuotedPost post={quoted} />}

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
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  avatarColumn: {
    width: AVATAR_SIZE,
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
    ...textStyles.input,
    paddingVertical: Spacing.two,
    borderBottomWidth: Hairline,
  },
  text: {
    ...frameless,
    ...textStyles.body,
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
