import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

export const ConversationId = z.uuid().brand<'ConversationId'>();
export type ConversationId = z.infer<typeof ConversationId>;

export const newConversationId = (): ConversationId => ConversationId.parse(newId());
