import { describe, expect, it } from 'vitest';
import { FeedbackBodyRequest, FeedbackContentRequest, FeedbackView } from './feedback.ts';

const messages = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues.map(({ path, message }) => [path.join('.'), message]);

describe('FeedbackContentRequest', () => {
  it('takes a draft with a blank body, and an optional submit', () => {
    const draft = { period: '2026-10-01', body: '', colorCode: null, givesNotice: false };

    expect(FeedbackContentRequest.parse(draft)).toEqual(draft);
    expect(
      FeedbackContentRequest.parse({ ...draft, colorCode: 'red', submit: true }),
    ).toMatchObject({
      colorCode: 'red',
      submit: true,
    });
  });

  it("explains a missing month and a body that's too long", () => {
    const result = FeedbackContentRequest.safeParse({
      period: '2026-10-24',
      body: 'x'.repeat(20_001),
      colorCode: 'purple',
      givesNotice: 'yes',
    });

    expect(messages(result)).toEqual([
      ['period', 'Choose the month this feedback covers.'],
      ['body', 'Feedback must be at most 20000 characters'],
      ['colorCode', expect.any(String)],
      ['givesNotice', expect.any(String)],
    ]);
  });
});

describe('FeedbackBodyRequest', () => {
  it('takes the text only', () => {
    expect(FeedbackBodyRequest.parse({ body: 'Clearer.', colorCode: 'red' })).toEqual({
      body: 'Clearer.',
    });
  });
});

describe('FeedbackView', () => {
  it('accepts a submitted entry with UTC times', () => {
    const view = {
      id: '01890a5d-ac96-774b-bcce-b30209000001',
      internId: '01890a5d-ac96-774b-bcce-b30209000002',
      period: '2026-10-01',
      body: 'Closed `PAY-214`.',
      colorCode: 'red',
      previousColorCode: 'orange',
      givesNotice: true,
      state: 'submitted',
      author: { id: '01890a5d-ac96-774b-bcce-b30209000003', name: 'Anjali D', avatarUrl: null },
      conversationId: null,
      submittedAt: '2026-10-24T09:00:00.000Z',
      createdAt: '2026-10-23T09:00:00.000Z',
      updatedAt: '2026-10-24T09:00:00.000Z',
    };

    expect(FeedbackView.parse(view)).toEqual(view);
    expect(FeedbackView.safeParse({ ...view, state: 'archived' }).success).toBe(false);
  });
});
