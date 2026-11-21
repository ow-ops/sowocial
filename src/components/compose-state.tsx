import * as ImagePicker from 'expo-image-picker';
import type { mastodon } from 'masto';
import { createContext, use, useState } from 'react';

import {
  OPEN_AUDIENCES,
  OPEN_INTERACTIONS,
  type InteractionAudiences,
  type PollDraft,
  type PostInteractions,
  type SelfLabel,
  type VideoDraft,
} from '@/api/backend/draft';
import type { Chain } from '@/api/compose-thread';
import type { Draft } from '@/api/statuses';
import type { Author, Media, Post } from '@/model/post';
import { t } from '@/i18n';
import type { DraftSegment } from '@/utils/drafts';
import { showError } from '@/utils/toast';

export const MAX_MEDIA = 4;

export type ThreadSegment = { text: string; media: Draft['media'] };

type Initial = {
  text: string;
  caret?: number;
  warning: string;
  showWarning: boolean;
  visibility: mastodon.v1.StatusVisibility;
  language: string;
  sensitive: boolean;
  editing?: Post;
  // Already on the server: an edited post's, or a re-drafted one's.
  kept?: Media[];
  media?: Draft['media'];
  video?: VideoDraft | null;
  poll?: PollDraft | null;
  extras?: ThreadSegment[];
  selfLabel?: SelfLabel | null;
  interactions?: PostInteractions;
  chain?: Chain;
};

export async function pickImageDrafts(limit: number): Promise<Draft['media']> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: limit,
      quality: 0.8,
    });
    return result.canceled ? [] : result.assets.map((a) => ({ uri: a.uri, description: '' }));
  } catch (error) {
    showError(t('compose.attachments.pickFailed'), error instanceof Error ? error.message : undefined);
    return [];
  }
}

export function useComposeState(initial: Initial) {
  const [text, setText] = useState(initial.text);
  const caret = initial.caret ?? initial.text.length;
  const [selection, setSelection] = useState({ start: caret, end: caret });
  const [warning, setWarning] = useState(initial.warning);
  const [showWarning, setShowWarning] = useState(initial.showWarning);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [visibilityChoice, setVisibility] = useState<mastodon.v1.StatusVisibility | null>(null);
  const [languageChoice, setLanguage] = useState<string | null>(null);
  const [sensitiveChoice, setSensitive] = useState<boolean | null>(null);
  const visibility = visibilityChoice ?? initial.visibility;
  const language = languageChoice ?? initial.language;
  const sensitive = sensitiveChoice ?? initial.sensitive;
  const [localOnly, setLocalOnly] = useState(false);
  const [markdown, setMarkdown] = useState(false);
  const [audiences, setAudiences] = useState<InteractionAudiences>(OPEN_AUDIENCES);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [recipients, setRecipients] = useState<Author[]>([]);
  const [media, setMedia] = useState<Draft['media']>(initial.media ?? []);
  const [selfLabel, setSelfLabel] = useState<SelfLabel | null>(initial.selfLabel ?? null);
  const [video, setVideo] = useState<VideoDraft | null>(initial.video ?? null);
  const [poll, setPoll] = useState<PollDraft | null>(initial.poll ?? null);
  const [extras, setExtras] = useState(initial.extras ?? []);
  const [interactions, setInteractions] = useState<PostInteractions>(initial.interactions ?? OPEN_INTERACTIONS);
  const [chain, setChain] = useState(initial.chain);
  const [altFocus, setAltFocus] = useState<string | null>(null);

  const [initialKept] = useState(() => initial.kept ?? initial.editing?.media ?? []);
  const [kept, setKept] = useState<Media[]>(initialKept);
  const keptAttributes = kept
    .filter((m) => (m.alt ?? '') !== (initialKept.find((k) => k.id === m.id)?.alt ?? ''))
    .map((m) => ({ id: m.id, description: m.alt ?? '' }));

  const segments: DraftSegment[] = [{ text, media, video: video ?? undefined, poll: poll ?? undefined }, ...extras];

  // Promotes the first of the unsent posts into the form as the one before it goes out.
  const advance = ([next, ...rest]: DraftSegment[], at: Chain | undefined) => {
    setChain(at);
    setText(next.text);
    setSelection({ start: next.text.length, end: next.text.length });
    setMedia(next.media);
    setVideo(null);
    setPoll(null);
    setExtras(rest);
  };

  const pickImages = async () => {
    if (video || poll) return;
    const room = MAX_MEDIA - kept.length;
    const picked = await pickImageDrafts(room - media.length);
    setMedia((current) => [...current, ...picked].slice(0, room));
  };

  const updateKept = (id: string, change: { alt: string } | null) =>
    setKept((current) => (change === null ? current.filter((m) => m.id !== id) : current.map((m) => (m.id === id ? { ...m, ...change } : m))));

  const updateExtra = (index: number, change: Partial<ThreadSegment> | null) =>
    setExtras((current) =>
      change === null ? current.filter((_, i) => i !== index) : current.map((e, i) => (i === index ? { ...e, ...change } : e)),
    );

  const updateMedia = (uri: string, change: Partial<Draft['media'][number]> | null) =>
    setMedia((current) =>
      change === null
        ? current.filter((m) => m.uri !== uri)
        : current.map((m) => (m.uri === uri ? { ...m, ...change } : m)),
    );

  const insertEmoji = (shortcode: string) => {
    const token = `:${shortcode}: `;
    const { start, end } = selection;
    const before = text.slice(0, start);
    const spaced = before && !/\s$/.test(before) ? ' ' : '';
    const inserted = spaced + token;
    setText(before + inserted + text.slice(end));
    const caret = start + inserted.length;
    setSelection({ start: caret, end: caret });
  };

  return {
    editing: initial.editing,
    kept,
    keptAttributes,
    updateKept,
    text,
    setText,
    selection,
    setSelection,
    warning,
    setWarning,
    showWarning,
    setShowWarning,
    emojiOpen,
    setEmojiOpen,
    moreOpen,
    setMoreOpen,
    visibility,
    visibilityChoice,
    setVisibility,
    language,
    languageChoice,
    setLanguage,
    sensitive,
    setSensitive,
    localOnly,
    setLocalOnly,
    markdown,
    setMarkdown,
    audiences,
    setAudiences,
    scheduledAt,
    setScheduledAt,
    recipients,
    setRecipients,
    media,
    setMedia,
    poll,
    setPoll,
    extras,
    setExtras,
    updateExtra,
    selfLabel,
    setSelfLabel,
    video,
    setVideo,
    interactions,
    setInteractions,
    chain,
    altFocus,
    setAltFocus,
    segments,
    advance,
    pickImages,
    updateMedia,
    insertEmoji,
  };
}

export type ComposeState = ReturnType<typeof useComposeState>;

export const ComposeContext = createContext<ComposeState | null>(null);

export function useCompose() {
  const state = use(ComposeContext);
  if (!state) throw new Error('useCompose must be used inside a ComposeContext');
  return state;
}
