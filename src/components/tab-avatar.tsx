import { useRef, useState, type ReactNode } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Image } from 'react-native-svg';

const Size = 28;

// The tab bar draws an image as it is, so the avatar is drawn into a circle at icon size first.
export function useTabAvatar(uri: string | undefined): [{ uri: string; width: number; height: number; scale: number } | undefined, ReactNode] {
  const svg = useRef<Svg>(null);
  const [drawn, setDrawn] = useState<{ from: string; uri: string }>();
  if (!uri) return [undefined, null];
  if (drawn?.from === uri) return [{ uri: drawn.uri, width: Size, height: Size, scale: PixelRatio.get() }, null];

  const capture = () =>
    svg.current?.toDataURL((base64?: string) => {
      if (base64) setDrawn({ from: uri, uri: `data:image/png;base64,${base64.replace(/\s/g, '')}` });
    }, { width: Size, height: Size });

  return [
    undefined,
    <Svg key={uri} ref={svg} width={Size} height={Size} style={styles.offscreen} pointerEvents="none">
      <Defs>
        <ClipPath id="tab-avatar">
          <Circle cx={Size / 2} cy={Size / 2} r={Size / 2} />
        </ClipPath>
      </Defs>
      <Image
        href={uri}
        width={Size}
        height={Size}
        preserveAspectRatio="xMidYMid slice"
        clipPath="url(#tab-avatar)"
        onLoad={capture}
      />
    </Svg>,
  ];
}

const styles = StyleSheet.create({
  // Off screen rather than transparent: the snapshot is drawn with the view's own opacity.
  offscreen: { position: 'absolute', left: -1000 },
});
