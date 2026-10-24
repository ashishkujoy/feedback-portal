import { describe, expect, it, vi } from 'vitest';
import type { PhotosConfig } from '../../../shared/config/config.ts';
import { InternId } from '../domain/intern-id.ts';
import { createCloudinaryPhotoStorage, signParams } from './cloudinary-photo-storage.ts';

const config: PhotosConfig = {
  cloudName: 'demo',
  apiKey: 'key-1',
  apiSecret: 'abcd',
  folder: 'portal/interns',
  apiBaseUrl: 'https://api.cloudinary.com',
  deliveryBaseUrl: 'https://res.cloudinary.com',
};
const internId = InternId.parse('01890a5d-ac96-774b-bcce-b302099a8057');
const otherId = InternId.parse('01890a5d-ac96-774b-bcce-b302099a8058');
const now = new Date('2027-01-11T09:00:00.000Z');

describe('signParams', () => {
  it("matches Cloudinary's documented example", () => {
    expect(
      signParams(
        {
          timestamp: 1_315_060_510,
          public_id: 'sample_image',
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
});

describe('the Cloudinary photo storage', () => {
  const storage = createCloudinaryPhotoStorage(config);

  it('issues a signed ticket for a new photo under the intern', () => {
    const ticket = storage.ticketFor(internId, now);

    expect(ticket).toMatchObject({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
      apiKey: 'key-1',
      timestamp: 1_799_658_000,
      allowedFormats: 'jpg,png',
    });
    expect(ticket.publicId).toMatch(new RegExp(`^portal/interns/${internId}/[0-9a-f-]{36}$`));
    expect(ticket.signature).toBe(
      signParams(
        { allowed_formats: 'jpg,png', public_id: ticket.publicId, timestamp: ticket.timestamp },
        'abcd',
      ),
    );
    expect(storage.ticketFor(internId, now).publicId).not.toBe(ticket.publicId);
  });

  it("accepts only Cloudinary's own answer about this intern's photo", () => {
    const publicId = storage.ticketFor(internId, now).publicId;
    const signature = signParams({ public_id: publicId, version: 1_799_658_001 }, 'abcd');

    expect(storage.isGenuineUpload(internId, { publicId, version: 1_799_658_001, signature })).toBe(
      true,
    );
    // Wrong version, a forged signature, another intern, or outside the folder.
    expect(storage.isGenuineUpload(internId, { publicId, version: 2, signature })).toBe(false);
    expect(
      storage.isGenuineUpload(internId, { publicId, version: 1_799_658_001, signature: 'x' }),
    ).toBe(false);
    expect(storage.isGenuineUpload(otherId, { publicId, version: 1_799_658_001, signature })).toBe(
      false,
    );
    const outside = 'elsewhere/photo';
    expect(
      storage.isGenuineUpload(internId, {
        publicId: outside,
        version: 1,
        signature: signParams({ public_id: outside, version: 1 }, 'abcd'),
      }),
    ).toBe(false);
  });

  it('builds a 128px face-centred delivery URL', () => {
    expect(storage.urlFor('portal/interns/i/p')).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_face,w_128,h_128,f_auto,q_auto/portal/interns/i/p',
    );
  });

  it('deletes with a signed request, and reports a failure', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
    await createCloudinaryPhotoStorage(config, fetchFn).remove('portal/interns/i/p', now);

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.cloudinary.com/v1_1/demo/image/destroy');
    const body = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : undefined);
    expect(Object.fromEntries(body)).toEqual({
      invalidate: 'true',
      public_id: 'portal/interns/i/p',
      timestamp: '1799658000',
      api_key: 'key-1',
      signature: signParams(
        { invalidate: 'true', public_id: 'portal/interns/i/p', timestamp: 1_799_658_000 },
        'abcd',
      ),
    });

    const failing = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 500 })));
    await expect(
      createCloudinaryPhotoStorage(config, failing).remove('portal/interns/i/p', now),
    ).rejects.toThrow('Cloudinary destroy failed with 500');
  });
});
