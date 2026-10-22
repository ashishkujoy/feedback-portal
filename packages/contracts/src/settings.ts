import { z } from 'zod';

/** `GET /settings`: the program and organisation names the deployment is configured with. */
export const SettingsResponse = z.object({
  programName: z.string().min(1),
  orgName: z.string().min(1),
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;
