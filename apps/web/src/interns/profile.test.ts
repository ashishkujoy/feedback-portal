import type { InternDetail, InternStatusEvent } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import {
  addedText,
  colourSummary,
  eventReason,
  finalBanner,
  firstName,
  noticeBanner,
  noticePeriod,
  statusBadges,
} from './profile.ts';

const pat = { id: '01890a5d-ac96-774b-bcce-b302099a8059', name: 'Pat Manager' };
const mo = { id: '01890a5d-ac96-774b-bcce-b302099a8060', name: 'Mo Mentor' };

const event = (overrides: Partial<InternStatusEvent>): InternStatusEvent => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8061',
  fromStatus: null,
  toStatus: 'active',
  reason: null,
  noticeStartsOn: null,
  noticeEndsOn: null,
  feedbackId: null,
  actor: pat,
  createdAt: '2026-07-07T09:00:00.000Z',
  ...overrides,
});

const onboarding = event({});

const intern = (overrides: Partial<InternDetail> = {}): InternDetail => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  batchId: '01890a5d-ac96-774b-bcce-b302099a8058',
  username: 'ishita.rao',
  name: 'Ishita Rao',
  email: 'ishita@example.com',
  status: 'active',
  colorCode: null,
  noticeEndsOn: null,
  photoUrl: null,
  phone: null,
  diplomaBranch: null,
  parentNames: null,
  interviewNotes: null,
  source: 'manual',
  createdAt: '2026-07-07T09:00:00.000Z',
  addedBy: pat,
  statusEvents: [onboarding],
  ...overrides,
});

const onNotice = intern({
  status: 'on_notice',
  noticeEndsOn: '2026-11-08',
  statusEvents: [
    event({
      fromStatus: 'active',
      toStatus: 'on_notice',
      reason: 'No improvement',
      noticeStartsOn: '2026-10-08',
      noticeEndsOn: '2026-11-08',
      feedbackId: null,
      actor: mo,
      createdAt: '2026-10-08T10:00:00.000Z',
    }),
    onboarding,
  ],
});

describe('statusBadges', () => {
  it("follow v2's status map", () => {
    expect(Object.entries(statusBadges)).toEqual([
      ['active', { label: 'Active', type: 'info' }],
      ['on_notice', { label: 'On notice', type: 'error' }],
      ['graduated', { label: 'Graduated', type: 'success' }],
      ['terminated', { label: 'Terminated', type: 'neutral' }],
      ['withdrawn', { label: 'Withdrawn', type: 'neutral' }],
    ]);
  });
});

describe('noticeBanner', () => {
  it('gives the end, the days left, who issued it and who decides', () => {
    expect(noticeBanner(onNotice, '2026-10-24', 'Rajesh Menon')).toEqual({
      title: 'On notice until 8 Nov 2026 · 15 days left',
      description:
        'Issued by Mo Mentor on 8 Oct 2026. Nothing happens automatically when it ends: Rajesh Menon, the programme manager, lifts it or terminates.',
    });
  });

  it('asks for a decision once it has ended', () => {
    expect(noticeBanner(onNotice, '2026-11-12', 'Rajesh Menon')?.title).toBe(
      'Notice ended on 8 Nov 2026 · decision needed',
    );
  });

  it('is absent unless on notice', () => {
    expect(noticeBanner(intern(), '2026-10-24', 'Rajesh Menon')).toBeNull();
  });
});

const ended = (status: 'graduated' | 'terminated' | 'withdrawn') =>
  intern({
    status,
    statusEvents: [
      event({
        fromStatus: 'active',
        toStatus: status,
        reason: 'Done',
        createdAt: '2026-01-08T09:00:00.000Z',
      }),
      onboarding,
    ],
  });

describe('finalBanner', () => {
  it.each([
    ['graduated', 'This intern graduated on 8 Jan 2026. Their record is read-only.'],
    ['terminated', 'This intern was terminated on 8 Jan 2026. Their record is read-only.'],
    ['withdrawn', 'This intern withdrew on 8 Jan 2026. Their record is read-only.'],
  ] as const)('says when the intern %s', (status, title) => {
    expect(finalBanner(ended(status))).toEqual({
      title,
      description:
        'Feedback, conversations and comments stay visible. Nothing can be added or changed.',
    });
  });

  it('is absent while active or on notice', () => {
    expect([finalBanner(intern()), finalBanner(onNotice)]).toEqual([null, null]);
  });
});

describe('noticePeriod', () => {
  it('counts the days left of the whole notice', () => {
    expect(noticePeriod(onNotice, '2026-10-24')).toEqual({
      label: '15 of 31 days left',
      share: 15 / 31,
    });
    expect(noticePeriod(onNotice, '2026-11-12')).toEqual({ label: '0 of 31 days left', share: 0 });
    expect(noticePeriod(intern(), '2026-10-24')).toBeNull();
  });
});

describe('how the intern arrived', () => {
  it('names who added them by hand, or says they were imported', () => {
    expect(addedText(intern())).toBe('Added by Pat Manager, 7 Jul 2026');
    expect(addedText(intern({ source: 'airtable' }))).toBe('Imported from Airtable, 7 Jul 2026');
  });

  it("explains the onboarding event, which has no reason, and keeps any other event's", () => {
    expect(eventReason(onboarding, 'manual')).toBe('Added by hand.');
    expect(eventReason(onboarding, 'airtable')).toBe('Imported from Airtable.');
    expect(eventReason(event({ reason: 'Improved' }), 'manual')).toBe('Improved');
  });
});

describe('small texts', () => {
  it('take the first name', () => {
    expect([firstName('Zoya Ansari'), firstName('  Madhu  '), firstName('Ana María Ruiz')]).toEqual(
      ['Zoya', 'Madhu', 'Ana'],
    );
  });

  it('describe the colour code', () => {
    expect(colourSummary(null)).toEqual({
      label: 'No colour yet',
      note: 'Set by the first coloured feedback.',
    });
    expect(colourSummary('borderline_red')).toEqual({
      label: 'Borderline Red',
      note: 'From the latest coloured feedback.',
    });
  });
});
