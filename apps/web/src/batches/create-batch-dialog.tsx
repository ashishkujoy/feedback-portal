import { CreateBatchRequest } from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { batchesQuery, batchQuery, createBatch } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { usersQuery } from '../api/users.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { Field, messageId } from '../ui/field.tsx';
import { Select } from '../ui/select.tsx';
import { TextInput } from '../ui/text-input.tsx';
import { byName } from '../users/filter-users.ts';
import { addMonths } from './batch-dates.ts';

const defaultValues: CreateBatchRequest = {
  name: '',
  startDate: '',
  endDate: '',
  programManagerId: '',
};

/** DATA_MODEL: a batch runs for about 18 months. */
const typicalLengthInMonths = 18;

const describedBy = (id: string, hasError: boolean) => (hasError ? messageId(id) : undefined);

const CreateBatchForm = ({ onClose }: Readonly<{ onClose: () => void }>) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Admins only, like this dialog, so the user list is available.
  const { data: users } = useQuery(usersQuery);
  const programManagers = byName(
    (users ?? []).filter((user) => user.isActive && user.roles.includes('program_manager')),
  );
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(CreateBatchRequest), defaultValues });
  const mutation = useMutation({
    mutationFn: createBatch,
    onSuccess: async (batch) => {
      queryClient.setQueryData(batchQuery(batch.id).queryKey, batch);
      await queryClient.invalidateQueries({ queryKey: batchesQuery.queryKey, exact: true });
      onClose();
      await navigate({ to: '/batches/$batchId', params: { batchId: batch.id } });
    },
    onError: (error) => {
      if (isApiError(error, 'batch_name_taken')) {
        setError(
          'name',
          { message: 'A batch with this name already exists.' },
          { shouldFocus: true },
        );
      }
    },
  });

  useEffect(() => {
    setFocus('name');
  }, [setFocus]);

  const onSubmit = handleSubmit(async (body) => {
    await mutation.mutateAsync(body).catch(() => undefined);
  });
  const failed =
    mutation.error && !isApiError(mutation.error, 'batch_name_taken') ? mutation.error : null;
  const startDate = register('startDate', {
    // The end defaults to the usual length once a start is picked; it can still be changed.
    onChange: (event: { target: { value: string } }) => {
      const start = event.target.value;
      if (start && getValues('endDate') === '') {
        setValue('endDate', addMonths(start, typicalLengthInMonths));
      }
    },
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <Field id="create-batch-name" label="Batch name" error={errors.name?.message}>
        <TextInput
          id="create-batch-name"
          autoComplete="off"
          invalid={errors.name !== undefined}
          aria-describedby={describedBy('create-batch-name', errors.name !== undefined)}
          {...register('name')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="create-batch-start" label="Start date" error={errors.startDate?.message}>
          <TextInput
            id="create-batch-start"
            type="date"
            invalid={errors.startDate !== undefined}
            aria-describedby={describedBy('create-batch-start', errors.startDate !== undefined)}
            {...startDate}
          />
        </Field>
        <Field id="create-batch-end" label="End date" error={errors.endDate?.message}>
          <TextInput
            id="create-batch-end"
            type="date"
            invalid={errors.endDate !== undefined}
            aria-describedby={describedBy('create-batch-end', errors.endDate !== undefined)}
            {...register('endDate')}
          />
        </Field>
      </div>
      <Field
        id="create-batch-pm"
        label="Programme manager"
        error={errors.programManagerId?.message}
      >
        <Select
          id="create-batch-pm"
          invalid={errors.programManagerId !== undefined}
          aria-describedby={describedBy('create-batch-pm', errors.programManagerId !== undefined)}
          {...register('programManagerId')}
        >
          <option value="">Choose a programme manager</option>
          {programManagers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
      </Field>
      {failed ? (
        <Callout type="issue" title="We couldn't create this batch">
          {isApiError(failed) ? failed.detail : undefined}
        </Callout>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create batch'}
        </Button>
      </div>
    </form>
  );
};

type CreateBatchDialogProps = Readonly<{ open: boolean; onClose: () => void }>;

/** A9 · Create batch (admins). A batch starts with its programme manager (6.2). */
export const CreateBatchDialog = ({ open, onClose }: CreateBatchDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title="Create batch"
    description="Add interns from Airtable once the batch is created."
    widthClass="max-w-[520px]"
  >
    <CreateBatchForm onClose={onClose} />
  </Dialog>
);
