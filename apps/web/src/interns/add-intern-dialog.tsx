import { CreateInternRequest, type InternSummary } from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { isApiError } from '../api/errors.ts';
import { addIntern } from '../api/interns.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { Field, messageId } from '../ui/field.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { TextInput } from '../ui/text-input.tsx';

const defaultValues = {
  username: '',
  name: '',
  email: '',
  phone: '',
  diplomaBranch: '',
  parentNames: '',
  interviewNotes: '',
} satisfies CreateInternRequest;

type FormProps = Readonly<{
  batchId: string;
  onAdded: (intern: InternSummary) => void;
  onClose: () => void;
}>;

const AddInternForm = ({ batchId, onAdded, onClose }: FormProps) => {
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(CreateInternRequest), defaultValues });
  const mutation = useMutation({
    mutationFn: (body: CreateInternRequest) => addIntern(batchId, body),
    onSuccess: onAdded,
    onError: (error) => {
      if (isApiError(error, 'intern_username_taken')) {
        setError(
          'username',
          { message: 'This username is already in the batch.' },
          { shouldFocus: true },
        );
      }
    },
  });

  useEffect(() => {
    setFocus('username');
  }, [setFocus]);

  // `mutateAsync` keeps `isSubmitting` true until the request finishes; its errors are handled
  // in `onError`, so the rejection is dropped here.
  const onSubmit = handleSubmit(async (body) => {
    await mutation.mutateAsync(body).catch(() => undefined);
  });
  const failed =
    mutation.error && !isApiError(mutation.error, 'intern_username_taken') ? mutation.error : null;

  /** The props every text control shares: the form's state, and the message once there is one. */
  const control = (name: keyof typeof defaultValues, id: string, hasHelp = false) => ({
    id,
    invalid: errors[name] !== undefined,
    'aria-describedby': hasHelp || errors[name] ? messageId(id) : undefined,
    ...register(name),
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <Field
        id="add-intern-username"
        label="Username"
        required
        help="Lowercase, as in Airtable."
        error={errors.username?.message}
      >
        <TextInput
          mono
          leftIcon="@"
          autoComplete="off"
          spellCheck={false}
          aria-required
          {...control('username', 'add-intern-username', true)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="add-intern-name" label="Full name" required error={errors.name?.message}>
          <TextInput autoComplete="off" aria-required {...control('name', 'add-intern-name')} />
        </Field>
        <Field id="add-intern-email" label="Email" required error={errors.email?.message}>
          <TextInput
            type="email"
            autoComplete="off"
            spellCheck={false}
            aria-required
            {...control('email', 'add-intern-email')}
          />
        </Field>
        <Field id="add-intern-phone" label="Phone" error={errors.phone?.message}>
          <TextInput type="tel" autoComplete="off" {...control('phone', 'add-intern-phone')} />
        </Field>
        <Field id="add-intern-branch" label="Diploma branch" error={errors.diplomaBranch?.message}>
          <TextInput autoComplete="off" {...control('diplomaBranch', 'add-intern-branch')} />
        </Field>
      </div>
      <Field id="add-intern-parents" label="Parents' names" error={errors.parentNames?.message}>
        <TextInput autoComplete="off" {...control('parentNames', 'add-intern-parents')} />
      </Field>
      <Field
        id="add-intern-notes"
        label="Interview notes"
        help="Markdown supported."
        error={errors.interviewNotes?.message}
      >
        <Textarea mono rows={5} {...control('interviewNotes', 'add-intern-notes', true)} />
      </Field>
      {failed ? (
        <Callout type="issue" title="We couldn't add this intern">
          {isApiError(failed) ? failed.detail : undefined}
        </Callout>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add intern'}
        </Button>
      </div>
    </form>
  );
};

type AddedProps = Readonly<{
  intern: InternSummary;
  batchName: string;
  onAddAnother: () => void;
  onDone: () => void;
}>;

/**
 * A14-success: the form gives way to a confirmation (7.3 decision 3: no pronoun). Focus moves to
 * Done, which is described by the confirmation, so a screen reader reads it out.
 */
const Added = ({ intern, batchName, onAddAnother, onDone }: AddedProps) => {
  const done = useRef<HTMLButtonElement>(null);
  const confirmationId = useId();
  useEffect(() => {
    done.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <div id={confirmationId}>
        <Callout type="positive" title={`${intern.name} added to ${batchName}`}>
          {intern.name} is on the roster as Active, with no colour code.
        </Callout>
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onAddAnother}>
          Add another
        </Button>
        <Button ref={done} aria-describedby={confirmationId} onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
};

type AddInternDialogProps = Readonly<{
  batchId: string;
  batchName: string;
  open: boolean;
  onClose: () => void;
}>;

/** A14 · Add intern, for when the intern isn't in Airtable. */
export const AddInternDialog = ({ batchId, batchName, open, onClose }: AddInternDialogProps) => {
  const [added, setAdded] = useState<InternSummary | null>(null);
  const close = () => {
    setAdded(null);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add intern"
      description="Use this when the intern isn't in Airtable. Later imports match interns by username."
      widthClass="max-w-[560px]"
    >
      {added ? (
        <Added
          intern={added}
          batchName={batchName}
          onAddAnother={() => setAdded(null)}
          onDone={close}
        />
      ) : (
        <AddInternForm batchId={batchId} onAdded={setAdded} onClose={close} />
      )}
    </Dialog>
  );
};
