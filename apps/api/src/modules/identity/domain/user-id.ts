import { z } from 'zod';

export const UserId = z.uuid().brand<'UserId'>();
export type UserId = z.infer<typeof UserId>;
