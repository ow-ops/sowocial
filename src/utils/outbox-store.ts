import { dropAccount, type OutboxStorage } from '@/api/outbox';
import { copyFile, removeFile } from '@/utils/draft-files';
import { readItem, writeItem } from '@/utils/kv';
import { OUTBOX_KEY } from '@/utils/kv-keys';

export const outboxStorage: OutboxStorage = {
  store: { read: () => readItem(OUTBOX_KEY), write: (value) => writeItem(OUTBOX_KEY, value) },
  files: {
    // A file that cannot be copied is posted from where it is; it just will not survive a restart.
    copy: (uri) => {
      try {
        return copyFile(uri);
      } catch (error) {
        console.warn('Outbox copy failed', error);
        return uri;
      }
    },
    remove: removeFile,
  },
};

export const dropOutboxAccount = (account: string) => dropAccount(outboxStorage, account);
