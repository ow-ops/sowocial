import { NetworkGlyph, type useAccountSource } from '@/components/source-badge';

const SOURCE_MARK_SIZE = 12;

export function SourceMark({ source }: { source: NonNullable<ReturnType<typeof useAccountSource>> }) {
  return <NetworkGlyph protocol={source.protocol} size={SOURCE_MARK_SIZE} />;
}
