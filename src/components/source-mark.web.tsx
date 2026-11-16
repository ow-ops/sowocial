import { NetworkGlyph, type useAccountSource } from '@/components/source-badge';
import { useAccountColor } from '@/hooks/use-theme';

const SOURCE_MARK_SIZE = 12;

export function SourceMark({ source }: { source: NonNullable<ReturnType<typeof useAccountSource>> }) {
  const color = useAccountColor(source.key);
  return (
    <span title={source.label} aria-hidden style={{ display: 'inline-flex' }}>
      <NetworkGlyph protocol={source.protocol} size={SOURCE_MARK_SIZE} color={color} />
    </span>
  );
}
