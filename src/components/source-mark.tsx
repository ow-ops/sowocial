import { NetworkGlyph, type useAccountSource } from '@/components/source-badge';
import { useAccountColor } from '@/hooks/use-theme';

const SOURCE_MARK_SIZE = 12;

// Tinted with the account's own theme color when it has one, so mixed posts show whose they are.
export function SourceMark({ source }: { source: NonNullable<ReturnType<typeof useAccountSource>> }) {
  return <NetworkGlyph protocol={source.protocol} size={SOURCE_MARK_SIZE} color={useAccountColor(source.key)} />;
}
