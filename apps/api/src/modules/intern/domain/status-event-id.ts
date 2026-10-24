import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

/** One entry in an intern's status history. */
export const StatusEventId = z.uuid().brand<'StatusEventId'>();
export type StatusEventId = z.infer<typeof StatusEventId>;

export const newStatusEventId = (): StatusEventId => StatusEventId.parse(newId());
