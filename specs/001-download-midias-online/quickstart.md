# Quickstart: Download de Mídias Online

## Prerequisites

- Node.js `24.18.0` (the packages declare `>=24 <25`).
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
npm run test:coverage
npm run lint
npm run build
```

Run the frontend checks:

```sh
cd frontend
yarn test
yarn lint
yarn build
```

The frontend's dependency-free Node tests cover API request credentials and safe errors;
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

The development frontend listens on port `3001` so it can use the backend's
default port `3000`; configure `NEXT_PUBLIC_API_BASE_URL` only when the API is
hosted elsewhere.

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

## Security Review Status

- Public auth/download/history responses use explicit DTOs; password hashes,
   source URL ciphertext, user IDs, storage keys, cookies, and provider output are
   not returned. File reads require authentication, owner match, `READY` state,
   and `expiresAt > now`, and send `Cache-Control: private, no-store`.
- S3 objects use opaque keys, server-side encryption, and no public ACL. Temporary
   job directories are removed after processing. The only backend console output
   is the local listener address; no media URL, cookie, object key, or provider
   response is logged.
- URL validation rejects unsupported hosts, literal private IPs, and private
   addresses returned by DNS. yt-dlp HTTP requests are forced through a loopback
   egress proxy: every HTTP redirect/HTTPS CONNECT is resolved again, all DNS
   answers must be public, and the connection is pinned to a validated numeric IP.
   CONNECT is limited to port 443 and direct HTTP to port 80. A live yt-dlp
   analysis smoke test succeeded through this proxy. This prevents DNS rebinding
   between the proxy's lookup and connection; future network-capable providers
   MUST use the same egress boundary. TLS payloads are not inspected, and public
   destinations remain reachable.
- Browser acceptance on 2026-10-08 used a temporary account against the
   configured MySQL and private S3 bucket: registration/login, cookie-based
   dashboard, YouTube analysis (53 options), queue/worker completion, private
   `video/mp4` streaming with `private, no-store`, owner history, media-only
   deletion, expiry cleanup, and re-download all completed successfully.
- The session cookie was not visible through `document.cookie`; logout returned
   204 and the subsequent protected history request returned 401. The account's
   DARK theme remained active after a full page reload.
- All seven retention values were saved through the UI. A ready record kept its
   original 1-hour `expiresAt` after settings changed; a subsequent re-download
   stored an 8-hour snapshot and matching expiry in MySQL. The expired object was
   removed by the cleanup worker and stayed in history as `EXPIRED`; file access
   returned 410. A manually removed file stayed in history as `MEDIA_DELETED`.
- The temporary histories, S3 media objects, accounts, and sessions created by
   the acceptance run were deleted/revoked. No test account or media was retained.
- The initial configured `YT_DLP_PATH` did not exist; yt-dlp 2026.8.19 was
   installed with `uv tool` in the user tool directory and supplied to the
   backend process as a one-session override. No repository env file was changed.
- The latest backend unit report is 95.86% statements, 91.96% branches, 97.14%
   functions, and 96.69% lines across 1,136 statements; no source files are
   excluded from the report. The remaining uncovered paths are limited to native
   runtime failure callbacks that cannot be triggered deterministically without
   stubbing OS internals: a failed `crypto.scrypt` callback, socket/listener bind
   failures and client disconnects in the egress proxy, and process/ filesystem
   failures after the tested `execFile` adapters have spawned. Success paths use
   temporary executables; proxy denial paths are tested with loopback clients;
   the real yt-dlp process was smoke-tested through the proxy. This is the narrow
   exception for native OS-boundary failures; all business validation and state
   transitions remain unit-tested.
- Prisma/S3 integration specs are opt-in through
   `RUN_PROVIDER_INTEGRATION=true`, `TEST_DATABASE_URL`, and `S3_TEST_BUCKET`.
   They were collected and skipped because no dedicated test database/bucket
   variables were present. T088's browser flow did use the configured primary
   development database and private bucket, and cleaned its temporary resources.