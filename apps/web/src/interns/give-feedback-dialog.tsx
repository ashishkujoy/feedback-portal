import {
  type BatchDetail,
  FeedbackContentRequest,
  type FeedbackView,
  type InternDetail,
} from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { batchesQuery, batchQuery } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { createFeedback, editFeedback, feedbackQuery, updateDraft } from '../api/feedback.ts';
import { internQuery, internsQuery } from '../api/interns.ts';
import { pendingQuery } from '../api/pending.ts';
import { utcToday } from '../batches/batch-dates.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { Field, messageId } from '../ui/field.tsx';
import { MarkdownEditor } from '../ui/markdown-editor.tsx';
import { Select } from '../ui/select.tsx';
import { Switch } from '../ui/switch.tsx';
import { colourTones } from './colour-chip.tsx';
import {
  colourHelp,
  colourOptions,
  editColourHelp,
  editNoticeSwitch,
  feedbackMonths,
  monthLabel,
  noticeDescription,
} from './feedback-form.ts';
import { filterLabels } from './roster.ts';

/** A draft may be blank; submitting needs the text (the API refuses it too). */
const FeedbackForm = FeedbackContentRequest.superRefine((values, context) => {
  if (values.submit === true && values.body.trim() === '') {
    context.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'Write your feedback before submitting.',
    });
  }
});

const periodId = 'feedback-period';
const bodyId = 'feedback-body';
const colourId = 'feedback-colour';

/** A new entry, a draft carried on with (9.6), or submitted feedback being changed (9.8). */
export type FeedbackTarget =
  | Readonly<{ kind: 'new' }>
  | Readonly<{ kind: 'draft'; entry: FeedbackView }>
  | Readonly<{ kind: 'edit'; entry: FeedbackView }>;

/** The dialog for new feedback, as one shared value. */
export const newFeedback: FeedbackTarget = { kind: 'new' };

type FormProps = Readonly<{
  intern: InternDetail;
  batch: BatchDetail;
  target: FeedbackTarget;
  onClose: () => void;
}>;

const GiveFeedbackForm = ({ intern, batch, target, onClose }: FormProps) => {
  const editing = target.kind === 'edit';
  const existing = target.kind === 'new' ? undefined : target.entry;
  const queryClient = useQueryClient();
  const noticeLabelId = useId();
  const noticeDescriptionId = useId();
  const today = utcToday();
  const months = feedbackMonths(batch.startDate, today);
  const onNotice = intern.status === 'on_notice';
  const fields = useRef<HTMLDivElement>(null);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(FeedbackForm),
    defaultValues: {
      period: existing?.period ?? months.options[0]?.value ?? '',
      body: existing?.body ?? '',
      colorCode: existing?.colorCode ?? null,
      // Feedback whose notice is running keeps it on; anyone else on notice can't get another.
      givesNotice: editing
        ? (existing?.givesNotice ?? false)
        : !onNotice && (existing?.givesNotice ?? false),
      submit: false,
    },
  });
  const refresh = (queryKey: readonly unknown[]) =>
    queryClient.invalidateQueries({ queryKey, exact: true });
  const mutation = useMutation({
    mutationFn: ({ submit, ...content }: FeedbackContentRequest) => {
      if (target.kind === 'edit') {
        return editFeedback(intern.batchId, intern.id, target.entry.id, content);
      }
      const body = submit === true ? { ...content, submit } : content;
      return target.kind === 'draft'
        ? updateDraft(intern.batchId, intern.id, target.entry.id, body)
        : createFeedback(intern.batchId, intern.id, body);
    },
    onSuccess: async (_entry, body) => {
      // Exact keys: a prefix match on the profile would refetch everything under it.
      await Promise.all([
        refresh(feedbackQuery(intern.batchId, intern.id).queryKey),
        // My pending's lists and badge (11.2): a draft saved, or feedback given.
        refresh(pendingQuery.queryKey),
        // Submitting or editing may set the colour and start or withdraw a notice: the profile,
        // roster and counts change.
        ...(body.submit === true
          ? [
              refresh(internQuery(intern.batchId, intern.id).queryKey),
              refresh(internsQuery(intern.batchId).queryKey),
              refresh(batchQuery(intern.batchId).queryKey),
              refresh(batchesQuery.queryKey),
            ]
          : []),
      ]);
      onClose();
    },
    // The callout is at the top of the fields, which may be scrolled.
    onError: () => {
      if (fields.current) fields.current.scrollTop = 0;
    },
  });

  const send = (submit: boolean) => {
    setValue('submit', submit);
    // Errors are shown from `mutation.error`, so the rejection is dropped here.
    void handleSubmit(async ({ period, body, colorCode, givesNotice }) => {
      const content = { period, body, colorCode, givesNotice };
      await mutation
        .mutateAsync(submit ? { ...content, submit: true } : content)
        .catch(() => undefined);
    })();
  };

  const givesNotice = useWatch({ control, name: 'givesNotice' });
  const colorCode = useWatch({ control, name: 'colorCode' });
  const notice =
    target.kind === 'edit'
      ? editNoticeSwitch(intern, target.entry, givesNotice, today, batch.programManager.name)
      : {
          description: noticeDescription(intern, givesNotice, today, batch.programManager.name),
          disabled: onNotice,
        };
  const submitting = mutation.isPending && mutation.variables?.submit === true;
  const saving = mutation.isPending && mutation.variables?.submit !== true;
  const blocked = mutation.isPending || months.notStarted;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        send(true);
      }}
      className="flex flex-col gap-[18px]"
    >
      {/*
        v2: the fields scroll and the buttons stay in view. 240px rather than v2's 220px leaves
        room for the two-line description, so the dialog itself never scrolls too.
      */}
      <div
        ref={fields}
        className="-mx-[22px] flex max-h-[calc(100vh-240px)] flex-col gap-[18px] overflow-y-auto px-[22px]"
      >
        {mutation.error ? (
          <Callout
            type="issue"
            title={
              editing
                ? "We couldn't save your changes"
                : mutation.variables?.submit === true
                  ? "We couldn't submit your feedback"
                  : "We couldn't save your draft"
            }
          >
            Your text is still here. Try again in a moment.
            {isApiError(mutation.error) && mutation.error.detail ? ` ${mutation.error.detail}` : ''}
          </Callout>
        ) : null}
        {months.notStarted ? (
          <Callout type="info" title={`This batch starts in ${monthLabel(batch.startDate)}.`}>
            Feedback can be written from then.
          </Callout>
        ) : null}
        <div className="grid grid-cols-2 items-start gap-3">
          <Field id={periodId} label="Feedback period" required error={errors.period?.message}>
            <Select
              id={periodId}
              aria-required
              invalid={errors.period !== undefined}
              aria-describedby={errors.period ? messageId(periodId) : undefined}
              {...register('period')}
            >
              <option value="" disabled>
                Choose a month
              </option>
              {months.options.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-[1.2] font-medium">Notice</span>
            <div
              className={`flex items-start justify-between gap-3 rounded-sm border px-3 py-2 ${givesNotice ? 'border-equal-ember-300 bg-equal-ember-50' : 'border-border bg-background'}`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span id={noticeLabelId} className="text-sm font-medium">
                  Mark as notice
                </span>
                <span
                  id={noticeDescriptionId}
                  className="text-xs leading-[17px] text-muted-foreground"
                >
                  {notice.description}
                </span>
              </div>
              <Switch
                checked={givesNotice}
                disabled={notice.disabled}
                aria-labelledby={noticeLabelId}
                aria-describedby={noticeDescriptionId}
                onChange={(on) => {
                  setValue('givesNotice', on);
                  // v2 pairs notice with Red (9.5 decision 2); any colour can still be chosen.
                  if (on) setValue('colorCode', 'red');
                }}
              />
            </div>
          </div>
        </div>
        <fieldset aria-describedby={messageId(colourId)} className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 p-0 text-sm leading-[1.2] font-medium">Colour code</legend>
          <div className="flex flex-col border border-border">
            {colourOptions.map((option) => {
              const code = option.key === 'none' ? null : option.key;
              const selected = colorCode === code;
              return (
                <label
                  key={option.key}
                  className={`flex min-h-9 cursor-pointer items-start gap-2.5 border-b border-border px-3 py-2 last:border-b-0 ${selected ? 'bg-ee-blue-50' : 'bg-background'}`}
                >
                  <input
                    type="radio"
                    name="colorCode"
                    value={option.key}
                    checked={selected}
                    onChange={() => setValue('colorCode', code)}
                    aria-labelledby={`${colourId}-${option.key}-label`}
                    aria-describedby={`${colourId}-${option.key}`}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="mt-px inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-(--slate-300) bg-input transition-[border-color] duration-120 peer-checked:border-primary peer-focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] peer-checked:[&>span]:visible"
                  >
                    <span className="invisible size-[9px] rounded-full bg-primary" />
                  </span>
                  <span
                    id={`${colourId}-${option.key}-label`}
                    className="inline-flex w-[150px] shrink-0 items-center gap-1.5 text-[13px] leading-5 font-semibold"
                  >
                    <span
                      aria-hidden
                      className={`size-2.5 rounded-full ${colourTones[option.key].dot}`}
                    />
                    {filterLabels[option.key]}
                  </span>
                  <span
                    id={`${colourId}-${option.key}`}
                    className="min-w-0 pt-px text-xs leading-[18px] text-pretty text-muted-foreground"
                  >
                    {option.description}
                  </span>
                </label>
              );
            })}
          </div>
          <span id={messageId(colourId)} className="text-xs text-muted-foreground">
            {editing ? editColourHelp(intern.colorCode) : colourHelp(intern.colorCode)}
          </span>
        </fieldset>
        <Field id={bodyId} label="Feedback" required error={errors.body?.message}>
          <Controller
            control={control}
            name="body"
            render={({ field }) => (
              <MarkdownEditor
                ref={field.ref}
                id={bodyId}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="What did you observe, and what should change?"
                invalid={errors.body !== undefined}
                aria-describedby={errors.body ? messageId(bodyId) : undefined}
                aria-required
              />
            )}
          />
        </Field>
      </div>
      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {editing ? (
          <Button type="submit" disabled={blocked}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" disabled={blocked} onClick={() => send(false)}>
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
            <Button type="submit" disabled={blocked}>
              {submitting ? 'Submitting…' : 'Submit feedback'}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
};

type GiveFeedbackDialogProps = Readonly<{
  intern: InternDetail;
  batch: BatchDetail;
  open: boolean;
  onClose: () => void;
  /** What's written: a new entry, a draft (9.6's "Continue editing"), or an edit (9.8). */
  target?: FeedbackTarget;
}>;

/**
 * A7 · Give feedback: a new entry, or an existing draft, saved as a draft or submitted (9.5).
 * The same dialog edits submitted feedback as "Edit feedback for …" with Save changes (9.8).
 */
export const GiveFeedbackDialog = ({
  intern,
  batch,
  open,
  onClose,
  target = newFeedback,
}: GiveFeedbackDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title={
      target.kind === 'edit'
        ? `Edit feedback for ${intern.name}`
        : `Give feedback to ${intern.name}`
    }
    description={
      target.kind === 'edit'
        ? `Visible to all mentors in ${batch.name}. Saving marks it as edited.`
        : `Visible to all mentors in ${batch.name} once submitted. Drafts are visible only to you.`
    }
    widthClass="max-w-[560px]"
  >
    <GiveFeedbackForm intern={intern} batch={batch} target={target} onClose={onClose} />
  </Dialog>
);
