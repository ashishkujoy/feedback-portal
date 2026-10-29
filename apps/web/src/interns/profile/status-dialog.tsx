import {
  ChangeStatusRequest,
  type InternDetail,
  type StatusAction,
} from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { batchesQuery, batchQuery } from '../../api/batches.ts';
import { isApiError } from '../../api/errors.ts';
import { changeStatus, internQuery, internsQuery } from '../../api/interns.ts';
import { pendingQuery } from '../../api/pending.ts';
import { Button } from '../../ui/button.tsx';
import { Callout } from '../../ui/callout.tsx';
import { Dialog } from '../../ui/dialog.tsx';
import { Field, messageId } from '../../ui/field.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { dialogCopy } from './status-actions.ts';

type FormProps = Readonly<{ intern: InternDetail; action: StatusAction; onClose: () => void }>;

const reasonId = 'status-change-reason';

const StatusForm = ({ intern, action, onClose }: FormProps) => {
  const queryClient = useQueryClient();
  const copy = dialogCopy(action, intern);
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(ChangeStatusRequest),
    defaultValues: { action, reason: '' },
  });
  const mutation = useMutation({
    mutationFn: (body: ChangeStatusRequest) => changeStatus(intern.batchId, intern.id, body),
    onSuccess: async (updated) => {
      // The profile shows the answer; the roster and the batch counts change too (7.6 decision 5).
      queryClient.setQueryData(internQuery(intern.batchId, intern.id).queryKey, updated);
      await Promise.all([
        // Exact: a prefix match would also refetch the profile just set above.
        queryClient.invalidateQueries({
          queryKey: internsQuery(intern.batchId).queryKey,
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: batchQuery(intern.batchId).queryKey,
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: batchesQuery.queryKey, exact: true }),
        // An intern who leaves drops off My pending (11.2).
        queryClient.invalidateQueries({ queryKey: pendingQuery.queryKey, exact: true }),
      ]);
      onClose();
    },
  });

  useEffect(() => {
    setFocus('reason');
  }, [setFocus]);

  // Errors are shown from `mutation.error`, so the rejection is dropped here.
  const onSubmit = handleSubmit(async (body) => {
    await mutation.mutateAsync(body).catch(() => undefined);
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <div className="bg-muted px-3.5 py-3">
        <ul className="flex list-disc flex-col gap-1 pl-[18px] text-[13px] leading-5">
          {copy.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <Field
        id={reasonId}
        label="Reason"
        required
        help="Markdown supported. Kept in the status history."
        error={errors.reason?.message}
      >
        <Textarea
          id={reasonId}
          mono
          rows={5}
          aria-required
          invalid={errors.reason !== undefined}
          aria-describedby={messageId(reasonId)}
          {...register('reason')}
        />
      </Field>
      {mutation.error ? (
        <Callout type="issue" title={copy.failure}>
          {isApiError(mutation.error) ? mutation.error.detail : undefined}
        </Callout>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant={copy.submitVariant} disabled={isSubmitting}>
          {copy.submit}
        </Button>
      </div>
    </form>
  );
};

type StatusDialogProps = Readonly<{
  intern: InternDetail;
  /** The change being made; `null` while closed. */
  action: StatusAction | null;
  onClose: () => void;
}>;

/** P18–P21 · a status change with its reason (7.6). */
export const StatusDialog = ({ intern, action, onClose }: StatusDialogProps) => {
  const copy = action ? dialogCopy(action, intern) : null;
  return (
    <Dialog
      open={action !== null}
      onClose={onClose}
      title={copy?.title ?? ''}
      description={copy?.description}
      widthClass="max-w-[520px]"
    >
      {action ? (
        <StatusForm key={action} intern={intern} action={action} onClose={onClose} />
      ) : null}
    </Dialog>
  );
};
