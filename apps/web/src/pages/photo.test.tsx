import type { BatchDetail, InternDetail, Role } from '@feedback-portal/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app.tsx';
import { noInternCounts } from '../test/fixtures.ts';
import {
  problem,
  type Reply,
  signedInWith,
  stubApi,
  testSettings,
  userWith,
} from '../test/stub-api.ts';

const batchId = '01890a5d-ac96-774b-bcce-b30209000001';
const internId = '01890a5d-ac96-774b-bcce-b30209000002';
const me = userWith(['program_manager']);
const pat = { id: me.id, name: me.name };
const otherPm = { id: '01890a5d-ac96-774b-bcce-b30209000099', name: 'Oli Other', avatarUrl: null };
const photoUrl = 'https://res.cloudinary.test/demo/image/upload/c_fill/portal/interns/i/p2';

/** Records each upload and lets the test drive it: progress, the answer, or a failure. */
class FakeUpload {
  static last: FakeUpload | undefined;
  readonly upload = new EventTarget();
  readonly listeners = new EventTarget();
  method = '';
  url = '';
  body: FormData | undefined;
  status = 0;
  responseText = '';
  aborted = false;

  constructor() {
    FakeUpload.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.listeners.dispatchEvent(new Event('abort'));
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.addEventListener(type, listener);
  }

  progress(loaded: number, total: number) {
    const event = Object.assign(new Event('progress'), { lengthComputable: true, loaded, total });
    this.upload.dispatchEvent(event);
  }

  answer(body: unknown, status = 200) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.listeners.dispatchEvent(new Event('load'));
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 24, 10, 0));
  FakeUpload.last = undefined;
  vi.stubGlobal('XMLHttpRequest', FakeUpload);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const batch = (overrides: Partial<BatchDetail> = {}): BatchDetail => ({
  id: batchId,
  name: 'Batch 2026',
  startDate: '2026-07-06',
  endDate: '2028-01-06',
  isArchived: false,
  programManager: { ...pat, avatarUrl: null },
  mentorCount: 0,
  interns: { ...noInternCounts, total: 1 },
  mentors: [],
  members: [],
  ...overrides,
});

const intern = (overrides: Partial<InternDetail> = {}): InternDetail => ({
  id: internId,
  batchId,
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
  statusEvents: [],
  ...overrides,
});

const ticket = {
  uploadUrl: 'https://api.cloudinary.test/v1_1/demo/image/upload',
  apiKey: 'key-1',
  timestamp: 1_792_836_000,
  signature: 'sig',
  publicId: 'portal/interns/i/p2',
  allowedFormats: 'jpg,png',
};

const base = `/batches/${batchId}/interns/${internId}`;

const stub = ({
  roles = ['program_manager'],
  detail = batch(),
  profile = intern(),
  photos = true,
  saved = { status: 200, body: intern({ photoUrl }) },
}: Readonly<{
  roles?: [Role, ...Role[]];
  detail?: BatchDetail;
  profile?: InternDetail;
  photos?: boolean;
  saved?: Reply;
}> = {}) =>
  stubApi({
    ...signedInWith(roles),
    '/settings': { status: 200, body: { ...testSettings, photos } },
    [`GET /batches/${batchId}`]: { status: 200, body: detail },
    [`GET ${base}`]: { status: 200, body: profile },
    [`GET /batches/${batchId}/interns`]: { status: 200, body: [] },
    [`POST ${base}/photo-upload`]: { status: 200, body: ticket },
    [`PUT ${base}/photo`]: saved,
  });

const open = async () => {
  const user = userEvent.setup({ applyAccept: false });
  renderApp(base);
  await screen.findByRole('heading', { level: 1, name: 'Ishita Rao' });
  return user;
};

const jpg = (name = 'ishita.jpg', size = 120_000) =>
  new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

const calls = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method);

describe('the photo button', () => {
  it('reads "Add photo" for the batch\'s PM, and "Change photo" once there is one', async () => {
    stub();
    await open();
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeInTheDocument();
  });

  it('reads "Change photo" when the intern has a photo, which the avatar shows', async () => {
    stub({ profile: intern({ photoUrl }) });
    await open();
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    expect(document.querySelector('main img')).toHaveAttribute('src', photoUrl);
  });

  it.each([
    ['photos are off', { photos: false }],
    ['the intern is read-only', { profile: intern({ status: 'graduated' }) }],
    ['a mentor', { roles: ['mentor'] as [Role], detail: batch({ programManager: otherPm }) }],
    ['an archived batch', { detail: batch({ isArchived: true }) }],
  ])('is absent when %s', async (_case, options) => {
    stub(options);
    await open();
    expect(screen.queryByRole('button', { name: /photo/ })).not.toBeInTheDocument();
  });
});

describe('uploading', () => {
  it.each([
    ['a HEIC', new File(['x'], 'ishita.heic', { type: 'image/heic' })],
    ['a JPG over 5 MB', jpg('big.jpg', 5 * 1024 * 1024 + 1)],
  ])('refuses %s before uploading anything', async (_case, file) => {
    const fetchMock = stub();
    const user = await open();

    await user.upload(screen.getByLabelText('Photo file'), file);

    expect(screen.getByRole('alert')).toHaveTextContent(
      `Photo must be a JPG or PNG under 5 MB. ${file.name} wasn't uploaded.`,
    );
    expect(calls(fetchMock, 'POST')).toEqual([]);
    expect(FakeUpload.last).toBeUndefined();
  });

  it('uploads straight to the storage with progress, then saves and shows the photo', async () => {
    const fetchMock = stub();
    const user = await open();

    await user.upload(screen.getByLabelText('Photo file'), jpg());
    await waitFor(() => expect(FakeUpload.last?.body).toBeDefined());
    const upload = FakeUpload.last;
    if (!upload?.body) throw new Error('expected an upload');
    expect([upload.method, upload.url]).toEqual(['POST', ticket.uploadUrl]);
    expect(
      ['api_key', 'timestamp', 'signature', 'public_id', 'allowed_formats'].map((key) =>
        upload.body?.get(key),
      ),
    ).toEqual(['key-1', '1792836000', 'sig', 'portal/interns/i/p2', 'jpg,png']);
    expect(upload.body.get('file')).toBeInstanceOf(File);

    upload.progress(64, 100);

    expect(await screen.findByText('Uploading ishita.jpg · 64%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uploading ishita.jpg' })).toHaveValue(64);
    expect(screen.queryByRole('button', { name: /photo/ })).not.toBeInTheDocument();

    upload.answer({
      public_id: 'portal/interns/i/p2',
      version: 1_792_836_001,
      signature: 'cs',
      bytes: 120_000,
      format: 'jpg',
    });

    await waitFor(() =>
      expect(document.querySelector('main img')).toHaveAttribute('src', photoUrl),
    );
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    const [, init] = calls(fetchMock, 'PUT')[0] ?? [];
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
      publicId: 'portal/interns/i/p2',
      version: 1_792_836_001,
      signature: 'cs',
      bytes: 120_000,
    });
  });

  it('cancels mid-upload without saving', async () => {
    const fetchMock = stub();
    const user = await open();
    await user.upload(screen.getByLabelText('Photo file'), jpg());
    await waitFor(() => expect(FakeUpload.last?.body).toBeDefined());

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(FakeUpload.last?.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: 'Add photo' })).toBeInTheDocument();
    expect(calls(fetchMock, 'PUT')).toEqual([]);
  });

  it("shows the API's refusal when saving fails", async () => {
    stub({ saved: problem(400, 'validation_failed') });
    const user = await open();
    await user.upload(screen.getByLabelText('Photo file'), jpg());
    await waitFor(() => expect(FakeUpload.last?.body).toBeDefined());

    FakeUpload.last?.answer({ public_id: 'x', version: 1, signature: 's', bytes: 1 });

    expect(await screen.findByRole('alert')).toHaveTextContent(/^ishita\.jpg wasn't uploaded\./);
  });
});

describe('avatars', () => {
  it('fall back to initials when the photo fails to load', async () => {
    stub({ profile: intern({ photoUrl }) });
    await open();
    const image = document.querySelector('main img');
    if (!image) throw new Error('expected the photo');

    fireEvent.error(image);

    expect(document.querySelector('main img')).toBeNull();
    expect(
      within(document.querySelector('main') ?? document.body).getAllByText('IR').length,
    ).toBeGreaterThan(0);
  });
});
