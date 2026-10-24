import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

export const InternId = z.uuid().brand<'InternId'>();
export type InternId = z.infer<typeof InternId>;

export const newInternId = (): InternId => InternId.parse(newId());
