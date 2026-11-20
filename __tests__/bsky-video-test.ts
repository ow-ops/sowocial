import type { Agent } from '@atproto/api';

import {
  checkVideoLimits,
  MAX_VIDEO_BYTES,
  uploadBskyVideo,
  type BinaryUpload,
} from '@/api/bsky/video';
import type { VideoDraft, VideoProgress } from '@/api/backend/draft';

const draft: VideoDraft = {
  uri: 'file:///clip.mp4',
  description: 'a cat',
  width: 1080,
  height: 1920,
  size: 5_000_000,
  durationMs: 12_000,
  mimeType: 'video/mp4',
};

const blob = { $type: 'blob', ref: { $link: 'bafyvideo' }, mimeType: 'video/mp4', size: 1234 };

function mockAgent() {
  const getServiceAuth = jest.fn(async ({ lxm }: { lxm: string }) => ({ data: { token: `token-${lxm}` } }));
  const agent = { assertDid: 'did:plc:me', com: { atproto: { server: { getServiceAuth } } } } as unknown as Agent;
  return { agent, getServiceAuth };
}

const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

function mockFetch(handlers: Record<string, () => Response>) {
  return jest.fn(async (url: string) => {
    const method = Object.keys(handlers).find((name) => url.includes(name));
    if (!method) throw new Error(`unexpected request ${url}`);
    return handlers[method]();
  });
}

const okLimits = () => json({ canUpload: true, remainingDailyVideos: 24, remainingDailyBytes: 100_000_000 });

const signal = () => new AbortController().signal;

describe('checkVideoLimits', () => {
  it('requests service auth for the video service and reads the limits', async () => {
    const { agent, getServiceAuth } = mockAgent();
    const fetch = mockFetch({ getUploadLimits: okLimits });
    await checkVideoLimits(agent, draft, { fetch });
    expect(getServiceAuth).toHaveBeenCalledWith({
      aud: 'did:web:video.bsky.app',
      lxm: 'app.bsky.video.getUploadLimits',
      exp: undefined,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://video.bsky.app/xrpc/app.bsky.video.getUploadLimits',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-app.bsky.video.getUploadLimits' } }),
    );
  });

  it('shows the server message when uploads are not allowed', async () => {
    const { agent } = mockAgent();
    const fetch = mockFetch({ getUploadLimits: () => json({ canUpload: false, message: 'Verify your email first' }) });
    await expect(checkVideoLimits(agent, draft, { fetch })).rejects.toThrow('Verify your email first');
  });

  it('rejects when the daily videos are used up', async () => {
    const { agent } = mockAgent();
    const fetch = mockFetch({ getUploadLimits: () => json({ canUpload: true, remainingDailyVideos: 0 }) });
    await expect(checkVideoLimits(agent, draft, { fetch })).rejects.toThrow(/daily video upload limit/);
  });

  it('rejects when the video exceeds the remaining daily bytes', async () => {
    const { agent } = mockAgent();
    const fetch = mockFetch({ getUploadLimits: () => json({ canUpload: true, remainingDailyBytes: 1000 }) });
    await expect(checkVideoLimits(agent, draft, { fetch })).rejects.toThrow(/remaining daily upload size/);
  });

  it('rejects oversized and overlong files before any request', async () => {
    const { agent, getServiceAuth } = mockAgent();
    await expect(checkVideoLimits(agent, { ...draft, size: MAX_VIDEO_BYTES + 1 })).rejects.toThrow(/larger than 300 MB/);
    await expect(checkVideoLimits(agent, { ...draft, durationMs: 11 * 60 * 1000 })).rejects.toThrow(/longer than 10 minutes/);
    expect(getServiceAuth).not.toHaveBeenCalled();
  });
});

describe('uploadBskyVideo', () => {
  const run = (overrides: Partial<Parameters<typeof uploadBskyVideo>[0]> = {}) => {
    const { agent, getServiceAuth } = mockAgent();
    const stages: VideoProgress[] = [];
    const upload: jest.MockedFunction<BinaryUpload> = jest.fn(async ({ onProgress }) => {
      onProgress(0.5);
      return { status: 200, body: JSON.stringify({ jobStatus: { jobId: 'job1', state: 'JOB_STATE_CREATED' } }) };
    });
    const promise = uploadBskyVideo({
      agent,
      pds: 'https://morel.us-east.host.bsky.network',
      video: draft,
      upload,
      signal: signal(),
      onProgress: (p) => stages.push(p),
      pollIntervalMs: 0,
      ...overrides,
    });
    return { promise, upload, stages, getServiceAuth };
  };

  it('checks limits, uploads, polls the job and returns the embed data', async () => {
    const statuses = [
      { jobStatus: { jobId: 'job1', state: 'JOB_STATE_ENCODING', progress: 40 } },
      { jobStatus: { jobId: 'job1', state: 'JOB_STATE_COMPLETED', blob } },
    ];
    const fetch = mockFetch({ getUploadLimits: okLimits, getJobStatus: () => json(statuses.shift()) });
    const { promise, upload, stages, getServiceAuth } = run({ fetch });

    await expect(promise).resolves.toEqual({
      video: blob,
      alt: 'a cat',
      aspectRatio: { width: 1080, height: 1920 },
    });

    expect(getServiceAuth).toHaveBeenNthCalledWith(1, expect.objectContaining({ aud: 'did:web:video.bsky.app' }));
    expect(getServiceAuth).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        aud: 'did:web:morel.us-east.host.bsky.network',
        lxm: 'com.atproto.repo.uploadBlob',
        exp: expect.any(Number),
      }),
    );
    const request = upload.mock.calls[0][0];
    expect(request.url).toMatch(/^https:\/\/video\.bsky\.app\/xrpc\/app\.bsky\.video\.uploadVideo\?did=did%3Aplc%3Ame&name=.+\.mp4$/);
    expect(request.headers).toEqual({ Authorization: 'Bearer token-com.atproto.repo.uploadBlob' });
    expect(request.mimeType).toBe('video/mp4');
    expect(fetch).toHaveBeenCalledWith(
      'https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=job1',
      expect.anything(),
    );
    expect(stages.map((s) => s.stage)).toEqual(['checking', 'uploading', 'uploading', 'processing', 'processing']);
    expect(stages.find((s) => s.stage === 'uploading' && s.progress === 0.5)).toBeDefined();
    expect(stages.filter((s) => s.stage === 'processing').map((s) => s.progress)).toEqual([0, 0.4]);
  });

  it('does not upload when the limits check fails', async () => {
    const fetch = mockFetch({ getUploadLimits: () => json({ canUpload: false }) });
    const { promise, upload } = run({ fetch });
    await expect(promise).rejects.toThrow(/daily video upload limit/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('fails with the service message when processing fails', async () => {
    const fetch = mockFetch({
      getUploadLimits: okLimits,
      getJobStatus: () => json({ jobStatus: { jobId: 'job1', state: 'JOB_STATE_FAILED', message: 'Unsupported codec' } }),
    });
    await expect(run({ fetch }).promise).rejects.toThrow('Unsupported codec');
  });

  it('fails when the upload is rejected', async () => {
    const fetch = mockFetch({ getUploadLimits: okLimits });
    const upload: BinaryUpload = async () => ({ status: 500, body: '' });
    await expect(run({ fetch, upload }).promise).rejects.toThrow(/upload failed \(500\)/);
  });

  it('continues with the existing job when the video was already uploaded', async () => {
    const fetch = mockFetch({
      getUploadLimits: okLimits,
      getJobStatus: () => json({ jobStatus: { jobId: 'job9', state: 'JOB_STATE_COMPLETED', blob } }),
    });
    const upload: BinaryUpload = async () => ({
      status: 409,
      body: JSON.stringify({ error: 'already_exists', jobId: 'job9', state: 'JOB_STATE_CREATED' }),
    });
    await expect(run({ fetch, upload }).promise).resolves.toMatchObject({ video: blob });
  });

  it('accepts an unwrapped job status in the upload response', async () => {
    const fetch = mockFetch({
      getUploadLimits: okLimits,
      getJobStatus: () => json({ jobStatus: { jobId: 'job2', state: 'JOB_STATE_COMPLETED', blob } }),
    });
    const upload: BinaryUpload = async () => ({
      status: 200,
      body: JSON.stringify({ jobId: 'job2', state: 'JOB_STATE_CREATED' }),
    });
    await expect(run({ fetch, upload }).promise).resolves.toMatchObject({ video: blob });
  });

  it('gives up when the job never completes', async () => {
    const fetch = mockFetch({
      getUploadLimits: okLimits,
      getJobStatus: () => json({ jobStatus: { jobId: 'job1', state: 'JOB_STATE_ENCODING' } }),
    });
    await expect(run({ fetch, pollAttempts: 3 }).promise).rejects.toThrow(/taking too long/);
  });

  it('stops polling when aborted', async () => {
    const controller = new AbortController();
    const fetch = mockFetch({
      getUploadLimits: okLimits,
      getJobStatus: () => json({ jobStatus: { jobId: 'job1', state: 'JOB_STATE_ENCODING' } }),
    });
    const { promise } = run({ fetch, signal: controller.signal, pollIntervalMs: 50 });
    setTimeout(() => controller.abort(new Error('cancelled')), 10);
    await expect(promise).rejects.toThrow('cancelled');
  });
});
