import { z } from 'zod';

/** `GET /settings`: the program and organisation names, and which optional features are on. */
export const SettingsResponse = z.object({
  programName: z.string().min(1),
  orgName: z.string().min(1),
  /** Intern photos (7.7): on when Cloudinary is configured. */
  photos: z.boolean(),
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;
