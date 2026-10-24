import type {
  BatchDetail,
  InternDetail,
  InternStatusEvent,
  InternSummary,
} from '@feedback-portal/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { noInternCounts } from '../test/fixtures.ts';
import { problem, signedInWith, stubApi, userWith } from '../test/stub-api.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 24, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const internId = '01890a5d-ac96-774b-bcce-b30209000002';
const me = userWith(['program_manager']);
const pat = { id: me.id, name: 'Rajesh Menon' };
const anjali = { id: '01890a5d-ac96-774b-bcce-b30209000003', name: 'Anjali Deshpande' };
const mentor = (n: number, name: string) => ({
  id: `01890a5d-ac96-774b-bcce-b3020901${String(n).padStart(4, '0')}`,
  name,
  avatarUrl: null,
});

const batch: BatchDetail = {
  id: batchId,
  name: 'Batch 2026',
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: { ...pat, avatarUrl: null },
  mentorCount: 2,
  interns: { ...noInternCounts, total: 1 },
  mentors: [mentor(1, 'Anjali Deshpande'), mentor(2, 'Vikram Shetty')],
  members: [],
};

const onboarding: InternStatusEvent = {
  id: '01890a5d-ac96-774b-bcce-b30209000010',
  fromStatus: null,
  toStatus: 'active',
  reason: null,
  noticeStartsOn: null,
  noticeEndsOn: null,
  actor: pat,
  createdAt: '2026-07-07T09:00:00.000Z',
};

const intern = (overrides: Partial<InternDetail> = {}): InternDetail => ({
  id: internId,
  batchId,
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita.rao@example.com',
  status: 'active',
  colorCode: null,
  noticeEndsOn: null,
  photoUrl: null,
  phone: '+91 98450 12345',
  diplomaBranch: 'Computer Engineering',
  parentNames: null,
  interviewNotes:
    '### Technical round\n- Solved it **tests first**\n\n<script>alert(1)</script>\n\n<b onclick="alert(1)">x</b>',
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: pat,
  statusEvents: [onboarding],
  ...overrides,
});

const onNotice = intern({
  status: 'on_notice',
  colorCode: 'red',
  noticeEndsOn: '2026-11-08',
  statusEvents: [
    {
      ...onboarding,
      id: '01890a5d-ac96-774b-bcce-b30209000011',
      fromStatus: 'active',
      toStatus: 'on_notice',
      reason: 'No improvement since **September**.',
      noticeStartsOn: '2026-10-08',
      noticeEndsOn: '2026-11-08',
      actor: anjali,
      createdAt: '2026-10-08T10:00:00.000Z',
    },
    onboarding,
  ],
});

const path = `/batches/${batchId}/interns/${internId}`;

const stub = (detail: InternDetail = intern()) =>
  stubApi({
    ...signedInWith(['program_manager']),
    [`GET /batches/${batchId}`]: { status: 200, body: batch },
    [`GET /batches/${batchId}/interns/${internId}`]: { status: 200, body: detail },
    [`GET /batches/${batchId}/interns/${internId}/feedback`]: { status: 200, body: [] },
  });

const open = async (search = '') => {
  const user = userEvent.setup();
  const app = renderApp(`${path}${search}`);
  await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' });
  return { user, ...app };
};

describe('the intern profile', () => {
  it('shows the header and the breadcrumb', async () => {
    stub();
    await open();

    expect(screen.getByText('@ishita.rao')).toBeInTheDocument();
    expect(screen.getByText('Batch 2026', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toHaveAttribute('data-type', 'info');
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Batches', 'Batch 2026', 'Ishita Rao']);
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
        name: 'Batch 2026',
      }),
    ).toHaveAttribute('href', `/batches/${batchId}`);
  });

  it('opens on the Timeline placeholder, naming the intern', async () => {
    stub();
    await open();

    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No feedback yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Feedback, conversations, comments and status changes for Ishita appear here, newest first.',
      ),
    ).toBeInTheDocument();
  });

  it('shows every detail, and how the intern was added, on Details', async () => {
    stub();
    const { user, router } = await open();

    await user.click(screen.getByRole('tab', { name: 'Details' }));

    const details = within(screen.getByRole('region', { name: 'Details' }));
    expect(
      [...details.getAllByRole('term')].map(
        (term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`,
      ),
    ).toEqual([
      'Username: @ishita.rao',
      'Email: ishita.rao@example.com',
      'Phone: +91 98450 12345',
      'Diploma branch: Computer Engineering',
      "Parents' names: —",
      'Added: Added by Rajesh Menon, 7 Jul 2026',
    ]);
    expect(router.state.location.search).toEqual({ tab: 'details' });
  });

  it('renders the interview notes as Markdown, without any raw HTML', async () => {
    stub();
    await open('?tab=details');

    const notes = screen.getByRole('region', { name: 'Interview notes' });
    expect(within(notes).getByRole('heading', { name: 'Technical round' })).toBeInTheDocument();
    expect(within(notes).getByText('tests first').tagName).toBe('STRONG');
    expect(notes.querySelector('script, b, [onclick]')).toBeNull();
  });

  it('says when there are no interview notes', async () => {
    stub(intern({ interviewNotes: null }));
    await open('?tab=details');

    expect(screen.getByText('No interview notes.')).toBeInTheDocument();
  });

  it('lists the status history newest first, with who and why', async () => {
    stub(onNotice);
    await open('?tab=history');

    const tab = screen.getByRole('tab', { name: /^Status history/ });
    expect(tab).toHaveTextContent('Status history2');
    expect(tab).toHaveAttribute('aria-selected', 'true');
    const rows = within(screen.getByRole('list', { name: 'Status changes' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      '8 Oct 2026ActivetoOn noticeby Anjali DeshpandeNo improvement since September.',
      '7 Jul 2026Activeby Rajesh MenonAdded by hand.',
    ]);
    expect(within(rows[0] ?? document.body).getByText('September').tagName).toBe('STRONG');
  });

  it('warns while on notice and shows the notice period', async () => {
    stub(onNotice);
    await open();

    expect(screen.getByText('On notice until 8 Nov 2026 · 15 days left')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Issued by Anjali Deshpande on 8 Oct 2026. Nothing happens automatically when it ends: Rajesh Menon, the programme manager, lifts it or terminates.',
      ),
    ).toBeInTheDocument();
    const colour = within(screen.getByRole('region', { name: 'Colour code' }));
    expect(colour.getByText('Red')).toBeInTheDocument();
    expect(colour.getByText('From the latest coloured feedback.')).toBeInTheDocument();
    expect(colour.getByText('15 of 31 days left')).toBeInTheDocument();
  });

  it('says a final intern is read-only', async () => {
    stub(
      intern({
        status: 'withdrawn',
        statusEvents: [
          {
            ...onboarding,
            id: '01890a5d-ac96-774b-bcce-b30209000012',
            fromStatus: 'active',
            toStatus: 'withdrawn',
            reason: 'Took another offer',
            createdAt: '2026-09-02T09:00:00.000Z',
          },
          onboarding,
        ],
      }),
    );
    await open();

    expect(
      screen.getByText('This intern withdrew on 2 Sep 2026. Their record is read-only.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/On notice until/)).not.toBeInTheDocument();
  });

  it("shows the colour code and the batch's mentors in the side panel", async () => {
    stub();
    await open();

    const colour = within(screen.getByRole('region', { name: 'Colour code' }));
    expect(colour.getByText('No colour yet')).toBeInTheDocument();
    expect(colour.getByText('Set by the first coloured feedback.')).toBeInTheDocument();
    const mentors = within(screen.getByRole('region', { name: 'Mentors' }));
    expect(mentors.getByText('Mentors: Anjali Deshpande, Vikram Shetty')).toBeInTheDocument();
    expect(mentors.getByText('2 mentors in this batch')).toBeInTheDocument();
  });

  it('is "Page not found" for an intern the API does not find', async () => {
    stubApi({
      ...signedInWith(['program_manager']),
      [`GET /batches/${batchId}`]: { status: 200, body: batch },
      [`GET /batches/${batchId}/interns/${internId}`]: problem(404, 'not_found'),
    });
    renderApp(path);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('the roster', () => {
  const summary: InternSummary = {
    id: internId,
    batchId,
    username: 'ishita.rao',
    name: 'Ishita Rao',
    email: 'ishita.rao@example.com',
    status: 'active',
    colorCode: null,
    noticeEndsOn: null,
    photoUrl: null,
  };

  it.each(['', '?view=table'])('links each name to the profile (%s)', async (search) => {
    stubApi({
      ...signedInWith(['program_manager']),
      [`GET /batches/${batchId}`]: { status: 200, body: batch },
      [`GET /batches/${batchId}/interns`]: { status: 200, body: [summary] },
      [`GET /batches/${batchId}/interns/${internId}`]: { status: 200, body: intern() },
    });
    const user = userEvent.setup();
    const { router } = renderApp(`/batches/${batchId}${search}`);

    await user.click(await screen.findByRole('link', { name: 'Ishita Rao' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });
});
