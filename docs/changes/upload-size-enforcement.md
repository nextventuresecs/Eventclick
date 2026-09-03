# The upload size limit is validated and then thrown away

**Status:** shipped
**Touches:** `packages/server/src/services/storage.service.ts`, `packages/server/src/controllers/attendance.controller.ts`, `packages/server/src/controllers/settings.controller.ts`, `packages/server/src/services/activity.service.ts`, `packages/shared/src/index.ts`
**Ships with:** `fix/upload-size-enforcement` — closes #87

---

## 1. What the code does today

Every upload starts with the client asking for a pre-signed URL and declaring
what it intends to upload. The schema checks that declaration:

```ts
// packages/shared/src/index.ts
sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
```

The controller then builds a key and calls the presigner — **without the
size**:

```ts
const { contentType } = req.body as PhotoUploadRequestInput;
const key = buildPhotoKey(roomId, contentType);
const { uploadUrl, expiresIn } = await createPresignedPut(key, contentType);
```

and the presigner signs a `PutObjectCommand` that never mentions length:

```ts
const cmd = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, CacheControl: ... });
const uploadUrl = await getSignedUrl(s3Presign, cmd, {
  expiresIn,
  signableHeaders: new Set(["host", "content-type"]),
});
```

**A pre-signed PUT cannot cap object size on its own.** The signature covers
the headers listed in `signableHeaders`; anything absent is unconstrained. So
the issued URL accepts a body of any length, and the 5 MB check is
client-honesty only — a caller who edits `sizeBytes` in the request, or who
simply PUTs a larger body to the returned URL, stores whatever they like.

This is worse than having no validation, because the schema reads as
enforcement. Someone reviewing this code sees a limit and moves on.

The file-type allowlist, by contrast, **is** enforced: `content-type` is in
`signableHeaders`, so the object store rejects a mismatched type. The
mechanism to fix the size problem was already in the file, one line away.

There is a second, smaller problem: `5 * 1024 * 1024` was written out in three
separate schemas plus a fourth constant, `MAX_BRANDING_UPLOAD_BYTES`. "The
limit" was four numbers that happened to agree.

## 2. What I am changing, and why

**Sign `content-length`.**

```ts
const cmd = new PutObjectCommand({ ..., ContentLength: sizeBytes });

const uploadUrl = await getSignedUrl(s3Presign, cmd, {
  expiresIn,
  signableHeaders: new Set(["host", "content-type", "content-length"]),
});
```

SigV4 covers every header named in `signableHeaders`, so S3 — and MinIO in
development — rejects any upload whose actual length differs from the one
signed into the URL. The declared size is capped by the schema and again
inside the presigner, so the stored object cannot exceed the limit.

**Why not the alternatives the issue offers.** A pre-signed POST with a
`content-length-range` condition enforces the same thing, but changes the
upload from a `PUT` to a multipart form `POST` — a client-visible contract
change, which the acceptance criteria rule out. Checking the object's size
after upload leaves oversized objects in the bucket for the window before the
check, and needs a cleanup path for uploads whose record is never persisted.
Signing the header costs one line and rejects the request at the object store,
before any bytes are stored.

**A guard inside the presigner as well as in the schema.** Every current caller
validates with zod first; the presigner now also refuses a size above
`MAX_UPLOAD_BYTES`, so a future caller that forgets cannot mint an unlimited
URL.

**One limit value.** `MAX_UPLOAD_BYTES` in shared is now the only definition;
the three schemas and `MAX_BRANDING_UPLOAD_BYTES` all derive from it. The old
name is kept because the client imports it.

**No client change was needed, and that was worth verifying rather than
assuming.** All three upload flows declare the size of the exact blob they then
upload: `Attendance.tsx` and `RoomLive.tsx` compress *before* presigning and
measure the compressed blob, and `Profile.tsx` uploads the same `File` it
measured. Browsers also set `Content-Length` themselves from the body — it is a
forbidden header, so a page cannot set it to something else — which means it
matches the signed value exactly.

## 3. What this affects

**A mismatch between declared and actual size is now a hard failure at the
object store**, surfacing to the client as a failed upload. That is the point,
but it makes the "declare then upload the same blob" invariant load-bearing. If
a future flow ever compresses, re-encodes, or strips EXIF *after* presigning,
uploads break — and they break at S3 with a signature error, which reads as a
credentials problem rather than a size problem. The doc comment on
`createPresignedPut` says so.

**The offline sync queue replays the same stored blob**, so its uploads carry
the length that was declared when the ticket was issued. Worth watching after
deploy, since that path defers the upload well past the presign.

**Nothing changes for uploads within the limit.** Same endpoint, same method,
same headers from the client's point of view.

**How we would know it broke.** Upload a photo through attendance, an activity
photo, an org logo and an avatar — all four call sites — and confirm each
still works. Then try a >5 MB file: it should fail rather than store. The
oversized case is the one that could not previously be tested, because it
succeeded.

## 4. What to learn from this

**Validation is not enforcement unless the thing being validated is what the
enforcement mechanism sees.** Here the server checked a number in a JSON body
and then issued a credential that did not reference it. The check was real; it
just governed nothing. When a limit exists, trace it all the way to the
component that would reject a violation, and ask what that component was
actually told.

**A pre-signed URL is a capability, and its scope is exactly what was signed.**
Everything not in the signature is unconstrained: length, storage class,
metadata, ACL. The habit worth keeping is to read `signableHeaders` as the
complete list of what the holder cannot change — and to notice, as here, that
one of the constraints you believed in is missing from it.

**When the same magic number appears in more than one place, they are not one
limit — they are several that currently agree.** Deriving them from a single
export costs nothing and removes an entire class of "we changed the limit but
missed one" bug. The tell is a literal like `5 * 1024 * 1024` appearing more
than once in a grep.
