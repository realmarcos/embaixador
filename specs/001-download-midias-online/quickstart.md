# Quickstart: Download de Mídias Online

## Prerequisites

- A supported Node.js LTS installed.
- A MySQL instance reachable by the backend.
- A private S3-compatible bucket and credentials with access limited to that bucket.
- yt-dlp and FFmpeg installed in the backend worker environment after their
  dependency/license approval. The worker must not load user or machine-wide
  yt-dlp configuration.
- Backend and frontend environment values configured locally; never commit
  credentials or media URLs.

## Package Checks

Run the backend's own checks:

```sh
cd backend
npm test -- --run
npm run lint
npm run build
```

Run the frontend checks:

```sh
cd frontend
yarn lint
yarn build
node --test
```

The frontend's dependency-free Node tests cover pure API/formatting helpers;
interactive component acceptance is covered in the browser scenarios below.
Do not add a frontend UI test library without explicit dependency approval.

## Database and Runtime Configuration

Configure backend variables using the project's environment loader:

| Variable | Purpose |
|---|---|
| `PORT` | Express listener port. |
| `DATABASE_URL` | MySQL connection string consumed by Prisma. |
| `JWT_SIGNING_KEY` | Secret signing key for the short-lived JWS cookie. |
| `SOURCE_URL_ENCRYPTION_KEY` | Key for encrypting the source URL needed by history re-download. |
| `FRONTEND_ORIGIN` | Exact allowed frontend origin for credentialed CORS and Origin checks. |
| `S3_ENDPOINT` | Optional S3-compatible endpoint; omit for provider-default endpoint. |
| `S3_REGION` | Object-storage region/namespace. |
| `S3_BUCKET` | Private bucket name. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Least-privilege bucket credentials. |
| `MEDIA_TEMP_DIRECTORY` | Private per-job working directory, outside web roots. |
| `YT_DLP_PATH`, `FFMPEG_PATH` | Approved executable locations. |

After installing the approved Prisma version and configuring a development
database, apply migrations with the package's Prisma migration command. Start the
backend API and its explicitly wired worker, then start the frontend using the
existing package scripts. The plan does not create deployment or environment
files.

## Browser Acceptance Scenarios

1. Register a new account, log in, and confirm the session cookie is HttpOnly;
   protected history/settings/download requests fail after logout.
2. Paste an accessible, authorized URL from each supported platform. Verify that
   the response identifies the platform and lists only available formats and
   quality/dimension options; unsupported domains and malformed URLs are rejected.
3. Choose an option and submit a download. Verify the UI receives a job ID,
   displays queued/processing/completed/failure states, and never shows raw
   extractor output or private object keys.
4. Complete a download and open its history entry. Verify the record is private
   to its owner and the file is streamed only while authenticated, owned, and
   unexpired.
5. Change retention to each allowed value (`1`, `8`, `24`, `72`, `168`, `336`,
   `720` hours). Complete a later download and verify its `expiresAt` reflects
   that choice; a subsequent settings change must not change existing records.
6. Use the test clock to expire a media object. Verify cleanup removes the
   object, leaves an `EXPIRED` history row, and denies access after expiry even
   when object deletion needs a retry.
7. Manually delete a media file and verify the row remains marked
   `MEDIA_DELETED`; separately clear one history item and all history and verify
   associated objects are also removed.
8. Request re-download from a history row while the original remains accessible.
   Verify a new job is created and the current retention preference is applied.
9. At 320 px, tablet width, and 1920 px, complete login, analyze, choose format,
   inspect history, and change settings without clipped controls or horizontal
   page scrolling. Switch between light/dark themes and reload to confirm the
   account preference persists.
10. Trigger invalid URL, unsupported platform, unavailable/private media,
    conversion failure, storage failure, and cross-account access attempts.
    Verify safe messages and no disclosure of credentials, raw URLs, provider
    output, or another account's data.

## Contract and Data References

- HTTP request/response and error shapes: [contracts/openapi.yaml](./contracts/openapi.yaml)
- Entities, ownership rules, transitions, and expiry invariants: [data-model.md](./data-model.md)
- Architecture decisions and references: [research.md](./research.md)