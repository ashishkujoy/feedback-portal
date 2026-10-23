import type { BatchSummary, Role } from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { problem, signedInWith, stubApi } from '../test/stub-api.ts';

beforeEach(() => {
  // Only Date is faked, so timers (and user-event) run normally.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2027, 2, 1, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const person = (n: number, name: string) => ({
  id: `01890a5d-ac96-774b-bcce-b3020900${String(n).padStart(4, '0')}`,
  name,
  avatarUrl: null,
});

const pat = person(1, 'Pat Manager');
const mentors = ['Ann Lee', 'Bo Chen', 'Cy Diaz', 'Di Ek', 'Ed Fox', 'Flo Gu'].map((name, i) =>
  person(10 + i, name),
);

const batch = (n: number, name: string, overrides: Partial<BatchSummary> = {}): BatchSummary => ({
  id: `01890a5d-ac96-774b-bcce-b30209${String(n).padStart(6, '0')}`,
  name,
  startDate: '2027-01-11',
  endDate: '2028-06-25',
  isArchived: false,
  programManager: pat,
  mentorCount: 0,
  mentors: [],
  ...overrides,
});

const active = batch(1, 'Batch 2027', { mentorCount: 6, mentors });
const upcoming = batch(2, 'Batch 2028', { startDate: '2028-01-10', endDate: '2029-06-25' });
const completed = batch(3, 'Batch 2025', { startDate: '2025-01-13', endDate: '2026-06-26' });
const archived = batch(4, 'Batch 2024', {
  startDate: '2024-01-15',
  endDate: '2025-06-27',
  isArchived: true,
});
// As the API orders them: newest start first.
const all = [upcoming, active, completed, archived];

const withBatches = (roles: [Role, ...Role[]], batches: BatchSummary[] = all) =>
  stubApi({ ...signedInWith(roles), 'GET /batches': { status: 200, body: batches } });

const card = (name: string) => screen.getByRole('article', { name });

describe('the batches page', () => {
  it('shows each batch as a card: status, dates, name, mentors and View batch', async () => {
    withBatches(['admin']);
    renderApp('/batches');

    const list = await screen.findByRole('list', { name: 'Batches' });
    expect(
      within(list)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['Batch 2027', 'Batch 2028', 'Batch 2025', 'Batch 2024']);
    expect(card('Batch 2027')).toHaveTextContent(
      /^Active11 Jan 2027 – 25 Jun 2028Batch 2027Mentors6/,
    );
    expect(card('Batch 2028')).toHaveTextContent(/^UpcomingStarts 10 Jan 2028/);
    expect(card('Batch 2025')).toHaveTextContent(/^Completed13 Jan 2025 – 26 Jun 2026/);
    expect(card('Batch 2024')).toHaveTextContent(/^Archived/);
    expect(within(card('Batch 2027')).getByText(/^Mentors: /)).toHaveTextContent(
      'Mentors: Ann Lee, Bo Chen, Cy Diaz, Di Ek, Ed Fox, Flo Gu',
    );
    expect(within(card('Batch 2027')).getByText('+1')).toBeInTheDocument();
  });

  it('counts the batches for an admin', async () => {
    withBatches(['admin']);
    renderApp('/batches');

    expect(await screen.findByText('4 batches · 1 active, 1 upcoming')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Batches');
    expect(screen.getByRole('button', { name: 'Create batch' })).toBeInTheDocument();
  });

  it('shows a mentor "My batches", counted as theirs, with no Create batch', async () => {
    withBatches(['mentor'], [active]);
    renderApp('/batches');

    expect(await screen.findByText('1 batch assigned to you')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My batches');
    expect(screen.queryByRole('button', { name: 'Create batch' })).not.toBeInTheDocument();
  });

  it("doesn't offer Create batch to a programme manager", async () => {
    withBatches(['program_manager'], [active]);
    renderApp('/batches');

    expect(await screen.findByText('1 batch · 1 active, 0 upcoming')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create batch' })).not.toBeInTheDocument();
  });

  it('says when there are no batches yet', async () => {
    withBatches(['admin'], []);
    renderApp('/batches');
    expect(await screen.findByText('No batches yet.')).toBeInTheDocument();
  });

  it("tells someone they aren't on any batch yet", async () => {
    withBatches(['mentor'], []);
    renderApp('/batches');
    expect(await screen.findByText("You aren't assigned to any batches yet.")).toBeInTheDocument();
  });

  it("says when the batches couldn't load", async () => {
    stubApi({ ...signedInWith(['admin']), 'GET /batches': problem(500, 'internal') });
    renderApp('/batches');
    expect(
      await screen.findByText("We couldn't load batches", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('opens a batch from View batch', async () => {
    const fetchMock = withBatches(['admin']);
    const user = userEvent.setup();
    const { router } = renderApp('/batches');

    await user.click(await screen.findByRole('link', { name: 'View Batch 2027' }));

    expect(router.state.location.pathname).toBe(`/batches/${active.id}`);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input instanceof Request ? input.url : input).endsWith(`/batches/${active.id}`),
      ),
    ).toBe(true);
  });
});
