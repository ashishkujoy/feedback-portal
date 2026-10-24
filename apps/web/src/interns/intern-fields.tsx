import type { ComponentProps } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field } from '../ui/field.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { TextInput } from '../ui/text-input.tsx';

/** The details both A14 (Add intern) and A15 (Edit details) ask for, after the username. */
export type DetailField =
  | 'name'
  | 'email'
  | 'phone'
  | 'diplomaBranch'
  | 'parentNames'
  | 'interviewNotes';

/** What a form gives each control: its id, invalid state, message link and registration. */
export type ControlProps = Readonly<{
  id: string;
  invalid: boolean;
  'aria-describedby': string | undefined;
}> &
  UseFormRegisterReturn;

type DetailFieldsProps = Readonly<{
  idPrefix: string;
  control: (name: DetailField, id: string, hasHelp?: boolean) => ControlProps;
  error: (name: DetailField) => string | undefined;
}>;

/**
 * A14 / A15's fields after the username: a 2-column grid (gap 12) of Full name, Email, Phone and
 * Diploma branch, then Parents' names, then Interview notes (mono, 5 rows, Markdown).
 */
export const InternDetailFields = ({ idPrefix, control, error }: DetailFieldsProps) => {
  const id = (suffix: string) => `${idPrefix}-${suffix}`;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id={id('name')} label="Full name" required error={error('name')}>
          <TextInput autoComplete="off" aria-required {...control('name', id('name'))} />
        </Field>
        <Field id={id('email')} label="Email" required error={error('email')}>
          <TextInput
            type="email"
            autoComplete="off"
            spellCheck={false}
            aria-required
            {...control('email', id('email'))}
          />
        </Field>
        <Field id={id('phone')} label="Phone" error={error('phone')}>
          <TextInput type="tel" autoComplete="off" {...control('phone', id('phone'))} />
        </Field>
        <Field id={id('branch')} label="Diploma branch" error={error('diplomaBranch')}>
          <TextInput autoComplete="off" {...control('diplomaBranch', id('branch'))} />
        </Field>
      </div>
      <Field id={id('parents')} label="Parents' names" error={error('parentNames')}>
        <TextInput autoComplete="off" {...control('parentNames', id('parents'))} />
      </Field>
      <Field
        id={id('notes')}
        label="Interview notes"
        help="Markdown supported."
        error={error('interviewNotes')}
      >
        <Textarea mono rows={5} {...control('interviewNotes', id('notes'), true)} />
      </Field>
    </>
  );
};

type UsernameFieldProps = Readonly<{
  id: string;
  help: string;
  error?: string | undefined;
}> &
  Omit<ComponentProps<typeof TextInput>, 'id'>;

/** The username: required, mono, with the "@" in front; locked once the intern exists (A15). */
export const UsernameField = ({ id, help, error, ...input }: UsernameFieldProps) => (
  <Field id={id} label="Username" required help={help} error={error}>
    <TextInput
      id={id}
      mono
      leftIcon="@"
      autoComplete="off"
      spellCheck={false}
      aria-required
      {...input}
    />
  </Field>
);
