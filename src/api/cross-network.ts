import { accountKey } from '@/auth/session';
import type { Session } from '@/auth/types';
import type { Author } from '@/model/post';
import { chunked } from '@/utils/chunked';
import { crossNetworkIdentity, type Identity } from '@/utils/cross-network';

import { getBackend } from './backend';

const MAX_FOLLOWS = 1000;

const abortError = () => Object.assign(new Error('Scan aborted'), { name: 'AbortError' });

export type ScanProgress = { read: number; checked: number; identities: number; matches: Author[] };

// The account a declared handle names on the session's network, or null when that network has none.
export function findAccount(session: Session, handle: string): Promise<Author | null> {
  return getBackend(accountKey(session)).findByHandle(handle);
}

// Walks the accounts `from` follows, resolves those that declare an identity on `to`'s network, and returns the
// ones `to` does not follow yet. Only the follow listings are read, so bios and fields come from what they carry.
// Aborting stops at the next page or chunk, rejecting with an AbortError; requests already in flight finish.
export async function scanFollows(
  from: Session,
  to: Session,
  report: (progress: ScanProgress) => void,
  signal: AbortSignal,
): Promise<Author[]> {
  let read = 0;
  const identities = new Map<string, Identity>();
  reading: for await (const page of getBackend(accountKey(from)).follows(from.accountId, 'following')) {
    if (signal.aborted) throw abortError();
    for (const author of page) {
      if (read === MAX_FOLLOWS) break reading;
      read++;
      const identity = crossNetworkIdentity(author);
      if (identity?.protocol === to.protocol) identities.set(identity.handle.toLowerCase(), identity);
    }
  }

  const backend = getBackend(accountKey(to));
  let matches: Author[] = [];
  let checked = 0;
  if (signal.aborted) throw abortError();
  report({ read, checked, identities: identities.size, matches });
  for (const chunk of chunked(identities.values())) {
    if (signal.aborted) throw abortError();
    const found = await Promise.all(
      chunk.map(async ({ handle }) => {
        const account = await findAccount(to, handle).catch(() => null);
        const relationship = account && (await backend.relationship(account.id).catch(() => null));
        return account && !relationship?.following ? account : null;
      }),
    );
    if (signal.aborted) throw abortError();
    for (const account of found) if (account && !matches.some((m) => m.id === account.id)) matches = [...matches, account];
    checked += chunk.length;
    report({ read, checked, identities: identities.size, matches });
  }
  return matches;
}

// The account name a follow is made as, for telling the user which account a bulk follow acts on.
export const sessionName = (session: Session) => (session.protocol === 'bsky' ? session.handle : (session.acct ?? session.instance));

export type FollowOutcome = { followed: string[]; failed: Author[]; firstError?: Error };

// Splits settled follow requests into the ids that went through and the accounts left to retry.
export function settleFollows(targets: Author[], results: PromiseSettledResult<unknown>[]): FollowOutcome {
  const outcome: FollowOutcome = { followed: [], failed: [] };
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') outcome.followed.push(targets[i].id);
    else {
      outcome.failed.push(targets[i]);
      outcome.firstError ??= result.reason instanceof Error ? result.reason : undefined;
    }
  });
  return outcome;
}

export async function followAccounts(to: Session, targets: Author[]): Promise<FollowOutcome> {
  const backend = getBackend(accountKey(to));
  return settleFollows(targets, await Promise.allSettled(targets.map((target) => backend.setRelationship(target.id, 'follow'))));
}
