import { Image } from 'expo-image';
import { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const AVATAR_SIZE = 50;

const BLUR_RADIUS = 40;

export function Avatar({ uri, size = AVATAR_SIZE, blurred = false }: { uri: string; size?: number; blurred?: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <Image
      source={uri}
      recyclingKey={uri}
      cachePolicy="memory-disk"
      blurRadius={blurred ? BLUR_RADIUS : 0}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.surface }}
      transition={reduceMotion ? 0 : 150}
    />
  );
}
