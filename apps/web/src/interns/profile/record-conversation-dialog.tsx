import {
  type BatchDetail,
  ConversationContentRequest,
  type ConversationView,
  type FeedbackView,
  type InternDetail,
} from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  conversationsQuery,
  editConversation,
  recordConversation,
} from '../../api/conversations.ts';
import { isApiError } from '../../api/errors.ts';
import { feedbackQuery } from '../../api/feedback.ts';
import { pendingQuery } from '../../api/pending.ts';
import { formatDay, utcToday } from '../../batches/batch-dates.ts';
import { Button } from '../../ui/button.tsx';
import { Callout } from '../../ui/callout.tsx';
import { Dialog } from '../../ui/dialog.tsx';
import { Field, messageId } from '../../ui/field.tsx';
import { MarkdownEditor } from '../../ui/markdown-editor.tsx';
import { TextInput } from '../../ui/text-input.tsx';
import { ColourChip } from '../colour-chip.tsx';
import { firstName } from '../profile.ts';
import { excerpt } from './feedback-entry.ts';

/** Recording a conversation for one awaiting entry (10.3 decision 1), or changing one (decision 3). */
export type ConversationTarget =
  | Readonly<{ kind: 'record'; feedbackId: string }>
  | Readonly<{ kind: 'edit'; conversation: ConversationView }>;

const choiceId = 'conversation-feedback';
const heldOnId = 'conversation-held-on';
const byId = 'conversation-by';
const notesId = 'conversation-notes';

type Choice = Readonly<{
  id: string;
  author: string;
  submittedAt: string;
  colorCode: FeedbackView['colorCode'];
  body: string;
}>;

/** v2 A8's radio card: "<author> · submitted 22 Oct 2026", the colour, a one-line excerpt. */
const FeedbackChoice = ({
  choice,
  selected,
  onSelect,
}: Readonly<{ choice: Choice; selected: boolean; onSelect: (() => void) | undefined }>) => {
  const content = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span id={`${choiceId}-${choice.id}-label`} className="text-[13px]">
          <span className="font-semibold">{choice.author}</span>{' '}
          <span className="text-muted-foreground">· submitted {formatDay(choice.submittedAt)}</span>
        </span>
        <ColourChip code={choice.colorCode} />
      </div>
      <span className="truncate text-[13px] leading-[19px] text-muted-foreground">
        {excerpt(choice.body)}
      </span>
    </div>
  );
  const card = `flex gap-3 rounded-md border px-3.5 py-3 ${selected ? 'border-primary bg-ee-blue-50' : 'border-border bg-background'}`;
  if (!onSelect) return <div className={card}>{content}</div>;
  return (
    <label className={`${card} cursor-pointer`}>
      <input
        type="radio"
        name="feedbackId"
        value={choice.id}
        checked={selected}
        onChange={onSelect}
        aria-labelledby={`${choiceId}-${choice.id}-label`}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="mt-px inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--slate-300) bg-input transition-[border-color] duration-120 peer-checked:border-primary peer-focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] peer-checked:[&>span]:visible"
      >
        <span className="invisible size-[9px] rounded-full bg-primary" />
      </span>
      {content}
    </label>
  );
};

type FormProps = Readonly<{
  intern: InternDetail;
  batch: BatchDetail;
  /** The intern's feedback, as the timeline has it. */
  entries: readonly FeedbackView[];
  target: ConversationTarget;
  onClose: () => void;
  onSaved: (() => Promise<unknown>) | undefined;
}>;

/** Submitted feedback not yet delivered, newest first (the API's order). */
export const awaitingDelivery = (entries: readonly FeedbackView[]): FeedbackView[] =>
  entries.filter((entry) => entry.state === 'submitted');

const choiceOf = (entry: FeedbackView): Choice => ({
  id: entry.id,
  author: entry.author.name,
  submittedAt: entry.submittedAt ?? entry.updatedAt,
  colorCode: entry.colorCode,
  body: entry.body,
});

const ConversationForm = ({ intern, batch, entries, target, onClose, onSaved }: FormProps) => {
  const awaiting = awaitingDelivery(entries);
  const queryClient = useQueryClient();
  const fields = useRef<HTMLDivElement>(null);
  const editing = target.kind === 'edit';
  const [chosen, setChosen] = useState<string | null>(
    target.kind === 'record' ? target.feedbackId : null,
  );
  const [unchosen, setUnchosen] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(ConversationContentRequest),
    defaultValues: editing
      ? { heldOn: target.conversation.heldOn, notes: target.conversation.notes }
      : // The API's "today" is the UTC date (9.3 decision 3), so the default is always accepted.
        { heldOn: utcToday(), notes: '' },
  });
  const refresh = (queryKey: readonly unknown[]) =>
    queryClient.invalidateQueries({ queryKey, exact: true });
  const mutation = useMutation({
    mutationFn: (content: ConversationContentRequest) =>
      target.kind === 'edit'
        ? editConversation(intern.batchId, intern.id, target.conversation.id, content)
        : recordConversation(intern.batchId, intern.id, { ...content, feedbackId: chosen ?? '' }),
    onSuccess: async () => {
      // Exact keys: delivering changes the feedback list's badges as well as the conversations.
      await Promise.all([
        refresh(conversationsQuery(intern.batchId, intern.id).queryKey),
        refresh(feedbackQuery(intern.batchId, intern.id).queryKey),
        // My pending's To deliver and badge (11.2).
        refresh(pendingQuery.queryKey),
        onSaved?.(),
      ]);
      onClose();
    },
    onError: () => {
      if (fields.current) fields.current.scrollTop = 0;
    },
  });

  const onSubmit = handleSubmit(async (content) => {
    if (!editing && chosen === null) {
      setUnchosen(true);
      return;
    }
    // Errors are shown from `mutation.error`, so the rejection is dropped here.
    await mutation.mutateAsync(content).catch(() => undefined);
  });

  const delivered =
    target.kind === 'edit'
      ? entries.find((entry) => entry.id === target.conversation.feedback.id)
      : undefined;
  let choices: Choice[] = awaiting.map(choiceOf);
  if (target.kind === 'edit') {
    const { feedback } = target.conversation;
    choices = [
      delivered
        ? choiceOf(delivered)
        : {
            id: feedback.id,
            author: feedback.author.name,
            submittedAt: feedback.submittedAt,
            colorCode: null,
            body: '',
          },
    ];
  }

  if (!editing && awaiting.length === 0) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col items-center gap-1.5 border border-border px-5 py-8 text-center">
          <span className="text-[15px] font-semibold">No feedback is waiting to be delivered</span>
          <span className="text-[13px] text-muted-foreground">
            {`Feedback for ${firstName(intern.name)} appears here once a mentor submits it.`}
          </span>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled>Save conversation</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-[18px]"
    >
      <div
        ref={fields}
        className="-mx-[22px] flex max-h-[calc(100vh-240px)] flex-col gap-[18px] overflow-y-auto px-[22px]"
      >
        {mutation.error ? (
          <Callout type="issue" title="We couldn't save the conversation">
            {isApiError(mutation.error) && mutation.error.detail
              ? mutation.error.detail
              : 'Try again in a moment.'}
          </Callout>
        ) : null}
        <fieldset aria-describedby={messageId(choiceId)} className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 inline-flex items-center gap-1 p-0 text-sm leading-[1.2] font-medium">
            Feedback delivered
            <span aria-hidden className="text-destructive">
              *
            </span>
          </legend>
          <div className="flex flex-col gap-2">
            {choices.map((choice) => (
              <FeedbackChoice
                key={choice.id}
                choice={choice}
                selected={editing || chosen === choice.id}
                onSelect={
                  editing
                    ? undefined
                    : () => {
                        setChosen(choice.id);
                        setUnchosen(false);
                      }
                }
              />
            ))}
          </div>
          <span
            id={messageId(choiceId)}
            className={`text-xs ${unchosen ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {unchosen
              ? 'Choose the feedback you went through in the 1:1.'
              : editing
                ? "The feedback a conversation delivered can't change."
                : 'Choose the feedback you went through in the 1:1.'}
          </span>
        </fieldset>
        <div className="grid grid-cols-2 items-start gap-3">
          <Field id={heldOnId} label="Date delivered" required error={errors.heldOn?.message}>
            <TextInput
              id={heldOnId}
              type="date"
              aria-required
              invalid={errors.heldOn !== undefined}
              aria-describedby={errors.heldOn ? messageId(heldOnId) : undefined}
              {...register('heldOn')}
            />
          </Field>
          <Field id={byId} label="Delivered by">
            <TextInput
              id={byId}
              disabled
              value={
                target.kind === 'edit'
                  ? target.conversation.recordedBy.name
                  : batch.programManager.name
              }
            />
          </Field>
        </div>
        <Field
          id={notesId}
          label="Conversation notes"
          required
          help="Markdown supported. Mentors in the batch can read this."
          error={errors.notes?.message}
        >
          <Controller
            control={control}
            name="notes"
            render={({ field }) => (
              <MarkdownEditor
                ref={field.ref}
                id={notesId}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="How did it go, and what came up?"
                invalid={errors.notes !== undefined}
                aria-describedby={messageId(notesId)}
                aria-required
              />
            )}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save conversation'}
        </Button>
      </div>
    </form>
  );
};

type RecordConversationDialogProps = Readonly<{
  intern: InternDetail;
  batch: BatchDetail;
  /** The intern's feedback: the awaiting entries are offered, and an edit shows its own. */
  entries: readonly FeedbackView[];
  /** `null` while closed. */
  target: ConversationTarget | null;
  onClose: () => void;
  /** Also refreshed after saving, such as the batch overview (11.1). */
  onSaved?: () => Promise<unknown>;
}>;

const count = (n: number) => `${n} submitted feedback awaiting delivery`;

/**
 * A8 · Record conversation (10.3): the feedback delivered, the date, who delivered it and the
 * notes. The same dialog edits a conversation's notes and date (decision 3), the feedback fixed.
 */
export const RecordConversationDialog = ({
  intern,
  batch,
  entries,
  target,
  onClose,
  onSaved,
}: RecordConversationDialogProps) => {
  const waiting = awaitingDelivery(entries).length;
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target?.kind === 'edit' ? 'Edit conversation' : 'Record conversation'}
      description={
        target?.kind === 'edit'
          ? `${intern.name} · ${batch.name}`
          : `${intern.name} · ${waiting === 0 ? 'nothing awaiting delivery.' : `${count(waiting)}.`}`
      }
      widthClass="max-w-[560px]"
    >
      {target ? (
        <ConversationForm
          intern={intern}
          batch={batch}
          entries={entries}
          target={target}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
};
