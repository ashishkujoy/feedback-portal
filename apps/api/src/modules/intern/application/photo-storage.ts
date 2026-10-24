import type { InternId } from '../domain/intern-id.ts';

/** One signed upload, straight from the browser to the storage. */
export type PhotoUploadTicketView = Readonly<{
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  allowedFormats: string;
}>;

/** What the storage answered the browser, which the browser hands back to be saved. */
export type UploadedPhoto = Readonly<{ publicId: string; version: number; signature: string }>;

/**
 * Where intern photos live (Cloudinary, TECH_STACK). The database keeps only the `publicId`;
 * the storage signs uploads, proves an answer is its own, builds delivery URLs and deletes.
 */
export type PhotoStorage = Readonly<{
  /** A new, unguessable `publicId` under this intern's prefix, signed for one upload. */
  ticketFor: (internId: InternId, now: Date) => PhotoUploadTicketView;
  /** True only for a genuine answer about a photo issued for this intern. */
  isGenuineUpload: (internId: InternId, upload: UploadedPhoto) => boolean;
  urlFor: (publicId: string) => string;
  /** Deletes a photo that's no longer used. */
  remove: (publicId: string, now: Date) => Promise<void>;
}>;
