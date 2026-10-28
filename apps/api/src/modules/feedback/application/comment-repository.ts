import type { InternId } from '../../intern/domain/intern-id.ts';
import type { Comment } from '../domain/comment.ts';
import type { CommentId } from '../domain/comment-id.ts';

/** A comment with the intern its parent belongs to, so the use case can check the path. */
export type LockedComment = Readonly<{ comment: Comment; internId: InternId }>;

/** Persistence for comments. They're never deleted: deleting one clears its body (10.1). */
export type CommentRepository = Readonly<{
  /** Locks the comment, so an edit and a delete of it go one after the other. */
  findByIdForUpdate: (id: CommentId) => Promise<LockedComment | null>;
  /** Creates or updates it. */
  save: (comment: Comment) => Promise<void>;
}>;
