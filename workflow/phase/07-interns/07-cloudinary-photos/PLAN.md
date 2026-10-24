# 7.7 Cloudinary photos — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
A signed-upload endpoint, an upload widget, and the photo shown on the card and profile

## Done when
- **The API signs uploads,** so the browser uploads straight to Cloudinary. The API **checks Cloudinary's answer** before saving the photo's `public_id` (TECH_STACK: "the DB stores only `public_id`").
- **The profile has v2's Add / Change photo button and its states (A6-photo):** default, uploading with progress and Cancel, and an error.
- **The photo shows on the roster cards, the table and the profile,** with initials as the fallback.
- **Photos are off when Cloudinary isn't configured,** the way Google sign-in is: no button, and initials everywhere.
- API and web tests pass, and `pnpm check` passes. In the browser, uploading and replacing a photo works end to end against a local stand-in for Cloudinary.

## What v2 draws
- **Header:** after `@username · batch`, a "·" and a ghost `sm` button with a 15px `camera` icon: **"Add photo"** (none yet) or **"Change photo"**.
- **Uploading:** the 64px avatar dimmed with a 22px spinner over it; beside it (240px wide), "Uploading \<file\> · 64%", a 6px progress bar, and a ghost-muted `sm` **Cancel**.
- **Error:** the button again, with a 12px `--destructive` line under it: "Photo must be a JPG or PNG under 5 MB. \<file\> wasn't uploaded."
- **v2's note:** "Admins and programme managers only, hidden on read-only records. Initials are the fallback on cards, the table and the profile."

## How the upload works
1. **`POST /batches/:batchId/interns/:internId/photo-upload`** returns what the browser needs for one signed upload: the upload URL, API key, timestamp, signature, and a **new `public_id`** (`<folder>/<internId>/<random>`, so a replaced photo never shows from a cache). Only JPG and PNG are allowed, and that limit is part of the signature, so Cloudinary enforces it.
2. **The browser uploads the file to Cloudinary directly,** with progress and Cancel. The file never passes through the API.
3. **`PUT …/photo`** with Cloudinary's answer `{ publicId, version, signature }`. The API:
   - **checks Cloudinary's signature** (SHA-1 over `public_id` and `version` with the secret);
   - checks that the `public_id` is one it issued for *this* intern (the folder prefix);
   - saves it and answers with the updated profile.
4. **The previous photo is deleted from Cloudinary** (a signed `destroy`) once the new one is saved. This is best effort: a failure is logged and doesn't undo the change.
- **Display:** the API adds **`photoUrl`** (Cloudinary's delivery URL: a 128px face-centred square, with automatic format and quality) to `InternSummary` and `InternDetail`, or `null`. The web never builds Cloudinary URLs.

## Decisions needed

### (1) Who can add a photo
**DATA_MODEL §5** says admins, the batch's PM **and its mentors**. **v2** says "Admins and programme managers only".

| Option | What it means |
|---|---|
| **A. Admins and the batch's PM** *(recommended)* | As v2 draws it, and the same as adding an intern (7.3). DATA_MODEL §5 is updated to match. |
| B. Also the batch's mentors | As DATA_MODEL says. Mentors meet interns daily and could take the photos. |

**Either way:** never on a final intern or an archived batch.

### (2) The upload widget
| Option | What it means |
|---|---|
| **A. Our own button and progress** *(recommended)* | A hidden file input and an XHR upload (fetch can't report upload progress), drawn as v2's A6-photo states. **No Cloudinary script or SDK**, and the signing is done with Node's `crypto`. |
| B. Cloudinary's Upload Widget | A hosted script with its own UI. It doesn't match v2, and it loads third-party code into the app. |

### (3) Limits
**Recommended: JPG or PNG, up to 5 MB,** as v2's error says.
- **The format** is enforced by Cloudinary through the signature.
- **The size** is checked in the browser before uploading, and the API rejects an answer whose reported `bytes` exceed it. Cloudinary's signed parameters can't cap the size by themselves; an account-level limit can be added in Cloudinary.

### (4) Replaced photos
**Recommended: delete the previous photo** after the new one is saved, so old photos of interns don't linger (they're personal data). The alternative is to keep them all.

### (5) Configuration and verifying it
- **Configuration:** `CLOUDINARY_URL` (`cloudinary://<key>:<secret>@<cloud>`, Cloudinary's own format) and `CLOUDINARY_FOLDER` (default `feedback-portal/interns`). With no URL, photos are off: `GET /settings` reports `photos: false`, and the signing endpoint answers 503 `unavailable`.
- **Verifying it:**
  - **Recommended:** run the browser check against **a small local stand-in for Cloudinary's upload API** in the test setup. It signs the same way, so no real account is needed and no credentials pass through me.
  - **Your real-account check** becomes a follow-up, like the Google sign-in one: you add your Cloudinary details to `.env` and upload one photo.

## Plan

### Contracts
- **`InternSummary` and `InternDetail` gain `photoUrl`** (a URL, or `null`).
- **`SettingsResponse` gains `photos: boolean`.**
- **`PhotoUploadTicket`:** `{ uploadUrl, apiKey, timestamp, signature, publicId, allowedFormats }`.
- **`SetPhotoRequest`:** `{ publicId, version, signature, bytes }`.

### API
- **`shared/config`:** `CLOUDINARY_URL` (parsed and validated) and `CLOUDINARY_FOLDER`.
- **`intern/application/photo-storage.ts` (a port):**
  - `ticketFor(internId)`;
  - `verifyUpload({ publicId, version, signature })`;
  - `urlFor(publicId)`;
  - `remove(publicId)`.
- **`intern/infrastructure/cloudinary-photo-storage.ts`:** Cloudinary's signing rules (sorted parameters with the secret, SHA-1), its delivery URL, and `destroy` through `fetch`. The upload and API base URLs are configurable, and only tests point them elsewhere.
- **Domain:** `setPhoto(intern, { publicId, now })`, rejected on a read-only intern (`intern_read_only`).
- **Use cases:**
  - **`photoUploadTicket`:** who may (decision 1), then not archived and not final.
  - **`setPhoto`:** the same checks; then verify the signature, the prefix and the size; lock and save; afterwards remove the old photo.
- **Routes:**
  - `POST …/photo-upload` → 200 ticket;
  - `PUT …/photo` → 200 `InternDetail`;
  - 503 `unavailable` when photos are off.
- **Views:** `photoUrl` from `photoPublicId` on the list and the profile.

### Web
- **`api/interns.ts`:** `photoUploadTicket` and `setPhoto`. **`interns/upload-photo.ts`:** an XHR to the ticket's URL with progress and abort.
- **`interns/profile/photo-control.tsx`:** the header button (shown when settings say photos are on and the user may upload, per decision 1), the hidden input (`image/jpeg,image/png`), the uploading state (dimmed avatar, spinner, "Uploading \<file\> · N%", a 6px progress bar, Cancel) and the error line.
- **`ui/progress.tsx`** and **`ui/spinner.tsx`** (Kuat Progress and Spinner).
- **Avatars:** `src={intern.photoUrl}` on the card, the table row and the profile header; initials when `null` or when the image fails to load.

### Tests
- **Cloudinary adapter (unit):**
  - the signature for a known set of parameters (Cloudinary's documented example);
  - the delivery URL;
  - answer verification (accepts a right signature; rejects a wrong one or another `public_id`);
  - `destroy` sends a signed request (to a fake `fetch`).
- **Routes (Testcontainers, with a fake `PhotoStorage`):**
  - a ticket for the PM and an admin;
  - **403** for a mentor (or 200, if decision 1 is B); **404** for an outsider;
  - 409 when final or archived;
  - **`PUT` with a good answer** saves it, returns `photoUrl` and removes the old photo;
  - **a bad signature, another intern's `public_id`, or more than 5 MB → 400**, and nothing saved;
  - photos off → 503;
  - the roster includes `photoUrl`.
- **Web:**
  - the button label (Add / Change) and who sees it (none when photos are off, when final, or for a mentor under A);
  - a JPG over 5 MB or a HEIC → the error line, with nothing uploaded;
  - **uploading shows the progress and percentage** (a fake XHR), and Cancel aborts and returns to the default state;
  - success sets the photo and shows the new image;
  - a failed `PUT` shows the error;
  - avatars fall back to initials when the image fails.
- **Mutations** (on copies, restored with `cp`):
  - the signature not checked;
  - the `public_id` prefix not checked;
  - the size not checked;
  - the old photo not removed;
  - the button shown on a final intern.

  Each must fail a test.

### Out of scope
- **Removing a photo** without replacing it (v2 has no control for it).
- **Cropping** in the browser. Cloudinary's face-centred crop does it on delivery.
- **Photos in the mobile views,** and on mentors' or users' avatars (those come from Google).

### Steps
1. Config, contracts, the port and the Cloudinary adapter, with unit tests.
2. The domain, use cases and routes, with tests (a fake storage).
3. The UI pieces, the photo control and the avatars, with tests.
4. Run `pnpm check` and the mutations. Do the browser check (Compose, with the API pointed at a local Cloudinary stand-in; headless Chrome as the PM: add a photo, see it on the profile, card and table, replace it, try a too-large file and a HEIC, cancel mid-upload; as a mentor). Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- In the browser, the photo flow matches A6-photo, and the photo appears on the profile, cards and table.
- The test rows and stand-in files are deleted afterwards.
- **Follow-up for you:** one upload with your real Cloudinary account.
