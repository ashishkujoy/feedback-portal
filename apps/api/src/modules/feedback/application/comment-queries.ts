type Person = Readonly<{ id: string; name: string; avatarUrl: string | null }>;

/** A comment as its readers see it; a deleted one has `body: ''`. */
export type CommentEntryView = Readonly<{
  id: string;
  parent: Readonly<{ kind: 'feedback' | 'conversation'; id: string }>;
  author: Person;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}>;

/** Read models for comments. */
export type CommentQueries = Readonly<{
  /** Every comment on the intern's feedback and conversations, oldest first. */
  listForIntern: (internId: string) => Promise<readonly CommentEntryView[]>;
  view: (id: string) => Promise<CommentEntryView | null>;
}>;
