import { t } from '@/i18n';

import type { BinaryUpload } from './bsky/video';

const blob = async (uri: string) => (await fetch(uri)).blob();

export const formFile = async (uri: string) => {
  const data = await blob(uri);
  return new File([data], 'upload', { type: data.type });
};
export const fileBytes = async (uri: string) => new Uint8Array(await (await blob(uri)).arrayBuffer());
export const fileSize = async (uri: string) => (await blob(uri)).size;

// fetch can't report upload progress; XHR can.
export const uploadBinary: BinaryUpload = async ({ url, headers, uri, mimeType, onProgress, signal }) => {
  const body = await blob(uri);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = ({ loaded, total }) => onProgress(total > 0 ? loaded / total : 0);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error(t('compose.video.uploadFailed', { status: 0 })));
    xhr.onabort = () => reject(signal.reason);
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
};
