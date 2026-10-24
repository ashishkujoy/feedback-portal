import { type InternDetail, UpdateInternDetailsRequest } from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { isApiError } from '../../api/errors.ts';
import { internQuery, internsQuery, updateInternDetails } from '../../api/interns.ts';
import { Button } from '../../ui/button.tsx';
import { Callout } from '../../ui/callout.tsx';
import { Dialog } from '../../ui/dialog.tsx';
import { messageId } from '../../ui/field.tsx';
import { type DetailField, InternDetailFields, UsernameField } from '../intern-fields.tsx';

type FormProps = Readonly<{ intern: InternDetail; onClose: () => void }>;

const EditDetailsForm = ({ intern, onClose }: FormProps) => {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(UpdateInternDetailsRequest),
    defaultValues: {
      name: intern.name,
      email: intern.email,
      phone: intern.phone ?? '',
      diplomaBranch: intern.diplomaBranch ?? '',
      parentNames: intern.parentNames ?? '',
      interviewNotes: intern.interviewNotes ?? '',
    },
  });
  const mutation = useMutation({
    mutationFn: (body: UpdateInternDetailsRequest) =>
      updateInternDetails(intern.batchId, intern.id, body),
    onSuccess: async (updated) => {
      queryClient.setQueryData(internQuery(intern.batchId, intern.id).queryKey, updated);
      // Exact: a prefix match would also refetch the profile just set above.
      await queryClient.invalidateQueries({
        queryKey: internsQuery(intern.batchId).queryKey,
        exact: true,
      });
      onClose();
    },
  });

  useEffect(() => {
    setFocus('name');
  }, [setFocus]);

  // Errors are shown from `mutation.error`, so the rejection is dropped here.
  const onSubmit = handleSubmit(async (body) => {
    await mutation.mutateAsync(body).catch(() => undefined);
  });

  const control = (name: DetailField, id: string, hasHelp = false) => ({
    id,
    invalid: errors[name] !== undefined,
    'aria-describedby': hasHelp || errors[name] ? messageId(id) : undefined,
    ...register(name),
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <UsernameField
        id="edit-intern-username"
        help="Usernames can't change because imports match on them."
        aria-describedby={messageId('edit-intern-username')}
        value={intern.username}
        disabled
        readOnly
      />
      <InternDetailFields
        idPrefix="edit-intern"
        control={control}
        error={(name) => errors[name]?.message}
      />
      {mutation.error ? (
        <Callout type="issue" title="We couldn't save these details">
          {isApiError(mutation.error) ? mutation.error.detail : undefined}
        </Callout>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </form>
  );
};

type EditDetailsDialogProps = Readonly<{
  intern: InternDetail;
  batchName: string;
  open: boolean;
  onClose: () => void;
}>;

/** A15 · Edit details: A14's form with the username locked (7.9). */
export const EditDetailsDialog = ({ intern, batchName, open, onClose }: EditDetailsDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title="Edit details"
    description={`${intern.name} · ${batchName}`}
    widthClass="max-w-[560px]"
  >
    <EditDetailsForm intern={intern} onClose={onClose} />
  </Dialog>
);
