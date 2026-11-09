import type { Agent, BlobRef } from '@atproto/api';

import { t } from '@/i18n';

export const VIDEO_SERVICE = 'https://video.bsky.app';
export const VIDEO_SERVICE_DID = 'did:web:video.bsky.app';
export const MAX_VIDEO_BYTES = 300_000_000;
export const MAX_VIDEO_MS = 10 * 60 * 1000;

const SERVICE_AUTH_TTL_S = 30 * 60;
const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 600;

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/mpeg': 'mpeg',
  'video/quicktime': 'mov',
};

export type VideoDraft = {
  uri: string;
  description: string;
  width: number;
  height: number;
  size: number;
  durationMs: number;
  mimeType: string;
};

export type VideoProgress = { stage: 'checking' | 'uploading' | 'processing'; progress: number };

export type PostVideo = { video: BlobRef; alt: string; aspectRatio: { width: number; height: number } };

export type BinaryUpload = (request: {
  url: string;
  headers: Record<string, string>;
  uri: string;
  mimeType: string;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}) => Promise<{ status: number; body: string }>;

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

type Options = {
  agent: Agent;
  pds: string;
  video: VideoDraft;
  upload: BinaryUpload;
  signal: AbortSignal;
  onProgress?: (progress: VideoProgress) => void;
  fetch?: Fetch;
  pollIntervalMs?: number;
  pollAttempts?: number;
};

type JobStatus = {
  jobId?: string;
  state?: string;
  progress?: number;
  blob?: unknown;
  error?: string;
  message?: string;
};

const xrpc = (method: string, params?: Record<string, string>) => {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  return `${VIDEO_SERVICE}/xrpc/${method}${query}`;
};

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

async function serviceToken(agent: Agent, aud: string, lxm: string, ttl?: number) {
  const exp = ttl ? Math.floor(Date.now() / 1000) + ttl : undefined;
  const { data } = await agent.com.atproto.server.getServiceAuth({ aud, lxm, exp });
  return data.token;
}

export function checkVideoFile(video: Pick<VideoDraft, 'size' | 'durationMs'>) {
  if (video.size > MAX_VIDEO_BYTES) {
    throw new Error(t('compose.video.tooLarge', { max: Math.round(MAX_VIDEO_BYTES / 1_000_000) }));
  }
  if (video.durationMs > MAX_VIDEO_MS) {
    throw new Error(t('compose.video.tooLong', { max: Math.round(MAX_VIDEO_MS / 60_000) }));
  }
}

export async function checkVideoLimits(
  agent: Agent,
  video: Pick<VideoDraft, 'size' | 'durationMs'>,
  options: { fetch?: Fetch; signal?: AbortSignal } = {},
) {
  checkVideoFile(video);
  const doFetch = options.fetch ?? (fetch as Fetch);
  const token = await serviceToken(agent, VIDEO_SERVICE_DID, 'app.bsky.video.getUploadLimits');
  const res = await doFetch(xrpc('app.bsky.video.getUploadLimits'), {
    headers: { Authorization: `Bearer ${token}` },
    signal: options.signal,
  });
  if (!res.ok) throw new Error(t('compose.video.limitsFailed', { status: res.status }));
  const limits = (await res.json()) as {
    canUpload?: boolean;
    remainingDailyVideos?: number;
    remainingDailyBytes?: number;
    message?: string;
  };
  if (!limits.canUpload) throw new Error(limits.message || t('compose.video.limitReached'));
  if (limits.remainingDailyVideos !== undefined && limits.remainingDailyVideos < 1) {
    throw new Error(t('compose.video.limitReached'));
  }
  if (limits.remainingDailyBytes !== undefined && limits.remainingDailyBytes < video.size) {
    throw new Error(t('compose.video.limitBytes'));
  }
}

function parseJob(body: string): JobStatus {
  try {
    const parsed = JSON.parse(body) as JobStatus & { jobStatus?: JobStatus };
    return parsed.jobStatus ?? parsed;
  } catch {
    return {};
  }
}

export async function uploadBskyVideo({
  agent,
  pds,
  video,
  upload,
  signal,
  onProgress = () => {},
  fetch: doFetch = fetch as Fetch,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollAttempts = POLL_ATTEMPTS,
}: Options): Promise<PostVideo> {
  onProgress({ stage: 'checking', progress: 0 });
  await checkVideoLimits(agent, video, { fetch: doFetch, signal });

  const token = await serviceToken(agent, `did:web:${new URL(pds).host}`, 'com.atproto.repo.uploadBlob', SERVICE_AUTH_TTL_S);
  const name = `${Math.random().toString(36).slice(2, 14)}.${EXTENSIONS[video.mimeType] ?? 'mp4'}`;
  onProgress({ stage: 'uploading', progress: 0 });
  const sent = await upload({
    url: xrpc('app.bsky.video.uploadVideo', { did: agent.assertDid, name }),
    headers: { Authorization: `Bearer ${token}` },
    uri: video.uri,
    mimeType: video.mimeType,
    onProgress: (progress) => onProgress({ stage: 'uploading', progress }),
    signal,
  });

  let job = parseJob(sent.body);
  const alreadyExists = job.error === 'already_exists' && !!job.jobId;
  if ((sent.status < 200 || sent.status >= 300) && !alreadyExists) {
    throw new Error(job.message || t('compose.video.uploadFailed', { status: sent.status }));
  }
  const { jobId } = job;
  if (!jobId) throw new Error(t('compose.video.uploadFailed', { status: sent.status }));

  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    if (job.state === 'JOB_STATE_FAILED') {
      throw new Error(job.message || job.error || t('compose.video.processingFailed'));
    }
    if (job.state === 'JOB_STATE_COMPLETED' || job.blob) {
      if (!job.blob) throw new Error(t('compose.video.processingFailed'));
      return {
        video: job.blob as BlobRef,
        alt: video.description,
        aspectRatio: { width: video.width, height: video.height },
      };
    }
    onProgress({ stage: 'processing', progress: Math.min(1, Math.max(0, (job.progress ?? 0) / 100)) });
    await wait(pollIntervalMs, signal);
    const res = await doFetch(xrpc('app.bsky.video.getJobStatus', { jobId }), { signal });
    if (!res.ok) throw new Error(t('compose.video.processingFailed'));
    job = parseJob(await res.text());
  }
  throw new Error(t('compose.video.processingTimeout'));
}
