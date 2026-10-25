import {
  type FieldMapping,
  type ImportColumns,
  type ImportPreview,
  type ImportResult,
  ImportSourceRequest,
  type MappedField,
  mappedFields,
} from '@feedback-portal/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { batchesQuery, batchQuery } from '../api/batches.ts';
import { isApiError } from '../api/errors.ts';
import { listImportColumns, previewImport, runImport } from '../api/imports.ts';
import { internsQuery } from '../api/interns.ts';
import { Button } from '../ui/button.tsx';
import { Callout } from '../ui/callout.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { Field, messageId } from '../ui/field.tsx';
import { Select } from '../ui/select.tsx';
import { Spinner } from '../ui/spinner.tsx';
import { TextInput } from '../ui/text-input.tsx';
import {
  choicesFrom,
  columnValue,
  type FieldChoices,
  fromEmail,
  mappingFrom,
  requiredFields,
} from './import-fields.ts';

/** What the form sends once the contract has trimmed it: the key included, so it stays here. */
type Source = ImportSourceRequest;

const emptySource = { token: '', baseId: '', tableId: '', view: '' } satisfies Source;

/** The Fields step's state, kept so Back from the preview returns to the same choices. */
type Fields = Readonly<{ source: Source; columns: ImportColumns; choices: FieldChoices }>;

/** Everything a preview was made from, for importing it or going back. */
type Previewed = Fields & Readonly<{ mapping: FieldMapping; preview: ImportPreview }>;

type Step =
  | Readonly<{ kind: 'source' }>
  | (Fields & Readonly<{ kind: 'fields' }>)
  | (Previewed & Readonly<{ kind: 'preview' }>)
  | (Previewed & Readonly<{ kind: 'importing' }>)
  | Readonly<{ kind: 'result'; result: ImportResult }>
  | (Previewed & Readonly<{ kind: 'failed'; reason: string }>);

const stepLabels = ['Source', 'Fields', 'Preview', 'Result'];

const stepIndex = (step: Step): number => {
  if (step.kind === 'source') return 0;
  if (step.kind === 'fields') return 1;
  return step.kind === 'preview' ? 2 : 3;
};

const interns = (count: number) => `${count} ${count === 1 ? 'intern' : 'interns'}`;

/** Airtable's refusals carry a sentence for people (8.3); anything else gets a general one. */
const reasonOf = (error: unknown): string | undefined =>
  isApiError(error, 'airtable_source_invalid') ||
  isApiError(error, 'airtable_unavailable') ||
  isApiError(error, 'airtable_mapping_invalid')
    ? error.detail
    : undefined;

/** Moves focus to the step's main button when the step appears, so the dialog never loses it. */
const useFocusOnMount = () => {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
};

/** A10's steps: a numbered dot (✓ once done, red when the current step failed) and its label. */
const Steps = ({ current, failed }: Readonly<{ current: number; failed: boolean }>) => (
  <ol aria-label="Import steps" className="flex items-center gap-2">
    {stepLabels.map((label, index) => {
      const done = index < current;
      const isCurrent = index === current;
      let dot = 'bg-(--slate-200) text-(--slate-600)';
      if (isCurrent && failed) dot = 'bg-destructive text-white';
      else if (done || isCurrent) dot = 'bg-primary text-white';
      return (
        <li
          key={label}
          aria-current={isCurrent ? 'step' : undefined}
          className="flex items-center gap-2"
        >
          <span
            aria-hidden
            className={`inline-flex size-[22px] items-center justify-center rounded-full text-xs font-semibold ${dot}`}
          >
            {done ? '✓' : index + 1}
          </span>
          <span
            className={`text-[13px] font-medium ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {label}
          </span>
          {index < stepLabels.length - 1 ? (
            <span aria-hidden className="h-px w-7 bg-border" />
          ) : null}
        </li>
      );
    })}
  </ol>
);

/** The row of buttons under each step, above a rule. */
const Footer = ({
  split = false,
  children,
}: Readonly<{ split?: boolean; children: ReactNode }>) => (
  <div
    className={`flex gap-2 border-t border-border pt-4 ${split ? 'justify-between' : 'justify-end'}`}
  >
    {children}
  </div>
);

type SourceFormProps = Readonly<{
  batchId: string;
  values: Source;
  onRead: (source: Source, columns: ImportColumns) => void;
  onCancel: () => void;
}>;

/**
 * A10-source: the key (a password field browsers are asked not to save), the base and table IDs,
 * and the view. The contract checks them before anything is sent (A10-sourceerrors).
 */
const SourceForm = ({ batchId, values, onRead, onCancel }: SourceFormProps) => {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(ImportSourceRequest), defaultValues: values });
  const mutation = useMutation({
    mutationFn: (source: Source) => listImportColumns(batchId, source),
  });

  useEffect(() => {
    setFocus('token');
  }, [setFocus]);

  const onSubmit = handleSubmit(async (source) => {
    const columns = await mutation.mutateAsync(source).catch(() => undefined);
    if (columns) onRead(source, columns);
  });

  const control = (name: keyof Source, id: string, hasHelp = false) => ({
    id,
    invalid: errors[name] !== undefined,
    'aria-describedby': hasHelp || errors[name] ? messageId(id) : undefined,
    'aria-required': true,
    autoComplete: 'off',
    spellCheck: false,
    ...register(name),
  });
  const reason = mutation.error ? reasonOf(mutation.error) : undefined;

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      {mutation.error ? (
        <div role="alert">
          <Callout
            type="issue"
            title={reason ? "We couldn't connect to Airtable" : "We couldn't read the view"}
          >
            {reason ?? 'Something went wrong. Try again in a moment.'}
          </Callout>
        </div>
      ) : null}
      <Field
        id="import-token"
        label="API key"
        required
        help="Used for this import only. It isn't stored."
        error={errors.token?.message}
      >
        <TextInput
          type="password"
          data-1p-ignore
          data-lpignore="true"
          {...control('token', 'import-token', true)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="import-base"
          label="Base ID"
          required
          help="Starts with “app”."
          error={errors.baseId?.message}
        >
          <TextInput mono {...control('baseId', 'import-base', true)} />
        </Field>
        <Field
          id="import-table"
          label="Table ID"
          required
          help="Starts with “tbl”."
          error={errors.tableId?.message}
        >
          <TextInput mono {...control('tableId', 'import-table', true)} />
        </Field>
      </div>
      <Field id="import-view" label="View name" required error={errors.view?.message}>
        <TextInput {...control('view', 'import-view')} />
      </Field>
      <Footer>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Reading the view…' : 'Next'}
        </Button>
      </Footer>
    </form>
  );
};

const fieldLabels: Readonly<Record<MappedField, string>> = {
  username: 'Username',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  diplomaBranch: 'Diploma branch',
  parentNames: "Parents' names",
  interviewNotes: 'Interview notes',
};

const fieldId = (field: MappedField) => `import-field-${field}`;

type FieldsStepProps = Readonly<{
  batchId: string;
  batchName: string;
  fields: Fields;
  onPreviewed: (previewed: Previewed) => void;
  onBack: () => void;
}>;

/**
 * 8.6's Fields step (not in v2; built from Kuat Field and Select): each intern field takes one of
 * the view's columns, or for the username the email's part before the @. The batch's saved
 * mapping (or the defaults) comes pre-filled; it's saved for the batch when the import runs.
 */
const FieldsStep = ({ batchId, batchName, fields, onPreviewed, onBack }: FieldsStepProps) => {
  const { source, columns } = fields;
  const [choices, setChoices] = useState<FieldChoices>(fields.choices);
  const [unset, setUnset] = useState<readonly MappedField[]>([]);
  const mutation = useMutation({
    mutationFn: (mapping: FieldMapping) => previewImport(batchId, { ...source, mapping }),
  });
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  const choose = (field: MappedField, value: string) => {
    setChoices((current) => ({ ...current, [field]: value }));
    setUnset((current) => current.filter((other) => other !== field));
  };

  const preview = async () => {
    const chosen = mappingFrom(choices);
    if (!chosen.ok) {
      setUnset(chosen.unset);
      const [firstUnset] = chosen.unset;
      if (firstUnset) document.getElementById(fieldId(firstUnset))?.focus();
      return;
    }
    const result = await mutation.mutateAsync(chosen.mapping).catch(() => undefined);
    if (result) onPreviewed({ ...fields, choices, mapping: chosen.mapping, preview: result });
  };

  if (columns.columns.length === 0) {
    return (
      <div className="flex flex-col gap-[18px]">
        <Callout type="info" title="This view has no records">
          There's nothing to import. Check the view in Airtable, or go back and choose another.
        </Callout>
        <Footer split>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </Footer>
      </div>
    );
  }

  const missing = (field: MappedField) =>
    columns.missing.find((entry) => entry.field === field)?.column;
  const reason = mutation.error ? reasonOf(mutation.error) : undefined;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void preview();
      }}
      className="flex flex-col gap-4"
    >
      {mutation.error ? (
        <div role="alert">
          <Callout type="issue" title="We couldn't preview the import">
            {reason ?? 'Something went wrong. Try again in a moment.'}
          </Callout>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {`Match the view's columns to intern fields. They're saved for ${batchName} when you import.`}
      </p>
      <div className="flex flex-col gap-3">
        {mappedFields.map((field, index) => {
          const id = fieldId(field);
          const required = requiredFields.includes(field);
          // Once another column is chosen, the old one no longer matters.
          const gone = choices[field] === '' ? missing(field) : undefined;
          const error = unset.includes(field) ? 'Choose a column.' : undefined;
          const help = gone ? `“${gone}” isn't in this view.` : undefined;
          return (
            <div key={field} className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-3">
              <label
                htmlFor={id}
                className="inline-flex h-9 items-center gap-1 text-sm leading-[1.2] font-medium"
              >
                {fieldLabels[field]}
                {required ? (
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                ) : null}
              </label>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Select
                  id={id}
                  ref={index === 0 ? first : undefined}
                  value={choices[field]}
                  invalid={error !== undefined}
                  aria-required={required || undefined}
                  aria-describedby={error || help ? messageId(id) : undefined}
                  onChange={(event) => choose(field, event.target.value)}
                >
                  {required ? (
                    <option value="" disabled>
                      Choose a column
                    </option>
                  ) : (
                    <option value="">Not imported</option>
                  )}
                  {field === 'username' ? (
                    <option value={fromEmail}>From the email (before @)</option>
                  ) : null}
                  {columns.columns.map((column) => (
                    <option key={column} value={columnValue(column)}>
                      {column}
                    </option>
                  ))}
                </Select>
                {error || help ? (
                  <span
                    id={messageId(id)}
                    className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {error ?? help}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <Footer split>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Previewing…' : 'Preview import'}
        </Button>
      </Footer>
    </form>
  );
};

const countCell = 'flex flex-col gap-0.5 border-border px-3.5 py-3 not-last:border-r';

/** A10-preview's strip: New, Updated and (in red) Invalid. */
const Counts = ({ counts }: Readonly<{ counts: ImportPreview['counts'] }>) => (
  <dl className="grid grid-cols-3 border border-border">
    <div className={countCell}>
      <dt className="text-xs text-muted-foreground">New</dt>
      <dd className="text-[22px] font-semibold">{counts.new}</dd>
    </div>
    <div className={countCell}>
      <dt className="text-xs text-muted-foreground">Updated</dt>
      <dd className="text-[22px] font-semibold">{counts.updated}</dd>
    </div>
    <div className={countCell}>
      <dt className="text-xs text-destructive">Invalid</dt>
      <dd className="text-[22px] font-semibold text-destructive">{counts.invalid}</dd>
    </div>
  </dl>
);

/** A10-preview's invalid rows: Row, Username ("—" when there is none) and every reason. */
const InvalidRows = ({ rows }: Readonly<{ rows: ImportPreview['invalid'] }>) => (
  <section aria-labelledby="import-invalid" className="flex flex-col gap-2">
    <h3 id="import-invalid" className="text-sm font-medium">
      Invalid rows{' '}
      <span className="font-normal text-muted-foreground">· skipped, not imported</span>
    </h3>
    <table className="w-full table-fixed border border-border text-[13px]">
      <colgroup>
        <col className="w-[68px]" />
        <col className="w-[37.5%]" />
        <col />
      </colgroup>
      <thead>
        <tr className="border-b border-border bg-(--slate-50) text-left text-xs text-muted-foreground [&>th]:py-2 [&>th]:font-medium">
          <th scope="col" className="pr-1.5 pl-3">
            Row
          </th>
          <th scope="col" className="px-1.5">
            Username
          </th>
          <th scope="col" className="pr-3 pl-1.5">
            Reason
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.row}
            className="border-b border-border align-top last:border-b-0 [&>td]:py-2.5"
          >
            <td className="pr-1.5 pl-3 text-muted-foreground">{row.row}</td>
            <td className="truncate px-1.5 font-mono text-xs leading-5">{row.username ?? '—'}</td>
            <td className="pr-3 pl-1.5">
              {row.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

type PreviewStepProps = Readonly<{
  preview: ImportPreview;
  onBack: () => void;
  onImport: () => void;
}>;

/**
 * A10-preview. Import counts new and updated rows; with none (every row invalid, or an empty view)
 * it's disabled and the reasons are left to read (8.5 decision 4).
 */
const PreviewStep = ({ preview, onBack, onImport }: PreviewStepProps) => {
  const importable = preview.counts.new + preview.counts.updated;
  // Focus goes to Import, or to Back when there is nothing to import.
  const focused = useFocusOnMount();
  return (
    <div className="flex flex-col gap-[18px]">
      <Counts counts={preview.counts} />
      {preview.invalid.length > 0 ? (
        <>
          <InvalidRows rows={preview.invalid} />
          <p className="text-[13px] text-muted-foreground">
            Fix invalid rows in Airtable and import again, or add those interns by hand.
          </p>
        </>
      ) : null}
      <Footer split>
        <Button ref={importable > 0 ? undefined : focused} variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          ref={importable > 0 ? focused : undefined}
          disabled={importable === 0}
          onClick={onImport}
        >
          Import {interns(importable)}
        </Button>
      </Footer>
    </div>
  );
};

/**
 * A10-importing, without v2's progress or import history (8.5 decision 2): the import is one
 * request, and closing leaves it running.
 */
const ImportingStep = ({ count, onClose }: Readonly<{ count: number; onClose: () => void }>) => {
  const close = useFocusOnMount();
  return (
    <div className="flex flex-col gap-[18px]">
      <output className="flex flex-col items-center gap-3 border border-border px-5 py-7 text-center">
        <Spinner size={24} />
        <span className="text-[15px] font-semibold">Importing {interns(count)}</span>
      </output>
      <Footer>
        <Button ref={close} variant="outline" onClick={onClose}>
          Close
        </Button>
      </Footer>
    </div>
  );
};

const resultRow = 'flex justify-between border-border px-3.5 py-2.5 text-sm not-last:border-b';

/** A10-result, without "View import history" until there is one (8.5 decision 3). */
const ResultStep = ({ result, onDone }: Readonly<{ result: ImportResult; onDone: () => void }>) => {
  // Focus moves to Done, described by the summary, so a screen reader reads it out (as A14).
  const done = useFocusOnMount();
  const summaryId = useId();
  const { created, updated, skipped } = result.counts;
  return (
    <div className="flex flex-col gap-[18px]">
      <div id={summaryId}>
        <Callout type="positive" title="Import completed">
          {`${created} added, ${updated} updated, ${skipped} skipped.`}
          {skipped > 0 ? " Skipped rows weren't changed." : null}
        </Callout>
      </div>
      <dl className="border border-border">
        <div className={resultRow}>
          <dt>Added</dt>
          <dd className="font-semibold">{created}</dd>
        </div>
        <div className={resultRow}>
          <dt>Updated</dt>
          <dd className="font-semibold">{updated}</dd>
        </div>
        <div className={resultRow}>
          <dt>Skipped (invalid)</dt>
          <dd className="font-semibold">{skipped}</dd>
        </div>
      </dl>
      <Footer>
        <Button ref={done} aria-describedby={summaryId} onClick={onDone}>
          Done
        </Button>
      </Footer>
    </div>
  );
};

type FailedStepProps = Readonly<{ reason: string; onBack: () => void; onRetry: () => void }>;

/** A10-failed: nothing was saved (8.4 runs all or nothing). */
const FailedStep = ({ reason, onBack, onRetry }: FailedStepProps) => {
  const retry = useFocusOnMount();
  return (
    <div className="flex flex-col gap-[18px]">
      <div role="alert">
        <Callout type="issue" title="Import failed">
          {`${reason} Nothing was saved.`}
        </Callout>
      </div>
      <Footer split>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button ref={retry} onClick={onRetry}>
          Try again
        </Button>
      </Footer>
    </div>
  );
};

type ImportFlowProps = Readonly<{ batchId: string; batchName: string; onClose: () => void }>;

/**
 * The steps, mounted only while the dialog is open: closing it drops the key with everything
 * else typed (8.5). Back keeps the values and the field choices; Try again sends the same source
 * and mapping again.
 */
const ImportFlow = ({ batchId, batchName, onClose }: ImportFlowProps) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'source' });
  const [values, setValues] = useState<Source>(emptySource);
  // The roster, the batch's counts and the batches list pick the import up, even if the dialog
  // was closed while it ran (these callbacks outlive the component; `mutate`'s don't).
  const mutation = useMutation({
    mutationFn: ({ source, mapping }: Previewed) => runImport(batchId, { ...source, mapping }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: internsQuery(batchId).queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: batchQuery(batchId).queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: batchesQuery.queryKey, exact: true });
    },
  });

  const start = (previewed: Previewed) => {
    setStep({ ...previewed, kind: 'importing' });
    mutation.mutate(previewed, {
      onSuccess: (result) => setStep({ kind: 'result', result }),
      onError: (error) =>
        setStep({
          ...previewed,
          kind: 'failed',
          reason: reasonOf(error) ?? "The import couldn't be saved.",
        }),
    });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Steps current={stepIndex(step)} failed={step.kind === 'failed'} />
      {step.kind === 'source' ? (
        <SourceForm
          batchId={batchId}
          values={values}
          onRead={(source, columns) => {
            setValues(source);
            setStep({ kind: 'fields', source, columns, choices: choicesFrom(columns) });
          }}
          onCancel={onClose}
        />
      ) : null}
      {step.kind === 'fields' ? (
        <FieldsStep
          batchId={batchId}
          batchName={batchName}
          fields={step}
          onPreviewed={(previewed) => setStep({ ...previewed, kind: 'preview' })}
          onBack={() => setStep({ kind: 'source' })}
        />
      ) : null}
      {step.kind === 'preview' ? (
        <PreviewStep
          preview={step.preview}
          onBack={() => setStep({ ...step, kind: 'fields' })}
          onImport={() => start(step)}
        />
      ) : null}
      {step.kind === 'importing' ? (
        <ImportingStep
          count={step.preview.counts.new + step.preview.counts.updated}
          onClose={onClose}
        />
      ) : null}
      {step.kind === 'result' ? <ResultStep result={step.result} onDone={onClose} /> : null}
      {step.kind === 'failed' ? (
        <FailedStep
          reason={step.reason}
          onBack={() => setStep({ ...step, kind: 'preview' })}
          onRetry={() => start(step)}
        />
      ) : null}
    </div>
  );
};

type ImportDialogProps = Readonly<{
  batchId: string;
  batchName: string;
  open: boolean;
  onClose: () => void;
}>;

/** A10 · Import interns from Airtable, with the Base ID beside the table ID (8.5 decision 1). */
export const ImportDialog = ({ batchId, batchName, open, onClose }: ImportDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title="Import interns from Airtable"
    description={`Into ${batchName}. Interns are matched by their Airtable record or username: new ones are added and existing ones updated.`}
    widthClass="max-w-[560px]"
  >
    <ImportFlow batchId={batchId} batchName={batchName} onClose={onClose} />
  </Dialog>
);
