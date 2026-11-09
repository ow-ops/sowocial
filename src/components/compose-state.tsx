import * as ImagePicker from 'expo-image-picker';
import type { mastodon } from 'masto';
import { createContext, use, useState } from 'react';

import { OPEN_INTERACTIONS, type PostInteractions, type SelfLabel } from '@/api/bsky/compose';
import { deviceLanguage, OPEN_AUDIENCES, type InteractionAudiences } from '@/api/ap/compose';
import type { VideoDraft } from '@/api/bsky/video';
import type { Draft } from '@/api/statuses';
import type { Author, Post } from '@/model/post';

export const MAX_MEDIA = 4;

type Initial = {
  text: string;
  warning: string;
  showWarning: boolean;
  visibility: mastodon.v1.StatusVisibility;
  editing?: Post;
};

export function useComposeState(initial: Initial) {
  const [text, setText] = useState(initial.text);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [warning, setWarning] = useState(initial.warning);
  const [showWarning, setShowWarning] = useState(initial.showWarning);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [language, setLanguage] = useState(() => deviceLanguage());
  const [localOnly, setLocalOnly] = useState(false);
  const [markdown, setMarkdown] = useState(false);
  const [audiences, setAudiences] = useState<InteractionAudiences>(OPEN_AUDIENCES);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [recipients, setRecipients] = useState<Author[]>([]);
  const [media, setMedia] = useState<Draft['media']>([]);
  const [selfLabel, setSelfLabel] = useState<SelfLabel | null>(null);
  const [video, setVideo] = useState<VideoDraft | null>(null);
  const [interactions, setInteractions] = useState<PostInteractions>(OPEN_INTERACTIONS);

  // An edit keeps its attachments; the server cannot change visibility after posting.
  const kept = initial.editing?.media ?? [];

  const pickImages = async () => {
    if (video) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA - media.length,
      quality: 0.8,
    });
    if (result.canceled) return;
    const picked = result.assets.map((a) => ({ uri: a.uri, description: '' }));
    setMedia((current) => [...current, ...picked].slice(0, MAX_MEDIA));
  };

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
    text,
    setText,
    selection,
    setSelection,
    warning,
    setWarning,
    showWarning,
    setShowWarning,
    visibility,
    setVisibility,
    language,
    setLanguage,
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
    selfLabel,
    setSelfLabel,
    video,
    setVideo,
    interactions,
    setInteractions,
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
