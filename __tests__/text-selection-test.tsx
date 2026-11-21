import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { StatusContent } from '@/components/status-content';
import type { RichContent } from '@/model/content';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/use-open-account', () => ({ useOpenAccount: () => jest.fn() }));
jest.mock('@/hooks/use-open-url', () => ({ useOpenUrl: () => jest.fn() }));

const contents: [string, RichContent][] = [
  ['plain html', { kind: 'html', html: '<p>first line</p><p>second line</p>', emojis: [] }],
  ['rich html', { kind: 'html', html: '<p>first <a href="https://example.com">link</a></p><p>second line</p>', emojis: [] }],
  [
    'custom emoji',
    { kind: 'html', html: '<p>first :blob:</p><p>:blob: second line</p>', emojis: [{ shortcode: 'blob', url: 'https://example.com/blob.png' }] },
  ],
];

// An Android selection cannot leave its Text, so both paragraphs must sit in the same one.
describe('selectable post text on Android', () => {
  beforeAll(() => {
    Platform.OS = 'android';
  });
  afterAll(() => {
    Platform.OS = 'ios';
  });

  it.each(contents)('keeps paragraphs in one text (%s)', async (_, content) => {
    const screen = await render(<StatusContent content={content} selectable />);
    expect(screen.getByText(/first[\s\S]*second line/)).toBeTruthy();
  });

  it.each(contents)('keeps paragraphs apart when not selectable (%s)', async (_, content) => {
    const screen = await render(<StatusContent content={content} />);
    expect(screen.queryByText(/first[\s\S]*second line/)).toBeNull();
    expect(screen.getByText(/second line$/)).toBeTruthy();
  });
});
