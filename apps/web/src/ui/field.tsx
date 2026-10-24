import type { ReactNode } from 'react';

/** The id of a field's help or error text, for the control's `aria-describedby`. */
export const messageId = (id: string) => `${id}-message`;

type MessageProps = Readonly<{ id: string; help?: ReactNode; error?: string | undefined }>;

/** Kuat Field's message: the error (12px, `--destructive`) replaces the help (12px, muted). */
const FieldMessage = ({ id, help, error }: MessageProps) => {
  if (error) {
    return (
      <span id={messageId(id)} className="text-xs text-destructive">
        {error}
      </span>
    );
  }
  return help ? (
    <span id={messageId(id)} className="text-xs text-muted-foreground">
      {help}
    </span>
  ) : null;
};

const labelClass = 'text-sm leading-[1.2] font-medium text-foreground';

type FieldProps = MessageProps &
  Readonly<{
    label: string;
    /** Kuat Label's red "*" (decorative; the control says it with `aria-required`). */
    required?: boolean;
    children: ReactNode;
  }>;

/** Kuat Field: a label, the control (whose id is `id`), then the error or help, at gap 6. */
export const Field = ({ id, label, required = false, help, error, children }: FieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className={`inline-flex items-center gap-1 ${labelClass}`}>
      {label}
      {required ? (
        <span aria-hidden className="text-destructive">
          *
        </span>
      ) : null}
    </label>
    {children}
    <FieldMessage id={id} help={help} error={error} />
  </div>
);

/** A Field for a group of controls (checkboxes): a `fieldset`, its legend styled as the label. */
export const FieldSet = ({ id, label, help, error, children }: FieldProps) => (
  <fieldset
    aria-describedby={help || error ? messageId(id) : undefined}
    className="flex min-w-0 flex-col gap-1.5"
  >
    <legend className={`mb-1.5 p-0 ${labelClass}`}>{label}</legend>
    {children}
    <FieldMessage id={id} help={help} error={error} />
  </fieldset>
);
