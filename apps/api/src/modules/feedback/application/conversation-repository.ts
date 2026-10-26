import type { Conversation } from '../domain/conversation.ts';
import type { ConversationId } from '../domain/conversation-id.ts';

/** Persistence for the `Conversation` aggregate. Conversations are never deleted (10.1). */
export type ConversationRepository = Readonly<{
  findById: (id: ConversationId) => Promise<Conversation | null>;
  /** Creates or updates it. A new one is saved before the feedback it delivers points at it. */
  save: (conversation: Conversation) => Promise<void>;
}>;
