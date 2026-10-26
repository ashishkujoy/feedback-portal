type Person = Readonly<{ id: string; name: string; avatarUrl: string | null }>;

/** A conversation as its readers see it, with the feedback it delivered. */
export type ConversationEntryView = Readonly<{
  id: string;
  internId: string;
  recordedBy: Person;
  heldOn: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  feedback: Readonly<{ id: string; author: Person; submittedAt: Date }>;
}>;

/** Read models for conversations. */
export type ConversationQueries = Readonly<{
  /** The intern's conversations, newest held first. */
  listForIntern: (internId: string) => Promise<readonly ConversationEntryView[]>;
  view: (id: string) => Promise<ConversationEntryView | null>;
}>;
