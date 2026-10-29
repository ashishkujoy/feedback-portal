import type { MyPending } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { userWith } from '../test/stub-api.ts';
import {
  badgeCount,
  internCount,
  lastFeedbackLabel,
  shownTab,
  tabItems,
  waitingFor,
} from './pending.ts';

const mentor = userWith(['mentor']);
const pm = userWith(['program_manager', 'mentor']);
const admin = userWith(['admin']);

const intern = { id: '01890a5d-ac96-774b-bcce-b30209000101', name: 'Ishita Rao', photoUrl: null };
const batch = { id: '01890a5d-ac96-774b-bcce-b30209000001', name: 'Batch 2026' };
const author = {
  id: '01890a5d-ac96-774b-bcce-b30209000097',
  name: 'Sana Qureshi',
  avatarUrl: null,
};

const pending: MyPending = {
  month: '2026-10-01',
  needsFeedback: [
    { intern, batch, colorCode: null, lastFeedback: null },
    { intern, batch, colorCode: null, lastFeedback: null },
  ],
  drafts: [],
  toDeliver: [
    {
      feedbackId: '01890a5d-ac96-774b-bcce-b30209000300',
      intern,
      batch,
      author,
      submittedAt: '2026-10-24T08:00:00.000Z',
      colorCode: null,
    },
  ],
};

describe('the tabs', () => {
  it('give a PM To deliver first, and anyone else Needs feedback and Drafts', () => {
    expect(tabItems(pm, pending)).toEqual([
      { value: 'deliver', label: 'To deliver', count: 1 },
      { value: 'feedback', label: 'Needs feedback', count: 2 },
      { value: 'drafts', label: 'Drafts', count: 0 },
    ]);
    expect(tabItems(mentor, undefined).map((item) => [item.value, item.count])).toEqual([
      ['feedback', undefined],
      ['drafts', undefined],
    ]);
  });

  it('open the asked tab if the role has it, else the first', () => {
    expect(shownTab(pm, undefined)).toBe('deliver');
    expect(shownTab(pm, 'drafts')).toBe('drafts');
    expect(shownTab(mentor, undefined)).toBe('feedback');
    expect(shownTab(mentor, 'deliver')).toBe('feedback');
    expect(shownTab(admin, 'drafts')).toBe('drafts');
  });
});

describe('the sidebar count (decision 2)', () => {
  it('is To deliver for a PM and Needs feedback for anyone else', () => {
    expect(badgeCount(pm, pending)).toBe(1);
    expect(badgeCount(mentor, pending)).toBe(2);
    expect(badgeCount(admin, pending)).toBe(2);
  });
});

describe('the labels', () => {
  it('name the last feedback’s author, or you, or none', () => {
    const last = { submittedAt: '2026-09-18T10:00:00.000Z', author };
    expect(lastFeedbackLabel(last, mentor.id)).toBe('18 Sep 2026 · Sana Qureshi');
    expect(lastFeedbackLabel(last, author.id)).toBe('18 Sep 2026 · you');
    expect(lastFeedbackLabel(null, mentor.id)).toBe('No feedback yet');
  });

  it('count interns', () => {
    expect(internCount(1)).toBe('1 intern');
    expect(internCount(12)).toBe('12 interns');
  });

  it('count the wait in UTC days', () => {
    const now = new Date('2026-10-24T10:00:00Z');
    expect(waitingFor('2026-10-24T08:00:00Z', now)).toBe('today');
    expect(waitingFor('2026-10-23T23:59:00Z', now)).toBe('1 day');
    expect(waitingFor('2026-10-19T12:00:00Z', now)).toBe('5 days');
  });
});
