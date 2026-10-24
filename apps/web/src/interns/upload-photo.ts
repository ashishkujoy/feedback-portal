import type { PhotoUploadTicket, SetPhotoRequest } from '@feedback-portal/contracts';
import { z } from 'zod';

/** The part of the storage's answer the API checks before saving the photo. */
const UploadAnswer = z.object({
  public_id: z.string(),
  version: z.int(),
  signature: z.string(),
  bytes: z.int(),
});

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelled';
  }
}

export type PhotoUpload = Readonly<{
  /** Cloudinary's answer, ready for `PUT …/photo`. */
  done: Promise<SetPhotoRequest>;
  cancel: () => void;
}>;

/**
 * Sends the file straight to the storage with the signed ticket. An XHR, because `fetch` can't
 * report upload progress; `onProgress` gets 0–100.
 */
export const uploadPhoto = (
  ticket: PhotoUploadTicket,
  file: File,
  onProgress: (percent: number) => void,
): PhotoUpload => {
  const request = new XMLHttpRequest();
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', ticket.apiKey);
  form.append('timestamp', String(ticket.timestamp));
  form.append('signature', ticket.signature);
  form.append('public_id', ticket.publicId);
  form.append('allowed_formats', ticket.allowedFormats);

  const done = new Promise<SetPhotoRequest>((resolve, reject) => {
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    });
    request.addEventListener('load', () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`The upload failed (${request.status})`));
        return;
      }
      const answer = UploadAnswer.safeParse(parseJson(request.responseText));
      if (!answer.success) {
        reject(new Error('The upload gave an unexpected answer'));
        return;
      }
      const { public_id: publicId, version, signature, bytes } = answer.data;
      resolve({ publicId, version, signature, bytes });
    });
    request.addEventListener('error', () => reject(new Error('The upload failed')));
    request.addEventListener('abort', () => reject(new UploadCancelled()));
  });

  request.open('POST', ticket.uploadUrl);
  request.send(form);
  return { done, cancel: () => request.abort() };
};
