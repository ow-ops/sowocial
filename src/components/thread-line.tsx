import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const WIDTH = 2;

// Gap of Spacing.one between the line and the avatar it leads into.
export const LINE_INTO_AVATAR = Spacing.three - Spacing.one;

type Props = {
  center: number;
  top?: number;
  height?: number;
  bottom?: number;
  faint?: boolean;
};

export function ThreadLine({ center, top = 0, height, bottom, faint = false }: Props) {
  const theme = useTheme();
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
        backgroundColor: theme.outline,
        opacity: faint ? 0.4 : 1,
      }}
    />
  );
}
