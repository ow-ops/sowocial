import { fetch } from 'expo/fetch';
import type { mastodon } from 'masto';

import { t } from '@/i18n';

import type { MediaDraft } from '../backend/draft';
import { formFile } from '../local-file';

const POLL_INTERVAL_MS = 1000;
const POLL_ATTEMPTS = 30;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

export async function uploadMedia(
  masto: mastodon.rest.Client,
  auth: { instance: string; token: string },
  { uri, description, focus }: MediaDraft,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.append('file', await formFile(uri));
  if (description) form.append('description', description);
  if (focus) form.append('focus', `${focus.x.toFixed(2)},${focus.y.toFixed(2)}`);

  const res = await fetch(`${auth.instance}/api/v2/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(t('compose.upload.failed', { status: res.status }));
  const { id, url } = (await res.json()) as { id: string; url: string | null };

  let ready = !!url;
  for (let attempt = 0; !ready && attempt < POLL_ATTEMPTS; attempt++) {
    await wait(POLL_INTERVAL_MS, signal);
    ready = !!(await masto.v1.media.$select(id).fetch(undefined, { requestInit: { signal } })).url;
  }
  if (!ready) throw new Error(t('compose.upload.processing'));
  return id;
}
