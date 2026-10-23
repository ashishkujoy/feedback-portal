import { CreateUserRequest, type Role } from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { isApiError } from '../api/errors.ts';
import { createUser, usersQuery } from '../api/users.ts';
import { useSettings } from '../branding/use-settings.ts';
import { roleLabels } from '../identity/roles.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { Field, FieldSet, messageId } from '../ui/field.tsx';
import { TextInput } from '../ui/text-input.tsx';

const defaultValues: CreateUserRequest = { name: '', email: '', roles: ['mentor'] };

/** Most privileged first, as everywhere else. */
const roleChoices: readonly Role[] = ['admin', 'program_manager', 'mentor'];

const AddUserForm = ({ onClose }: Readonly<{ onClose: () => void }>) => {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(CreateUserRequest), defaultValues });
  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      // Wait for the list, so the new user is there when the dialog closes.
      await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
      onClose();
    },
    onError: (error) => {
      if (isApiError(error, 'email_taken')) {
        setError(
          'email',
          { message: 'A user with this email already exists.' },
          { shouldFocus: true },
        );
      }
    },
  });

  useEffect(() => {
    setFocus('name');
  }, [setFocus]);

  // `mutateAsync` keeps `isSubmitting` true until the request (and refetch) finish; its errors
  // are handled in `onError`, so the rejection is dropped here.
  const onSubmit = handleSubmit(async (body) => {
    await mutation.mutateAsync(body).catch(() => undefined);
  });
  const failed =
    mutation.error && !isApiError(mutation.error, 'email_taken') ? mutation.error : null;

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <Field id="add-user-name" label="Full name" error={errors.name?.message}>
        <TextInput
          id="add-user-name"
          autoComplete="off"
          invalid={errors.name !== undefined}
          aria-describedby={errors.name ? messageId('add-user-name') : undefined}
          {...register('name')}
        />
      </Field>
      <Field id="add-user-email" label="Email" error={errors.email?.message}>
        <TextInput
          id="add-user-email"
          type="email"
          autoComplete="off"
          spellCheck={false}
          invalid={errors.email !== undefined}
          aria-describedby={errors.email ? messageId('add-user-email') : undefined}
          {...register('email')}
        />
      </Field>
      <FieldSet
        id="add-user-roles"
        label="Roles"
        error={errors.roles?.message}
        help="Mentors can give feedback and comment. Assign them to a batch from the batch page."
      >
        <div className="flex flex-wrap gap-4">
          {roleChoices.map((role) => (
            <Checkbox key={role} label={roleLabels[role]} value={role} {...register('roles')} />
          ))}
        </div>
      </FieldSet>
      {failed ? (
        <Callout type="issue" title="We couldn't add this user">
          {isApiError(failed) ? failed.detail : undefined}
        </Callout>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add user'}
        </Button>
      </div>
    </form>
  );
};

type AddUserDialogProps = Readonly<{ open: boolean; onClose: () => void }>;

/** A13 · Add user. No invite is sent: they sign in with Google using this email (decision 5). */
export const AddUserDialog = ({ open, onClose }: AddUserDialogProps) => {
  const settings = useSettings();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add user"
      description={
        settings
          ? `They sign in with their ${settings.orgName} Google account, using this email.`
          : 'They sign in with their Google account, using this email.'
      }
      widthClass="max-w-[480px]"
    >
      <AddUserForm onClose={onClose} />
    </Dialog>
  );
};
