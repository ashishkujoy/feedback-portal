import { photoFormats } from '@feedback-portal/contracts';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { PhotosConfig } from '../../../shared/config/config.ts';
import { newId } from '../../../shared/ids.ts';
import type { PhotoStorage } from '../application/photo-storage.ts';

type Params = Readonly<Record<string, string | number>>;

/**
 * Cloudinary's request signature: the parameters sorted by name as `key=value` joined with `&`,
 * then the API secret appended, hashed with SHA-1 (hex).
 */
export const signParams = (params: Params, apiSecret: string): string =>
  createHash('sha1')
    .update(
      Object.keys(params)
        .toSorted()
        .map((key) => `${key}=${params[key]}`)
        .join('&') + apiSecret,
    )
    .digest('hex');

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const seconds = (now: Date): number => Math.floor(now.getTime() / 1000);

/** Delivery: a 128px face-centred square, in the best format and quality for the browser. */
const delivery = 'c_fill,g_face,w_128,h_128,f_auto,q_auto';

export const createCloudinaryPhotoStorage = (
  config: PhotosConfig,
  fetchFn: typeof fetch = fetch,
): PhotoStorage => {
  const api = `${config.apiBaseUrl}/v1_1/${config.cloudName}/image`;
  const prefixFor = (internId: string) => `${config.folder}/${internId}/`;
  const allowedFormats = photoFormats.join(',');

  return {
    ticketFor: (internId, now) => {
      const params = {
        allowed_formats: allowedFormats,
        public_id: `${prefixFor(internId)}${newId()}`,
        timestamp: seconds(now),
      };
      return {
        uploadUrl: `${api}/upload`,
        apiKey: config.apiKey,
        timestamp: params.timestamp,
        signature: signParams(params, config.apiSecret),
        publicId: params.public_id,
        allowedFormats,
      };
    },

    // Cloudinary signs its upload answers over `public_id` and `version` with the same secret.
    isGenuineUpload: (internId, { publicId, version, signature }) =>
      publicId.startsWith(prefixFor(internId)) &&
      sameText(signParams({ public_id: publicId, version }, config.apiSecret), signature),

    urlFor: (publicId) =>
      `${config.deliveryBaseUrl}/${config.cloudName}/image/upload/${delivery}/${publicId}`,

    remove: async (publicId, now) => {
      const params = { invalidate: 'true', public_id: publicId, timestamp: seconds(now) };
      const body = new URLSearchParams({
        ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
        api_key: config.apiKey,
        signature: signParams(params, config.apiSecret),
      });
      const response = await fetchFn(`${api}/destroy`, { method: 'POST', body });
      if (!response.ok) throw new Error(`Cloudinary destroy failed with ${response.status}`);
    },
  };
};
