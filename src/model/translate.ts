import { htmlContent } from './content';
import type { Post } from './post';

export type PostTranslation = {
  content: string;
  spoilerText?: string;
  poll?: { options: { title: string }[] } | null;
  mediaAttachments?: { id: string; description: string }[];
  detectedSourceLanguage?: string;
  provider: string;
};

const primary = (tag: string) => tag.toLowerCase().split(/[-_]/)[0];

export const needsTranslation = (postLanguage: string | undefined, deviceLanguage: string) =>
  !!postLanguage && primary(postLanguage) !== primary(deviceLanguage);

export function translatedPost(post: Post, translation: PostTranslation): Post {
  const options = translation.poll?.options;
  const descriptions = new Map(translation.mediaAttachments?.map((m) => [m.id, m.description]));
  return {
    ...post,
    content: htmlContent(translation.content, post.content.kind === 'html' ? post.content.emojis : []),
    contentWarning: translation.spoilerText || post.contentWarning,
    poll:
      post.poll && options
        ? { ...post.poll, options: post.poll.options.map((o, i) => ({ ...o, title: options[i]?.title ?? o.title })) }
        : post.poll,
    media: post.media.map((m) => ({ ...m, alt: descriptions.get(m.id) || m.alt })),
  };
}
