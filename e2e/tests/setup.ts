import { expect, type APIRequestContext } from '@playwright/test';

/** The admin made by the stack's seed job. */
export const adminEmail = 'admin@e2e.test';

export const pm = { email: 'pm@e2e.test', name: 'Pranav Manager' };
export const mentor = { email: 'mentor@e2e.test', name: 'Meera Mentor' };
export const intern = { username: 'isha.intern', name: 'Isha Intern', email: 'isha@e2e.test' };

export type Batch = Readonly<{ batchId: string; internId: string }>;

/** `YYYY-MM-DD` in UTC, `months` from the first of this month. */
const firstOfMonth = (months: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1))
    .toISOString()
    .slice(0, 10);
};

const idOf = (body: unknown) => {
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }
  throw new Error(`expected an id in ${JSON.stringify(body)}`);
};

/**
 * As the signed-in admin, through the api (the browser's cookie, and the Origin the api's CSRF
 * check expects): a PM, a mentor, a batch that started last month, and an intern.
 */
export const setUpBatch = async (request: APIRequestContext, origin: string): Promise<Batch> => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { data, headers: { origin } });
    expect(response.status(), `POST ${path}`).toBeLessThan(300);
    return idOf(await response.json());
  };
  const pmId = await post('/users', { ...pm, roles: ['program_manager'] });
  const mentorId = await post('/users', { ...mentor, roles: ['mentor'] });
  const batchId = await post('/batches', {
    name: 'Batch E2E',
    startDate: firstOfMonth(-1),
    endDate: firstOfMonth(12),
    programManagerId: pmId,
  });
  await post(`/batches/${batchId}/mentors`, { userId: mentorId });
  const internId = await post(`/batches/${batchId}/interns`, intern);
  return { batchId, internId };
};
