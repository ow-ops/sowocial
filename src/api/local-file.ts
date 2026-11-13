import { File, UploadType } from 'expo-file-system';

import type { BinaryUpload } from './bsky/video';

// expo-file-system's File is a stub on web; local-file.web.ts reads picker blob/data URIs instead.
export const formFile = async (uri: string) => new File(uri);
export const fileBytes = (uri: string) => new File(uri).bytes();
export const fileSize = async (uri: string) => new File(uri).size;

export const uploadBinary: BinaryUpload = async ({ url, headers, uri, mimeType, onProgress, signal }) => {
  const result = await new File(uri)
    .createUploadTask(url, {
      httpMethod: 'POST',
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      mimeType,
      signal,
      onProgress: ({ bytesSent, totalBytes }) => onProgress(totalBytes > 0 ? bytesSent / totalBytes : 0),
    })
    .uploadAsync();
  return { status: result.status, body: result.body };
};
