import type { RichContent } from './content';
import type { Reaction } from './reaction';

export type Announcement = {
  id: string;
  content: RichContent;
  publishedAt: string;
  read: boolean;
  reactions: Reaction[];
};
