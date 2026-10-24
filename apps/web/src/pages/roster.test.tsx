import type { BatchDetail, InternSummary, Role } from '@feedback-portal/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, type Reply, signedInWith, stubApi, userWith } from '../test/stub-api.ts';
import { noInternCounts } from '../test/fixtures.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2027, 2, 17, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const me = userWith(['program_manager']);
const otherPm = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Oli Other', avatarUrl: null };

const batch = (overrides: Partial<BatchDetail> = {}): BatchDetail => ({
  id: batchId,
  name: 'Batch 2027',
  startDate: '2027-01-11',
  endDate: '2028-06-25',
  isArchived: false,
  programManager: { id: me.id, name: me.name, avatarUrl: null },
  mentorCount: 0,
  interns: noInternCounts,
  mentors: [],
  members: [],
  ...overrides,
});

let n = 0;
const intern = (name: string, overrides: Partial<InternSummary> = {}): InternSummary => {
  n += 1;
  return {
    id: `01890a5d-ac96-774b-bcce-b3020900${String(n).padStart(4, '0')}`,
    batchId,
    username: name.toLowerCase().replace(' ', '.'),
    name,
    email: `${n}@example.com`,
    status: 'active',
    colorCode: null,
    noticeEndsOn: null,
    ...overrides,
  };
};

const roster = [
  intern('Zoya Ansari', { colorCode: 'green' }),
  intern('Ishita Rao', { colorCode: 'red', status: 'on_notice', noticeEndsOn: '2027-04-01' }),
  intern('Kabir Nair', { colorCode: 'red', status: 'terminated' }),
  intern('aarav Sharma', { colorCode: 'yellow' }),
  intern('Dev Bhat'),
];

const internsPath = `GET /batches/${batchId}/interns`;

const stub = ({
  roles = ['program_manager'],
  detail = batch(),
  interns = { status: 200, body: roster },
}: Readonly<{ roles?: [Role, ...Role[]]; detail?: BatchDetail; interns?: Reply }> = {}) =>
  stubApi({
    ...signedInWith(roles),
    [`GET /batches/${batchId}`]: { status: 200, body: detail },
    [internsPath]: interns,
  });

const open = async (search = '') => {
  const user = userEvent.setup();
  const app = renderApp(`/batches/${batchId}${search}`);
  await screen.findByRole('heading', { level: 1, name: 'Batch 2027' });
  return { user, ...app };
};

const cardNames = () =>
  within(screen.getByRole('list', { name: 'Interns' }))
    .getAllByRole('listitem')
    .map((card) => card.getAttribute('aria-label'));

/** Text without the decorative parts (avatar initials, dots). */
const visibleText = (element: HTMLElement) => {
  const copy = element.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error('expected an element');
  for (const hidden of copy.querySelectorAll('[aria-hidden]')) hidden.remove();
  return copy.textContent;
};

const pathOf = (input: Parameters<typeof fetch>[0]) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

const tag = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Filter interns' })).getByRole('button', { name });

describe('tabs', () => {
  it('opens on Interns, with counts, and moves the mentor tables to Mentors', async () => {
    stub({ detail: batch({ mentorCount: 3, interns: { ...noInternCounts, total: 5 } }) });
    const { user, router } = await open();
    await screen.findByRole('list', { name: 'Interns' });

    expect(
      screen.getAllByRole('tab').map((tab) => [tab.textContent, tab.getAttribute('aria-selected')]),
    ).toEqual([
      ['Interns5', 'true'],
      ['Mentors3', 'false'],
    ]);
    expect(screen.queryByRole('table', { name: 'Mentors' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Mentors/ }));

    expect(screen.getByRole('table', { name: 'Mentors' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Interns' })).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ tab: 'mentors' });
  });
});

describe('the roster', () => {
  it('shows a card per intern, by name, with colour, username and badge', async () => {
    stub();
    await open();
    await screen.findByRole('list', { name: 'Interns' });

    expect(cardNames()).toEqual([
      'aarav Sharma',
      'Dev Bhat',
      'Ishita Rao',
      'Kabir Nair',
      'Zoya Ansari',
    ]);
    const ishita = within(screen.getByRole('listitem', { name: 'Ishita Rao' }));
    expect(ishita.getByText('@ishita.rao')).toBeInTheDocument();
    expect(ishita.getByText('Red')).toBeInTheDocument();
    expect(ishita.getByText('On notice · 15 days left')).toBeInTheDocument();
    const dev = within(screen.getByRole('listitem', { name: 'Dev Bhat' }));
    expect(dev.getByText('No colour')).toBeInTheDocument();
    expect(dev.queryByText('Read-only')).not.toBeInTheDocument();
    const kabir = within(screen.getByRole('listitem', { name: 'Kabir Nair' }));
    expect(kabir.getByText('Terminated')).toBeInTheDocument();
    expect(kabir.getByText('Read-only')).toBeInTheDocument();
  });

  it('counts each colour and status in the summary', async () => {
    stub();
    await open();

    await screen.findByRole('list', { name: 'Interns' });
    const cells = [...document.querySelectorAll('dl > div')].map(
      (cell) => `${cell.querySelector('dt')?.textContent} ${cell.querySelector('dd')?.textContent}`,
    );
    expect(cells).toEqual([
      'Green 1',
      'Yellow 1',
      'Borderline Yellow 0',
      'Orange 0',
      'Borderline Red 0',
      'Red 2',
      'No colour 1',
      'On notice 1',
      'Terminated 1',
      'Withdrawn 0',
      'Graduated 0',
    ]);
  });

  it('switches to the table and keeps the view in the URL', async () => {
    stub();
    const { user, router } = await open();
    await screen.findByRole('list', { name: 'Interns' });

    await user.click(screen.getByRole('button', { name: 'Table' }));

    const table = screen.getByRole('table', { name: 'Interns' });
    expect(within(table).getAllByRole('rowheader').map(visibleText)).toEqual([
      'aarav Sharma@aarav.sharma',
      'Dev Bhat@dev.bhat',
      'Ishita Rao@ishita.rao',
      'Kabir Nair@kabir.nair',
      'Zoya Ansari@zoya.ansari',
    ]);
    expect(within(table).getAllByText('Active')).toHaveLength(3);
    expect(screen.getByText('Showing 5 of 5 interns')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.search).toEqual({ view: 'table' });
  });

  it('filters by one colour or status at a time', async () => {
    stub();
    const { user, router } = await open();
    await screen.findByRole('list', { name: 'Interns' });
    expect(tag(/^All 5/)).toHaveAttribute('aria-pressed', 'true');

    await user.click(tag(/^Red 2/));
    expect(cardNames()).toEqual(['Ishita Rao', 'Kabir Nair']);
    expect(router.state.location.search).toEqual({ filter: 'red' });

    await user.click(tag(/^Terminated 1/));
    expect(cardNames()).toEqual(['Kabir Nair']);
    expect(tag(/^Red/)).toHaveAttribute('aria-pressed', 'false');

    // Choosing it again goes back to All.
    await user.click(tag(/^Terminated/));
    expect(cardNames()).toHaveLength(5);
    expect(router.state.location.search).toEqual({});
  });

  it('searches by username, ignoring case, together with the filter', async () => {
    stub();
    const { user, router } = await open('?filter=red');
    await screen.findByRole('list', { name: 'Interns' });

    await user.type(screen.getByRole('searchbox', { name: 'Search interns by username' }), 'KAB');

    expect(cardNames()).toEqual(['Kabir Nair']);
    expect(router.state.location.search).toEqual({ filter: 'red', q: 'KAB' });
  });

  it('restores the view, filter and search from the URL', async () => {
    stub();
    await open('?view=table&filter=red&q=ish');

    const table = await screen.findByRole('table', { name: 'Interns' });
    expect(within(table).getAllByRole('rowheader')).toHaveLength(1);
    expect(screen.getByRole('searchbox', { name: 'Search interns by username' })).toHaveValue(
      'ish',
    );
    expect(tag(/^Red/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('says when nothing matches, and clears the search and filter', async () => {
    stub();
    const { user, router } = await open('?filter=green&q=kiran');

    expect(await screen.findByText('No interns match “kiran”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(cardNames()).toHaveLength(5);
    expect(router.state.location.search).toEqual({});
  });

  it('makes every card read-only on an archived batch', async () => {
    stub({ detail: batch({ isArchived: true }) });
    await open();
    await screen.findByRole('list', { name: 'Interns' });

    expect(screen.getAllByText('Read-only')).toHaveLength(5);
  });
});

describe('states', () => {
  it('invites a manager to add the first intern', async () => {
    stub({ interns: { status: 200, body: [] } });
    const { user } = await open();

    expect(await screen.findByText('No interns yet')).toBeInTheDocument();
    expect(screen.getByText('Add interns one at a time.')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Add intern' });
    await user.click(buttons.at(-1) ?? document.body);
    expect(screen.getByRole('dialog', { name: 'Add intern' })).toBeInTheDocument();
  });

  it('tells a mentor who adds interns', async () => {
    stub({
      roles: ['mentor'],
      detail: batch({ programManager: otherPm }),
      interns: { status: 200, body: [] },
    });
    await open();

    expect(
      await screen.findByText('The programme manager adds interns to this batch.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add intern' })).not.toBeInTheDocument();
  });

  it('shows skeletons while loading', async () => {
    const fetchMock = stub();
    const answer = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) =>
      pathOf(input).endsWith('/interns')
        ? new Promise<Response>(() => undefined)
        : (answer?.(input, init) ?? Promise.reject(new Error('no stub'))),
    );
    await open();

    await waitFor(() => expect(document.querySelector('[aria-busy]')).not.toBeNull());
    expect(document.querySelectorAll('[aria-busy] > div')).toHaveLength(8);
  });

  it('shows an error, keeps the filters, and retries', async () => {
    const fetchMock = stub({ interns: problem(502, 'unavailable') });
    const { user } = await open('?filter=red');

    expect(
      await screen.findByText("We couldn't load the interns", undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your filters are kept\./)).toBeInTheDocument();

    fetchMock.mockImplementation(() => json(200, roster));
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('list', { name: 'Interns' })).toBeInTheDocument();
    expect(cardNames()).toEqual(['Ishita Rao', 'Kabir Nair']);
  });

  it('shows a newly added intern', async () => {
    const fetchMock = stub({ interns: { status: 200, body: [] } });
    const { user } = await open();
    await screen.findByText('No interns yet');
    const added = intern('Neha Joshi');
    const answer = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === 'POST') return json(201, added);
      if (pathOf(input).endsWith('/interns')) return json(200, [added]);
      return answer?.(input, init) ?? Promise.reject(new Error('no stub'));
    });

    await user.click(screen.getAllByRole('button', { name: 'Add intern' })[0] ?? document.body);
    const dialog = within(screen.getByRole('dialog', { name: 'Add intern' }));
    await user.type(dialog.getByRole('textbox', { name: 'Username' }), 'neha.joshi');
    await user.type(dialog.getByRole('textbox', { name: 'Full name' }), 'Neha Joshi');
    await user.type(dialog.getByRole('textbox', { name: 'Email' }), 'neha@example.com');
    await user.click(dialog.getByRole('button', { name: 'Add intern' }));
    await user.click(await dialog.findByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('listitem', { name: 'Neha Joshi' })).toBeInTheDocument();
  });
});
