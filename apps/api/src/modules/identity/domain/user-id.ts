import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

export const UserId = z.uuid().brand<'UserId'>();
export type UserId = z.infer<typeof UserId>;

export const newUserId = (): UserId => UserId.parse(newId());
