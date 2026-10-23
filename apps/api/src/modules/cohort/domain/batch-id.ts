import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

export const BatchId = z.uuid().brand<'BatchId'>();
export type BatchId = z.infer<typeof BatchId>;

export const newBatchId = (): BatchId => BatchId.parse(newId());
