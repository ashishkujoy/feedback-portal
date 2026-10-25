import type {
  FieldMapping,
  ImportColumns,
  MappedField,
  UsernameSource,
} from '@feedback-portal/contracts';

/** What each Fields-step select holds: `col:<name>`, `fromEmail` (username only), or `''` (none). */
export type FieldChoices = Readonly<Record<MappedField, string>>;

export const fromEmail = 'fromEmail';

export const columnValue = (column: string): string => `col:${column}`;

const columnOf = (value: string): string | null =>
  value.startsWith('col:') ? value.slice('col:'.length) : null;

/** The Fields step's starting choices, from the mapping the API suggests. */
export const choicesFrom = ({ mapping }: Pick<ImportColumns, 'mapping'>): FieldChoices => {
  const column = (name: string | null) => (name === null ? '' : columnValue(name));
  let username = '';
  if (mapping.username?.kind === 'fromEmail') username = fromEmail;
  else if (mapping.username?.kind === 'column') username = columnValue(mapping.username.column);
  return {
    username,
    name: column(mapping.name),
    email: column(mapping.email),
    phone: column(mapping.phone),
    diplomaBranch: column(mapping.diplomaBranch),
    parentNames: column(mapping.parentNames),
    interviewNotes: column(mapping.interviewNotes),
  };
};

export const requiredFields: readonly MappedField[] = ['username', 'name', 'email'];

const usernameFrom = (value: string): UsernameSource | null => {
  if (value === fromEmail) return { kind: 'fromEmail' };
  const column = columnOf(value);
  return column === null ? null : { kind: 'column', column };
};

/** The chosen mapping, or the required fields still without a column. */
export const mappingFrom = (
  choices: FieldChoices,
):
  | Readonly<{ ok: true; mapping: FieldMapping }>
  | Readonly<{ ok: false; unset: readonly MappedField[] }> => {
  const username = usernameFrom(choices.username);
  const name = columnOf(choices.name);
  const email = columnOf(choices.email);
  if (username === null || name === null || email === null) {
    return {
      ok: false,
      unset: requiredFields.filter((field) =>
        field === 'username' ? username === null : columnOf(choices[field]) === null,
      ),
    };
  }
  return {
    ok: true,
    mapping: {
      username,
      name,
      email,
      phone: columnOf(choices.phone),
      diplomaBranch: columnOf(choices.diplomaBranch),
      parentNames: columnOf(choices.parentNames),
      interviewNotes: columnOf(choices.interviewNotes),
    },
  };
};
