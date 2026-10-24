# 7.7 Cloudinary photos — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/shared/config/config.ts` (+ test) | **`CLOUDINARY_URL`** (Cloudinary's own `cloudinary://key:secret@cloud`, validated; errors name only the variable) and **`CLOUDINARY_FOLDER`** (default `feedback-portal/interns`). **`CLOUDINARY_API_BASE_URL` / `CLOUDINARY_DELIVERY_BASE_URL`** default to Cloudinary's hosts; they're only for tests and the stand-in. `config.photos` is `null` without a URL. |
| `packages/contracts/src/intern.ts`, `settings.ts` (+ tests) | **`photoUrl`** on `InternSummary` (and so `InternDetail`); **`photos`** on `SettingsResponse`; **`PhotoUploadTicket`**, **`SetPhotoRequest`**, `photoFormats` (jpg, png) and `maxPhotoBytes` (5 MB). |
| `intern/application/photo-storage.ts` | **The `PhotoStorage` port:** `ticketFor`, `isGenuineUpload`, `urlFor` and `remove`. |
| `intern/infrastructure/cloudinary-photo-storage.ts` (+ test) | **Cloudinary's rules with Node's `crypto`** (no SDK):<br>• `signParams` (sorted `key=value&…` with the secret, SHA-1), **checked against Cloudinary's documented example**;<br>• tickets with a new `public_id` (`<folder>/<internId>/<uuid>`) and `allowed_formats=jpg,png`, both signed;<br>• **answer verification:** the `public_id` + `version` signature (constant-time compare) **and** this intern's prefix;<br>• the delivery URL (`c_fill,g_face,w_128,h_128,f_auto,q_auto`);<br>• a signed `destroy` (with `invalidate`). |
| `intern/domain/intern.ts` | `setPhoto`, refused once read-only. |
| `intern/application/manage-interns.ts` | **`photoUploadTicket`** and **`setInternPhoto`.** Both: photos off → 503; the batch's managers only (decision 1); not archived; the intern of that batch, **locked**; not read-only. Saving then checks the reported size (≤ 5 MB) and **that the answer is genuine and for this intern**, saves, and reads back. **Only after the commit** does it delete the replaced photo (best effort; a failure is reported to the route, which logs a warning). |
| `intern/http/interns.routes.ts`, `intern-views.ts`; `shared/http/settings.routes.ts`; `main.ts`, `test/app-deps.ts` | **`POST …/photo-upload`** and **`PUT …/photo`.** Views turn `photoPublicId` into `photoUrl` through the storage. `GET /settings` reports `photos`. `main.ts` wires the Cloudinary storage when configured. |
| `apps/web/src/interns/upload-photo.ts` | **The XHR upload** straight to the ticket's URL (`fetch` can't report upload progress): progress, abort, and Cloudinary's answer parsed (`public_id`, `version`, `signature`, `bytes`). |
| `interns/profile/photo-control.tsx`, `pages/intern-page.tsx` | **A6-photo:**<br>• the ghost `sm` **Add photo / Change photo** with a 15px camera, over a hidden JPG/PNG input;<br>• **the type and size check before anything is sent**;<br>• uploading: the avatar at 40% with a 22px spinner, and a 240px column with "Uploading \<file\> · N%", a 6px bar and a ghost-muted Cancel;<br>• v2's error line.<br>Shown when settings say photos are on, the user manages the batch, and the intern isn't final. **On success** it shows the API's answer and refreshes the roster (exact key). |
| `ui/progress.tsx`, `ui/spinner.tsx`, `ui/avatar.tsx` | Kuat Progress (a native `progress`) and Spinner. **Avatar falls back to initials** when an image fails to load. Cards, table rows and the profile pass `photoUrl`. |
| `apps/api/.env.example`, `README.md`, `DATA_MODEL.md`, `design/README.md` | How to turn photos on, the endpoints, **DATA_MODEL §5's photo row now admins and the PM** (decision 1), and **"Photos (A6-photo) as built in 7.7"**. |

## How to verify
```sh
pnpm check     # contracts 68 + web 231 + api 508
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 68 (+1) + 231 (+12) + 508 (+14). Format and lint clean, with no suppressions. |
| Config (3) | Off without a URL. The URL parsed, including an encoded secret, with the defaults. **A malformed URL or folder** fails naming only the variables, never the value. |
| Cloudinary adapter (5) | **Cloudinary's documented signature example** (`bfd09f95…`). A ticket's fields and signature, with a new `public_id` each time. **Answers:** genuine accepted; the wrong version, a forged signature, another intern, or outside the folder rejected. The delivery URL. A signed `destroy` (`invalidate`, `public_id`, `timestamp`, `api_key`, `signature`), and a failure reported. |
| Routes (6, Testcontainers, with the real Cloudinary signing and a fake `fetch`) | **A ticket** signed for this intern. **Saving a genuine answer** returns `photoUrl` on the profile and the roster, and **deletes the replaced photo**. **A forged signature, another intern's `public_id`, or more than 5 MB → 400** (`publicId`, `publicId`, `bytes`), with nothing saved and nothing deleted. **Admin 200, PM 200, mentor 403, a PM elsewhere 404.** A graduated intern → 409 `intern_read_only`; archived → 409 `batch_archived`. **Photos off → 503**, and `/settings` reports `photos: false` / `true`. |
| Web (12, with a fake XHR) | "Add photo" vs "Change photo" (with the avatar's image). **No button** when photos are off, for a read-only intern, a mentor, or an archived batch. **A HEIC and a JPG over 5 MB** are refused with v2's line, and nothing is requested. **The upload** goes to the ticket's URL with `api_key`, `timestamp`, `signature`, `public_id`, `allowed_formats` and the file; **64% shows** "Uploading ishita.jpg · 64%" with the bar at 64; the answer is `PUT` and the new photo shows. **Cancel** aborts with nothing saved. A refused save shows "ishita.jpg wasn't uploaded. …". **A broken image falls back to initials.** |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **5, all caught:**<br>• the signature not checked (adapter and routes);<br>• the prefix not checked (adapter and routes);<br>• the size not checked;<br>• the replaced photo not deleted;<br>• the button shown on a read-only intern. |
| **Browser** (headless Chrome at 1440, against **a local stand-in for Cloudinary** that signs and verifies the same way; the API and web run locally with the stand-in's settings given on the command line, which take precedence over `apps/api/.env`, so **your Cloudinary account was never contacted**) | **The button** is 32px, padding 0 12px, gap 6, EE Blue, with a 15px icon: "@ishita.rao · Check Batch Main · Add photo". **big.jpg (over 5 MB) and photo.heic** were refused with v2's line (12px `--destructive`), and **the stand-in received nothing**. **teal.png:** stored, and the profile showed it (64px, image loaded), with "Change photo". **coral.png:** stored, the profile switched to it, and **the stand-in recorded a signed destroy of the teal photo**. **A 2.4 MB upload with throttled upload speed:** "Uploading noise.png · 22%", the bar at 22, the avatar at 40% with the spinner, a 240px column with 6px gaps and a 6px bar. **Cancel** aborted it: the stand-in logged the abort, nothing was saved, and the coral photo stayed. **The roster card** showed the photo. **As a mentor:** the photo, and no button. |
| Clean-up | Test users, sessions, the batch, intern and events deleted. The trigger was bypassed only inside the cleanup transaction, and is still enabled. Only your account (and its own session) remains. The stand-in, local API and Vite stopped; the Compose `api` and `web` containers restarted; Chrome stopped; tokens, images and screenshots removed. |

## Decisions & trade-offs
- **All five decisions as recommended:** admins and the PM (DATA_MODEL updated); our own control with no Cloudinary script or SDK; JPG/PNG up to 5 MB; replaced photos deleted; the stand-in for verification.
- **The 5 MB limit is a guard, not a guarantee.** Cloudinary's signed answer covers `public_id` and `version`, but not `bytes`, so the size the API checks is the one the browser reports. The format is enforced by Cloudinary through the signed `allowed_formats`. A hard size cap can be set in your Cloudinary account (upload limits).
- **A new `public_id` per upload** means a replaced photo never shows from a cache, and the old one is deleted (with CDN invalidation) after the change is committed.
- **Your Compose API now has photos on,** since it reads `apps/api/.env`, which has your `CLOUDINARY_URL`. Nothing was uploaded to your account during this task.

## Deviations from plan
- **The browser check ran the API and web locally (`pnpm dev`-style), not in Compose,** so the stand-in's settings could override your real ones without touching `apps/api/.env`.
- **`Progress` is a native `progress` element** (the linter prefers it to `role="progressbar"`), styled as Kuat Progress.

## Not done / follow-ups
- **Your real-account check:** with `CLOUDINARY_URL` in `apps/api/.env`, add a photo to an intern and check it shows. You could also add an upload size limit in Cloudinary's settings.
- **Removing a photo** without replacing it (v2 has no control for it), and photos in the mobile views.
