import RenderHTML, {
  defaultHTMLElementModels,
  HTMLContentModel,
  type CustomRendererProps,
  type MixedStyleRecord,
  type RenderersProps,
  type TBlock,
} from '@native-html/render';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Platform, Text, View } from 'react-native';

import { ThemedText, useTextStyle, type ThemedTextProps } from '@/components/themed-text';
import { ColumnWidth, Fonts, Spacing } from '@/constants/theme';
import { useColumn } from '@/hooks/use-column';
import { useOpenUrl } from '@/hooks/use-open-url';
import { useTheme } from '@/hooks/use-theme';
import type { RichContent, Segment } from '@/model/content';
import { useOpenAccount } from '@/hooks/use-open-account';
import type { Emoji, Hashtag, Mention } from '@/model/post';
import { EMOJI_SIZE, emojifyHtml, SHORTCODE } from '@/utils/emoji';
import { isWebUrl } from '@/utils/links';
import { renderMarkdown } from '@/utils/markdown';

const customHTMLElementModels = {
  img: defaultHTMLElementModels.img.extend({ contentModel: HTMLContentModel.mixed }),
};

// Custom emoji arrive as <img alt=":shortcode:">; expo-image caches them to disk unlike the default RN Image.
function EmojiImage({ tnode }: CustomRendererProps<TBlock>) {
  const { src, alt, width } = tnode.attributes;
  if (!src) return null;
  return (
    <Image
      source={src}
      recyclingKey={src}
      cachePolicy="memory-disk"
      accessibilityLabel={alt}
      style={inlineEmoji(Number(width) || EMOJI_SIZE)}
    />
  );
}

const renderers = { img: EmojiImage };

// Android sits an inline image on the text baseline, so it rides above the capitals; this centres it on them.
const inlineEmoji = (size: number) =>
  Platform.OS === 'android' ? { width: size, height: size, transform: [{ translateY: Math.round(size * 0.2) }] } : { width: size, height: size };

const NO_EMOJIS: Emoji[] = [];

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const KNOWN_ENTITY = /&(amp|lt|gt|quot|#39);/g;

// Plain <p>/<br> posts render as native Text, far cheaper than the HTML renderer.
function plainParagraphs(html: string, hasEmojis: boolean) {
  const stripped = html.replace(/<\/?p>|<br\s*\/?>/g, '').replace(KNOWN_ENTITY, '');
  if (/[<&]/.test(stripped)) return null;
  if (hasEmojis && html.search(SHORTCODE) !== -1) return null;
  const paragraphs = html
    .replace(/^<p>|<\/p>$/g, '')
    .split('</p><p>')
    .map((p) =>
      p
        .replace(/\s+/g, ' ')
        .replace(/ ?<br\s*\/?> ?/g, '\n')
        .replace(KNOWN_ENTITY, (e) => ENTITIES[e])
        .trim(),
    )
    .filter(Boolean);
  return paragraphs;
}

type Props = {
  content: RichContent;
  mentions?: Mention[];
  tags?: Hashtag[];
  size?: 'regular' | 'large';
  muted?: boolean;
  compact?: boolean;
  selectable?: boolean;
};

export function StatusContent({
  content,
  mentions = [],
  tags = [],
  size = 'regular',
  muted = false,
  compact = false,
  selectable: selectableProp = false,
}: Props) {
  // Native keeps timeline text unselectable so long-press reaches the card; web has no such conflict.
  const selectable = selectableProp || Platform.OS === 'web';
  const theme = useTheme();
  const router = useRouter();
  const openAccount = useOpenAccount();
  const openUrl = useOpenUrl();
  const { width } = useColumn();
  const lead = useTextStyle('lead');
  const body = useTextStyle('body');

  const tagsStyles = useMemo<MixedStyleRecord>(
    () => ({
      p: { marginTop: 0, marginBottom: compact ? 0 : Spacing.two },
      a: { color: theme.primary, textDecorationLine: 'none' },
      code: { fontFamily: Fonts.mono, backgroundColor: theme.surface },
    }),
    [theme.primary, theme.surface, compact],
  );
  const baseStyle = useMemo(
    () =>
      size === 'large'
        ? { color: theme.heading, ...lead }
        : { color: muted ? theme.muted : theme.text, ...body },
    [size, muted, theme.heading, theme.muted, theme.text, lead, body],
  );
  const raw = content.kind === 'html' ? content.html : '';
  // Android cannot extend a selection from one Text into the next, so selectable paragraphs share one.
  const merged = selectableProp && Platform.OS === 'android';
  const html = useMemo(() => {
    const rendered = renderMarkdown(raw);
    return merged ? rendered.replaceAll('</p><p>', '<br><br>') : rendered;
  }, [raw, merged]);
  const emojis = content.kind === 'html' ? content.emojis : NO_EMOJIS;
  const source = useMemo(() => ({ html: emojifyHtml(html, emojis) }), [html, emojis]);
  const plain = useMemo(
    () => (content.kind === 'html' ? plainParagraphs(html, emojis.length > 0) : null),
    [content.kind, html, emojis],
  );

  const openLink = async (href: string, className = '') => {
    const mention = mentions.find((m) => m.url === href);
    if (mention) return openAccount(mention.id);

    const tag =
      tags.find((t) => t.url.toLowerCase() === href.toLowerCase())?.name ??
      (className.includes('hashtag') ? href.match(/\/tags?\/([^/?#]+)$/i)?.[1] : undefined);
    if (tag) return router.push(`/tag/${decodeURIComponent(tag)}`);

    if (!isWebUrl(href)) return;

    openUrl(href, className.includes('mention'));
  };

  const openLinkRef = useRef(openLink);
  useEffect(() => {
    openLinkRef.current = openLink;
  });
  const textProps = useMemo(() => ({ selectable }), [selectable]);
  const renderersProps = useMemo<Partial<RenderersProps>>(
    () => ({ a: { onPress: (_event, href, attrs) => void openLinkRef.current(href, attrs.class) } }),
    [],
  );

  if (content.kind === 'segments') {
    if (content.segments.length === 0) return null;
    return (
      <SegmentsText
        segments={content.segments}
        style={[baseStyle, { marginBottom: compact ? 0 : Spacing.two }]}
        selectable={selectable}
        onOpen={(segment) => {
          if (segment.type === 'mention') {
            if (segment.id) openAccount(segment.id);
            else if (segment.url) openUrl(segment.url, true);
          } else if (segment.type === 'tag') router.push(`/tag/${encodeURIComponent(segment.name)}`);
          else if (segment.type === 'link') openUrl(segment.url);
        }}
      />
    );
  }

  if (plain) {
    if (plain.length === 0) return null;
    return (
      <View>
        {plain.map((text, i) => (
          <ThemedText key={i} selectable={selectable} style={[baseStyle, { marginBottom: compact ? 0 : Spacing.two }]}>
            {text}
          </ThemedText>
        ))}
      </View>
    );
  }

  return (
    <RenderHTML
      source={source}
      contentWidth={Math.min(width, ColumnWidth) - Spacing.three * 2}
      baseStyle={baseStyle}
      tagsStyles={tagsStyles}
      customHTMLElementModels={customHTMLElementModels}
      renderers={renderers}
      renderersProps={renderersProps}
      defaultTextProps={textProps}
    />
  );
}

type LinkSegment = Extract<Segment, { type: 'mention' | 'link' | 'tag' }>;

function SegmentsText({
  segments,
  style,
  selectable,
  onOpen,
}: {
  segments: Segment[];
  style: ThemedTextProps['style'];
  selectable: boolean;
  onOpen: (segment: LinkSegment) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedText style={style} selectable={selectable}>
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'text':
            return segment.text;
          case 'break':
            return '\n';
          case 'paragraph':
            return '\n\n';
          case 'emoji':
            return `:${segment.shortcode}:`;
          default:
            return (
              <Text
                key={i}
                accessibilityRole="link"
                onPress={() => onOpen(segment)}
                style={{ color: theme.primary }}>
                {segment.text}
              </Text>
            );
        }
      })}
    </ThemedText>
  );
}

export function EmojiText({
  text,
  emojis,
  ...props
}: ThemedTextProps & { text: string; emojis?: Emoji[] }) {
  const byCode = new Map((emojis ?? []).map((e) => [e.shortcode, e.url]));
  const parts = text.split(SHORTCODE);
  const hasEmoji = parts.some((part, i) => i % 2 === 1 && byCode.has(part));

  return (
    <ThemedText accessibilityLabel={hasEmoji ? text : undefined} {...props}>
      {parts.map((part, i) => {
        // split() with a capture group puts shortcodes at odd indexes.
        const url = i % 2 === 1 ? byCode.get(part) : undefined;
        if (url) {
          return (
            <Image
              key={i}
              source={url}
              recyclingKey={url}
              cachePolicy="memory-disk"
              style={inlineEmoji(EMOJI_SIZE * 0.85)}
            />
          );
        }
        return i % 2 === 1 ? `:${part}:` : part;
      })}
    </ThemedText>
  );
}
