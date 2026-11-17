import { colord, extend } from 'colord';
import mixPlugin from 'colord/plugins/mix';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

extend([mixPlugin]);

const WIDTH = 2;
const FAINT = 0.4;

// Opaque so overlapping lines don't darken.
const useFaintColor = () => {
  const theme = useTheme();
  return colord(theme.page).mix(theme.outline, FAINT).toHex();
};

const LEVEL_COLORS = ['primary', 'fediverse', 'bluesky', 'danger'] as const;
const LEVEL_STRENGTH = 0.7;

export const useLevelColor = () => {
  const theme = useTheme();
  return (level: number) => colord(theme.page).mix(theme[LEVEL_COLORS[level % LEVEL_COLORS.length]], LEVEL_STRENGTH).toHex();
};

// Gap of Spacing.one between the line and the avatar it leads into.
export const LINE_INTO_AVATAR = Spacing.three - Spacing.one;

type Props = {
  center: number;
  top?: number;
  height?: number;
  bottom?: number;
  faint?: boolean;
  color?: string;
};

export function ThreadLine({ center, top = 0, height, bottom, faint = false, color }: Props) {
  const theme = useTheme();
  const faintColor = useFaintColor();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: center - WIDTH / 2,
        top,
        height,
        bottom,
        width: WIDTH,
        borderRadius: WIDTH / 2,
        backgroundColor: color ?? (faint ? faintColor : theme.outline),
      }}
    />
  );
}

const REPLY_AVATAR = 40;
const NESTED_AVATAR = 32;
const ELBOW = Spacing.oneHalf;
const ELBOW_RADIUS = 10;

export const replyAvatar = (depth: number, avatar: number) => (depth === 0 ? Math.min(REPLY_AVATAR, avatar) : NESTED_AVATAR);

export function replyInset(depth: number, padding: number, avatar: number): number {
  return depth === 0 ? padding : railCenter(depth - 1, padding, avatar) + ELBOW;
}

// Lines up level 0 with the centre of a thread post's avatar instead of a reply's.
export const underPostPadding = (padding: number, avatar: number) => padding + (avatar - replyAvatar(0, avatar)) / 2;

export const railCenter = (level: number, padding: number, avatar: number) =>
  replyInset(level, padding, avatar) + replyAvatar(level, avatar) / 2;

type RailsProps = {
  depth: number;
  rails: boolean[];
  anchor: number;
  padding: number;
  avatar: number;
};

export function ThreadRails({ depth, rails, anchor, padding, avatar }: RailsProps) {
  const levelColor = useLevelColor();
  if (depth === 0) return null;
  const parent = railCenter(depth - 1, padding, avatar);
  return (
    <>
      {rails.map((continues, level) =>
        continues ? <ThreadLine key={level} center={railCenter(level, padding, avatar)} bottom={0} color={levelColor(level)} /> : null,
      )}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: parent - WIDTH / 2,
          top: 0,
          height: anchor + WIDTH / 2,
          width: ELBOW - Spacing.one + WIDTH / 2,
          borderLeftWidth: WIDTH,
          borderBottomWidth: WIDTH,
          borderBottomLeftRadius: ELBOW_RADIUS,
          borderColor: levelColor(depth - 1),
        }}
      />
    </>
  );
}
