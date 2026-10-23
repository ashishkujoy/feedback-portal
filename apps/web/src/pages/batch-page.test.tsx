import type { BatchDetail, BatchMemberView } from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, signedInWith, stubApi } from '../test/stub-api.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2027, 2, 1, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const id = '01890a5d-ac96-774b-bcce-b30209000001';

let n = 0;
const member = (
  name: string,
  role: BatchMemberView['role'],
  assignedAt: string,
  unassignedAt: string | null = null,
  isActive = true,
): BatchMemberView => {
  n += 1;
  return {
    id: `01890a5d-ac96-774b-bcce-b3020901${String(n).padStart(4, '0')}`,
    user: {
      id: `01890a5d-ac96-774b-bcce-b3020902${String(n).padStart(4, '0')}`,
      name,
      email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@example.com`,
      avatarUrl: null,
      isActive,
    },
    role,
    assignedAt,
    unassignedAt,
  };
};

const oldPm = member(
  'Old Manager',
  'program_manager',
  '2027-01-11T09:00:00Z',
  '2027-02-01T09:00:00Z',
);
const pat = member('Pat Manager', 'program_manager', '2027-02-01T09:00:00Z');
const ann = member('Ann Lee', 'mentor', '2027-01-12T09:00:00Z');
const bo = member('Bo Chen', 'mentor', '2027-01-13T09:00:00Z', '2027-02-15T09:00:00Z');
const cy = member('Cy Diaz', 'mentor', '2027-02-20T09:00:00Z', null, false);

const detail = (members: BatchMemberView[]): BatchDetail => ({
  id,
  name: 'Batch 2027',
  startDate: '2027-01-11',
  endDate: '2028-06-25',
  isArchived: false,
  programManager: { id: pat.user.id, name: 'Pat Manager', avatarUrl: null },
  mentorCount: 2,
  mentors: [],
  members,
});

const withBatch = (body: BatchDetail) =>
  stubApi({ ...signedInWith(['mentor']), [`GET /batches/${id}`]: { status: 200, body } });

const rowsOf = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => {
          const copy = cell.cloneNode(true);
          if (!(copy instanceof HTMLElement)) throw new Error('expected an element');
          for (const hidden of copy.querySelectorAll('[aria-hidden]')) hidden.remove();
          return copy.textContent;
        }),
    );

describe('the batch page', () => {
  it('shows the header: name, status, dates and programme manager', async () => {
    withBatch(detail([oldPm, ann, bo, pat, cy]));
    renderApp(`/batches/${id}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Batch 2027' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(
      screen.getByText('11 Jan 2027 – 25 Jun 2028 · Programme manager: Pat Manager'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['My batches', 'Batch 2027']);
  });

  it('lists current mentors with email and when they were assigned', async () => {
    withBatch(detail([oldPm, ann, bo, pat, cy]));
    renderApp(`/batches/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'Batch 2027' });

    expect(rowsOf('Mentors')).toEqual([
      ['Ann Lee', 'ann@example.com', '12 Jan 2027'],
      ['Cy DiazInactive', 'cy@example.com', '20 Feb 2027'],
    ]);
  });

  it('lists past members: mentors who left and replaced programme managers', async () => {
    withBatch(detail([oldPm, ann, bo, pat, cy]));
    renderApp(`/batches/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'Batch 2027' });

    expect(screen.getByRole('heading', { level: 2, name: 'Past members' })).toBeInTheDocument();
    expect(rowsOf('Past members')).toEqual([
      ['Old Manager', 'Programme manager', '11 Jan 2027', '1 Feb 2027'],
      ['Bo Chen', 'Mentor', '13 Jan 2027', '15 Feb 2027'],
    ]);
  });

  it('hides past members when there are none, and says when there are no mentors', async () => {
    withBatch(detail([pat]));
    renderApp(`/batches/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'Batch 2027' });

    expect(screen.queryByRole('heading', { name: 'Past members' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('table', { name: 'Mentors' })).getByText('No mentors yet.'),
    ).toBeInTheDocument();
  });

  it('is "Page not found" for a batch that does not exist or is not visible', async () => {
    stubApi({ ...signedInWith(['mentor']), [`GET /batches/${id}`]: problem(404, 'not_found') });
    renderApp(`/batches/${id}`);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('is "Page not found" for an id that is not a batch id, without asking the API', async () => {
    const fetchMock = stubApi(signedInWith(['mentor']));
    renderApp('/batches/not-a-batch');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input)),
    ).not.toContainEqual(expect.stringContaining('/batches/not-a-batch'));
  });
});
