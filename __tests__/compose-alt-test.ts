import { missingAlt } from '@/api/compose-alt';
import type { VideoDraft } from '@/api/backend/draft';

const image = (uri: string, description = '') => ({ uri, description });
const video = (description: string) => ({ uri: 'v', description }) as VideoDraft;

describe('missingAlt', () => {
  it('returns nothing when every attachment is described', () => {
    expect(missingAlt([{ media: [image('a', 'cat')], video: video('clip') }])).toEqual([]);
  });

  it('ignores posts without attachments', () => {
    expect(missingAlt([{ media: [] }, { media: [], video: null }])).toEqual([]);
  });

  it('treats whitespace as empty', () => {
    expect(missingAlt([{ media: [image('a', '  \n')] }])).toEqual(['a']);
  });

  it('lists images and video across segments in order', () => {
    expect(
      missingAlt([
        { media: [image('a', 'ok'), image('b')] },
        { media: [image('c')] },
        { media: [], video: video('') },
      ]),
    ).toEqual(['b', 'c', 'v']);
  });
});
