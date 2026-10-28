import { CommentRequest } from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { type KeyboardEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { isApiError } from '../../api/errors.ts';
import { Button } from '../../ui/button.tsx';
import { messageId } from '../../ui/field.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { TextInput } from '../../ui/text-input.tsx';

type CommentFormProps = Readonly<{
  /** The Input's id, for its message. */
  id: string;
  /** The Input's accessible name. */
  label: string;
  initial: string;
  /**
   * `compose`: v2's "Add a comment" row. `edit`: the text in place in a Textarea, so a comment's
   * line breaks survive (10.5 decision 4), with Save and Cancel below.
   */
  mode: 'compose' | 'edit';
  pending: boolean;
  /** The last refusal, shown under the Input with the API's sentence. */
  error: unknown;
  onSave: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}>;

const refusal = (error: unknown) =>
  isApiError(error) && error.detail ? error.detail : 'Try again in a moment.';

/**
 * A comment's text (10.5): plain text, "Write a comment." when blank, checked before sending. A
 * refusal keeps the text. Focus starts in the Input.
 */
export const CommentForm = ({
  id,
  label,
  initial,
  mode,
  pending,
  error,
  onSave,
  onCancel,
}: CommentFormProps) => {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm({ resolver: zodResolver(CommentRequest), defaultValues: { body: initial } });
  useEffect(() => setFocus('body'), [setFocus]);
  const message = errors.body?.message ?? (error ? refusal(error) : undefined);
  const submit = handleSubmit(async ({ body }) => {
    // Refusals are shown from `error`, so the rejection is dropped here.
    await onSave(body).catch(() => undefined);
  });
  const control = {
    id,
    'aria-label': label,
    invalid: message !== undefined,
    'aria-describedby': message ? messageId(id) : undefined,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onCancel) onCancel();
    },
    ...register('body'),
  };
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-1.5">
      {mode === 'compose' ? (
        <div className="flex gap-2">
          <TextInput placeholder="Add a comment" className="flex-1" {...control} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? 'Posting…' : 'Comment'}
          </Button>
        </div>
      ) : (
        <Textarea rows={Math.max(2, initial.split('\n').length)} {...control} />
      )}
      {message ? (
        <span id={messageId(id)} className="text-xs text-destructive">
          {message}
        </span>
      ) : null}
      {mode === 'edit' ? (
        <div className="-ml-2.5 flex gap-1">
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost-muted" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </form>
  );
};
