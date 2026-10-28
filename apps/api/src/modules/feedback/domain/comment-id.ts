import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

export const CommentId = z.uuid().brand<'CommentId'>();
export type CommentId = z.infer<typeof CommentId>;

export const newCommentId = (): CommentId => CommentId.parse(newId());
