# Research: Download de Mídias Online

## Decisions

### Existing package boundaries and backend layering

- **Decision**: Keep `backend/` and `frontend/` as separate packages. Backend use cases depend on repository/provider interfaces; create in-memory implementations for service tests, then Prisma and external-provider implementations. Wire dependencies in explicit factories and the application composition root.
- **Rationale**: `backend/src/repositories/users/index.ts` defines repository contracts, `backend/src/services/users/create-user-service.ts` injects the repository, and `backend/src/services/users/tests/create-user-service.spec.ts` uses Vitest with an in-memory repository. `backend/src/index.ts` is currently a minimal Express entrypoint, so startup wiring belongs there rather than in import-time side effects.
- **Alternatives considered**: Direct Prisma access from controllers was rejected because it bypasses the established service/repository boundary. A new shared workspace package was rejected as unnecessary for a two-package monorepo.

### MySQL persistence with Prisma

- **Decision**: Add Prisma ORM with the MySQL provider, migrations, and repositories implementing the existing contracts. Keep media bytes in object storage, not database columns.
- **Rationale**: MySQL and Prisma were explicit user choices. Prisma's current MySQL guide documents the `mysql` datasource and migration support for self-hosted MySQL/MariaDB. The repository currently has no Prisma dependency in `backend/package.json`; this is new setup, not an existing integration.
- **Alternatives considered**: Retaining in-memory storage as the production store was rejected because accounts, settings, job state, and history must survive restarts. Storing video blobs in MySQL was rejected because large media files are object-storage data.
- **Reference**: [Prisma ORM: MySQL](https://www.prisma.io/docs/orm/overview/databases/mysql).

### Private S3-compatible object storage

- **Decision**: Use a private S3-compatible bucket behind a `MediaStorageProvider` contract. Use opaque random object keys, server-side encryption at rest, no public ACLs, and an authenticated backend stream endpoint for file access. The exact object-storage vendor remains provider-neutral in this plan.
- **Rationale**: The user selected private object storage. Keeping the bucket private and streaming through an ownership-checked backend endpoint avoids exposing bearer-style presigned URLs in browser history or application logs. The provider interface keeps the app independent from a vendor.
- **Alternatives considered**: Public objects and long-lived signed URLs were rejected because they weaken confidentiality. A local filesystem was rejected after the user selected option B.
- **Implementation note**: A provider SDK is a direct dependency candidate and must be approved before installation if not already covered by the user's S3 choice.

### Asynchronous, database-backed download jobs

- **Decision**: Persist each download request as a job/history record in MySQL. A single explicitly started backend worker claims queued rows, runs extraction/conversion, uploads the completed file, then records the user's current retention preference and `expiresAt`. The worker also periodically removes expired objects and retains the history row.
- **Rationale**: Downloads/conversions may outlast an HTTP request. A durable row allows status polling, recovery after restart, and an audit/history record without adding a broker. The selected initial scope has one worker and no volume target.
- **Alternatives considered**: Synchronous HTTP downloads were rejected because they hold requests open during remote processing. Redis/BullMQ or another broker was rejected for the initial scope because no scale requirement justifies the dependency.
- **Operational rule**: Claim work idempotently, make object deletion safe to retry, deny file access as soon as `expiresAt` has passed, and retain failed-deletion state for retry. Start the worker and cleanup loop explicitly from the composition root.

### Media extraction and conversion

- **Decision**: Use yt-dlp as an isolated provider executable for supported source sites, and FFmpeg for merge/remux/re-encode operations when the selected output requires them. Invoke processes with argument arrays (never a shell command), strict time/resource limits, private temporary directories, and provider fakes in unit tests. Parse machine-readable output only; do not parse ordinary human-readable stdout or persist full extractor JSON.
- **Rationale**: yt-dlp documents support for many sites, format listing/selection, JSON output, and use from any language through its CLI. Its documentation recommends stable output options such as `--dump-single-json`/`--print` instead of parsing normal stdout. FFmpeg is a documented requirement for merging separate audio/video streams and for post-processing/conversion.
- **Alternatives considered**: Per-platform custom download implementations were rejected for the first pass because they duplicate changing extraction behavior. A Node wrapper alone was rejected as it still depends on an executable and does not eliminate operational/licensing requirements.
- **Constraints**: Support only YouTube, Instagram, and Facebook URLs allowed by the feature; process content the user may access and is authorized to download; never bypass access controls. Pin and monitor the downloader version, check bundled component licenses, and do not enable cookie import, geo-bypass, unsafe extensions, remote plugins, or arbitrary extractor configuration.
- **References**: [yt-dlp embedding and CLI guidance](https://github.com/yt-dlp/yt-dlp#embedding-yt-dlp), [yt-dlp format selection](https://github.com/yt-dlp/yt-dlp#format-selection), [yt-dlp dependencies](https://github.com/yt-dlp/yt-dlp#dependencies).

### Signed JWT cookie

- **Decision**: Use a signed JWS access token in a Secure, HttpOnly, SameSite cookie over HTTPS. Keep claims minimal (`sub`, `iat`, `exp`); never put credentials, media URLs, or private metadata in the token. Validate the signature and expiry on every protected request, validate `Origin` for unsafe methods, and restrict credentialed CORS to the configured frontend origin.
- **Rationale**: The user chose option A. RFC 7519 permits JWT claims to be represented in either JWS (signed/integrity-protected) or JWE (encrypted); the user confirmed signed JWS, so claims are not treated as confidential. RFC 7519 also calls for protecting privacy-sensitive claims from disclosure.
- **Alternatives considered**: JWE was rejected because the user chose JWS and the token needs no secret claims. Browser local storage was rejected because it exposes bearer tokens to script access. Implementing JOSE serialization and verification manually was rejected; use a maintained JOSE library only after dependency approval.
- **References**: [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519), [RFC 7516: JSON Web Encryption](https://www.rfc-editor.org/rfc/rfc7516).

### Password verification

- **Decision**: Hash passwords with Node.js built-in `crypto.scrypt`, using a unique random salt per password and constant-time comparison during verification. Store only the encoded algorithm parameters, salt, and derived hash; never store or log the submitted password.
- **Rationale**: The current user domain already has a `passwordHash` field, while the existing in-memory create path does not produce a usable hash. Node's built-in implementation avoids adding a password-hashing package while replacing that unsafe placeholder behavior.
- **Alternatives considered**: Plaintext or reversible encryption was rejected. Adding bcrypt/argon2 would add a dependency requiring separate approval; revisit only if deployment benchmarking or policy requires it.

### shadcn/ui and visual system

- **Decision**: Initialize shadcn/ui in the existing `frontend/` Next App Router app and add only needed components. Use the current `shadcn` CLI conventions, Tailwind 4 CSS variables, semantic light/dark tokens, and restrained Instagram/Facebook/YouTube brand accents for platform identification.
- **Brand tokens**: Instagram `#E1306C`, Facebook `#1877F2`, and YouTube `#FF0000`; use them as platform-specific accents rather than making the entire interface a single-brand color theme.
- **Rationale**: The frontend already uses Next.js 16, React 19, Tailwind 4, and a root `app/` directory. Official shadcn documentation supports initialization in an existing Next.js project; there is no need to recreate the app or create a monorepo UI package.
- **Alternatives considered**: Replacing the existing Next project or introducing a separate design-system package was rejected as unrelated structure. Hand-written controls are reserved for visual behavior not provided by selected shadcn components.
- **Reference**: [shadcn/ui: Next.js installation](https://ui.shadcn.com/docs/installation/next).

### Testing and new dependencies

- **Decision**: Reuse Vitest and in-memory fixtures for backend unit tests. For frontend package checks, use dependency-free Node tests for pure helpers and run lint/build plus documented browser acceptance flows; do not install a UI test library without explicit approval.
- **Rationale**: Vitest is already configured in backend, but the frontend has no test script or DOM test dependencies. The constitution forbids unapproved third-party dependencies and requires per-package quality gates.
- **Alternatives considered**: Sharing backend `node_modules` with frontend tests was rejected because it creates hidden package coupling. Adding Vitest/Testing Library/jsdom without approval was rejected.

## Dependency Approval Gate

Before implementation, record the necessity and license, then obtain approval for any new package not clearly covered by the user's selections. Expected candidates include Prisma CLI/client, shadcn-generated component dependencies, an S3 SDK, a JOSE/JWS library, and any object-storage or media executables. yt-dlp is conditionally authorized for source downloading; FFmpeg is required for some conversions but still needs its binary/license recorded. Do not add a frontend UI-test library in this plan.