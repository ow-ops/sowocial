import { colord } from 'colord';
import { Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const MENTION = /(^|\s)(@[\w.-]+(?:@[\w-]+(?:\.[\w-]+)+)?)/g;

function splitMentions(text: string) {
  const parts: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = match.index + match[1].length;
    if (start > last) parts.push({ text: text.slice(last, start), mention: false });
    parts.push({ text: match[2], mention: true });
    last = start + match[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts;
}

export function MentionHighlight({ text }: { text: string }) {
  const theme = useTheme();
  const tint = colord(theme.primary).alpha(0.32).toRgbString();
  return splitMentions(text).map((part, i) =>
    part.mention ? (
      <Text key={i} style={{ backgroundColor: tint, borderRadius: 4 }}>
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  );
}
