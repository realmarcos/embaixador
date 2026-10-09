---
description: "Task list for Download de Mídias Online"
---

# Tasks: Download de Mídias Online

**Input**: Design documents from `/specs/001-download-midias-online/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`

**Tests**: Backend unit tests are included because the user explicitly requested TDD and near-complete backend unit coverage. Write each service test before its in-memory and production implementation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and validation of each story after its dependencies are available.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Task can run in parallel with other marked tasks because it edits different files and has no incomplete-task dependency.
- **[Story]**: User-story label for story-phase tasks only: `[US1]`, `[US2]`, or `[US3]`.
- Every task includes the concrete file path(s) to create or update.

## Phase 1: Setup

**Purpose**: Resolve explicit dependency approvals and initialize the selected package tooling.

- [X] T001 Review and record necessity, license, and explicit user approval for dependencies/executables in `specs/001-download-midias-online/research.md`; FFmpeg distribution remains conditional on exact codec-license verification.
- [X] T002 [P] Pin the proposed Node.js 24 LTS runtime in the repository-root `.nvmrc` and add matching `engines.node` constraints to `backend/package.json` and `frontend/package.json`.
- [X] T003 [P] Add the user-authorized Prisma CLI/client and MySQL configuration scripts to `backend/package.json`, preserving the existing npm/Vitest scripts.
- [X] T004 [P] Initialize shadcn/ui in the existing Next App Router package and record its component configuration in `frontend/components.json` and class-name utility in `frontend/lib/utils.ts`.
- [X] T005 [P] Define semantic light/dark and platform accent CSS variables in `frontend/app/globals.css`, using Instagram `#E1306C`, Facebook `#1877F2`, and YouTube `#FF0000` only as platform accents.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared persistence, environment, HTTP, and security boundaries before implementing any story.

**Checkpoint**: All tasks in this phase must complete before user-story work begins.

- [X] T006 Define Prisma `Account` and `Download` models in `backend/prisma/schema.prisma`; preserve these constraints verbatim: Account `name` required, normalized unique `email`, required `passwordHash` only, `themePreference` `LIGHT|DARK` default `LIGHT`, `retentionHours` one of `1|8|24|72|168|336|720` default `1`; Download owner required, platform `YOUTUBE|INSTAGRAM|FACEBOOK`, state `QUEUED|PROCESSING|READY|FAILED|MEDIA_DELETED|EXPIRED|DELETE_FAILED`, nullable storage/metadata/completion/expiry fields, and the indexes and encrypted source-URL fields in `data-model.md`.
- [X] T007 Create and verify the initial MySQL migration under `backend/prisma/migrations/` for the Account and Download schema in `backend/prisma/schema.prisma`.
- [X] T008 [P] Add pure validated environment loading in `backend/src/env/index.ts`, call dotenv explicitly from `backend/src/index.ts`, document all required keys in `backend/.env.example`, and cover defaults, port bounds, and production-secret errors in `backend/src/env/tests/index.spec.ts` without logging values.
- [X] T009 Create the explicit Prisma client factory in `backend/src/repositories/implementations/prisma/create-prisma-client.ts`; pass the client into repositories instead of creating clients at import time.
- [X] T010 [P] Write failing error serialization tests in `backend/src/http/middlewares/tests/error-handler-middleware.spec.ts`, then add centralized HTTP error serialization in `backend/src/http/middlewares/error-handler-middleware.ts` and update `backend/src/errors/app-errors.ts` so public responses contain only safe `code`, `message`, and request ID, never `details`, stack traces, secrets, source URLs, or provider output.
- [X] T011 [P] Write middleware tests in `backend/src/http/middlewares/tests/authenticate-middleware.spec.ts`, then add injected cookie-session authentication and exact-origin/credentialed-CORS middleware in `backend/src/http/middlewares/authenticate-middleware.ts` and `backend/src/http/middlewares/cors-middleware.ts`, storing the verified owner in typed response locals and using the signed JWS cookie selected in `research.md`.
- [X] T012 Create `backend/src/http/routes/index.ts` as an explicit API router factory and mount JSON parsing, exact-origin CORS, API routes, and the error handler from `backend/src/index.ts`; T045 wires the concrete worker when it exists.

---

## Phase 3: User Story 1 - Acessar e baixar uma mídia (Priority: P1) 🎯 MVP

**Goal**: A user can register, authenticate, analyze an authorized supported link, choose an available format, download media, and receive a private history record.

**Independent Test**: Register and log in, analyze one accessible and authorized URL per supported platform, choose an offered option, complete a download, and confirm the owner can retrieve it while anonymous and cross-account access are denied.

### Repository, Authentication, and TDD

- [X] T013 [US1] Extend account domain types in `backend/src/repositories/users/types.ts` with public Account fields and creation/update inputs; never include `passwordHash` in public response types.
- [X] T014 [US1] Extend the account repository contract in `backend/src/repositories/users/index.ts` with normalized-email lookup and safe account creation/update operations required by registration and login.
- [X] T015 [P] [US1] Write failing Vitest service tests in `backend/src/services/auth/tests/register-user-service.spec.ts` and `backend/src/services/auth/tests/login-user-service.spec.ts` for valid account creation, duplicate normalized email, minimum/maximum credential bounds, invalid credentials, generic safe errors, and no password/hash leakage.
- [X] T016 [US1] Implement injected registration and login use cases in `backend/src/services/auth/register-user-service.ts` and `backend/src/services/auth/login-user-service.ts`; keep password hashing and token signing as explicit dependencies.
- [X] T017 [US1] Implement account lookup/create/update behavior in `backend/src/repositories/implementations/in-memory/users/index.ts` and add a deterministic fake password hasher in `backend/src/services/auth/tests/fakes/fake-password-hasher.ts` for isolated service tests.
- [X] T018 [US1] Complete and pass the registration/login service tests in `backend/src/services/auth/tests/register-user-service.spec.ts` and `backend/src/services/auth/tests/login-user-service.spec.ts` against the in-memory repository and fake hasher.
- [X] T019 [P] [US1] Write failing password-hasher tests in `backend/src/services/auth/tests/scrypt-password-hasher.spec.ts` for unique salts, successful verification, wrong-password rejection, malformed stored hash rejection, and constant-time comparison contract.
- [X] T020 [US1] Implement the built-in `crypto.scrypt` password hasher in `backend/src/services/auth/scrypt-password-hasher.ts`; persist only encoded parameters, random salt, and derived hash.
- [X] T021 [US1] Implement the production Prisma account repository in `backend/src/repositories/implementations/prisma/users/index.ts`, mapping Prisma records to existing domain types without exposing Prisma types to services.
- [X] T022 [US1] Wire Prisma account repository, `crypto.scrypt`, and the approved `jose` signer/verifier in `backend/src/factories/auth/create-auth-service-factory.ts`; verify signer/expiry/key constraints in `backend/src/factories/auth/tests/create-auth-service-factory.spec.ts`; issue HS256 tokens with `iss=embaixador`, `aud=embaixador-web`, `sub=userId`, `iat`, and `exp` 15 minutes after issue, requiring a signing key of at least 32 bytes.
- [X] T023 [P] [US1] Write failing HTTP contract tests in `backend/src/http/tests/auth.routes.spec.ts` for registration, login cookie flags, logout, current-account response, validation, and unauthenticated behavior defined by `contracts/openapi.yaml`.
- [X] T024 [US1] Implement authentication controllers and routes in `backend/src/http/controllers/auth-controller.ts` and `backend/src/http/routes/auth-routes.ts`; set/clear the signed token only in the cookie and return no token or password fields in JSON.

### Media Analysis and TDD

- [X] T025 [US1] Define the injected media extraction contract and option types in `backend/src/providers/media-extractor/index.ts` and `backend/src/providers/media-extractor/types.ts` for platform, safe title, option ID, container, dimensions, and quality label.
- [X] T026 [P] [US1] Write failing supported-link validation tests in `backend/src/services/downloads/tests/validate-media-url-service.spec.ts` for supported platform URLs, malformed/unsupported schemes, credentials, private or loopback IP literals, custom ports, and lookalike domains.
- [X] T027 [US1] Implement supported-link validation in `backend/src/services/downloads/validate-media-url-service.ts`; accept only HTTP(S) YouTube, Instagram, and Facebook hostnames, reject credentials and private/loopback IP literals, and reject non-default ports.
- [X] T028 [P] [US1] Write failing URL and analysis service tests in `backend/src/services/downloads/tests/analyze-media-service.spec.ts` for valid platform links, malformed URLs, unsupported hosts, private/loopback targets, redirects, unavailable/private sources, and safe provider errors.
- [X] T029 [US1] Implement link-analysis orchestration in `backend/src/services/downloads/analyze-media-service.ts` and an in-memory media extractor fake in `backend/src/providers/implementations/in-memory/media-extractor.ts`, returning only allowlisted metadata/options and never raw extractor payload or provider URLs.
- [X] T030 [US1] Complete and pass URL validation and analysis tests in `backend/src/services/downloads/tests/analyze-media-service.spec.ts` using the in-memory extractor.
- [X] T031 [P] [US1] Write failing provider tests in `backend/src/providers/implementations/yt-dlp/tests/yt-dlp-media-extractor.spec.ts` for structured option parsing, unsupported results, timeout, process failure, and sanitization of stderr/stdout.
- [X] T032 [US1] Implement the yt-dlp provider in `backend/src/providers/implementations/yt-dlp/yt-dlp-media-extractor.ts` using argument arrays without a shell, isolated configuration, bounded process resources, and machine-readable output only; require T001 approval for its selected executable/license.

### Download Repository, Worker, and HTTP

- [X] T033 [US1] Define Download domain types and repository contract in `backend/src/repositories/downloads/types.ts` and `backend/src/repositories/downloads/index.ts`, including owner ID, allowed platforms/states, encrypted source URL fields, nullable metadata, format selection, and timestamps from `data-model.md`.
- [X] T034 [US1] Implement queue/status use cases in `backend/src/services/downloads/create-download-service.ts` and `backend/src/services/downloads/find-download-service.ts`, with native AES-256-GCM URL encryption in `backend/src/services/downloads/source-url-encryptor.ts`; accept owner ID only from authenticated context, re-analyze/revalidate provider options, encrypt before persistence, and use owner-scoped status lookup.
- [X] T035 [P] [US1] Write failing queue/status service tests in `backend/src/services/downloads/tests/create-download-service.spec.ts` for accepted options, unavailable/mismatched formats, encrypted-only source persistence, owner isolation, not-found behavior, and safe repository errors.
- [X] T036 [US1] Implement an in-memory Download repository in `backend/src/repositories/implementations/in-memory/downloads/index.ts` with owner-scoped lookup and isolated queued-record creation/state updates.
- [X] T037 [US1] Complete and pass queue/status tests in `backend/src/services/downloads/tests/create-download-service.spec.ts` against the in-memory Download repository.
- [X] T038 [US1] Implement the Prisma Download repository in `backend/src/repositories/implementations/prisma/downloads/index.ts`, persisting encrypted source URLs and minimal metadata only.
- [X] T039 [US1] Define the private object-storage contract in `backend/src/providers/media-storage/index.ts` and `backend/src/providers/media-storage/types.ts` for put, stream, and idempotent delete by opaque object key.
- [X] T040 [P] [US1] Write failing storage contract tests in `backend/src/providers/media-storage/tests/media-storage-provider.spec.ts` for private object upload/read, missing objects, repeated deletion, and provider failure mapping.
- [X] T041 [US1] Implement an in-memory object-storage provider in `backend/src/providers/implementations/in-memory/media-storage.ts` for worker and storage service tests.
- [X] T042 [US1] Complete and pass media storage contract tests in `backend/src/providers/media-storage/tests/media-storage-provider.spec.ts` against the in-memory provider.
- [X] T043 [US1] Implement the private S3-compatible storage provider in `backend/src/providers/implementations/s3/s3-media-storage-provider.ts` with opaque random keys, no public ACLs, server-side encryption, and streaming; require T001 approval for the SDK and license.
- [X] T044 [P] [US1] Define the injected conversion contract in `backend/src/providers/media-converter/index.ts`; write failing job processor tests in `backend/src/services/downloads/tests/process-download-job-service.spec.ts` and AES-GCM URL round-trip/tamper tests in `backend/src/services/downloads/tests/source-url-encryptor.spec.ts` for state transitions, object upload, source/conversion/storage failure, temp cleanup, expiry snapshot, and safe errors.
- [X] T045 [US1] Write worker tests in `backend/src/workers/tests/download-worker.spec.ts`; implement URL decryption/job processing in `backend/src/services/downloads/source-url-encryptor.ts` and `backend/src/services/downloads/process-download-job-service.ts`; add `claimNextQueued` to `backend/src/repositories/downloads/index.ts`, `backend/src/repositories/implementations/in-memory/downloads/index.ts`, and `backend/src/repositories/implementations/prisma/downloads/index.ts`, plus an explicitly started single-worker loop in `backend/src/workers/download-worker.ts`; snapshot retention after processing and set `READY` only after upload succeeds.
- [X] T046 [US1] Complete and pass processor unit tests in `backend/src/services/downloads/tests/process-download-job-service.spec.ts` and an in-memory repository/extractor/storage flow in `backend/src/services/downloads/tests/process-download-job-in-memory.spec.ts`.
- [X] T047 [P] [US1] Write failing FFmpeg adapter tests in `backend/src/providers/implementations/ffmpeg/tests/ffmpeg-media-converter.spec.ts` for supported output conversion, merge/remux errors, timeout, and temporary-file cleanup using `backend/src/providers/media-converter/index.ts`.
- [X] T048 [US1] Implement the FFmpeg media converter in `backend/src/providers/implementations/ffmpeg/ffmpeg-media-converter.ts` with argument arrays and bounded execution; require T001 approval for the executable and license, and bypass conversion when the original option is selected.
- [X] T049 [P] [US1] Write failing HTTP contract tests in `backend/src/http/tests/media-download.routes.spec.ts` for `POST /media/analysis`, `POST /downloads`, status lookup, private file streaming, authentication, and safe errors from `contracts/openapi.yaml`.
- [X] T050 [US1] Wire analysis/download services in `backend/src/factories/downloads/create-download-service-factory.ts`, then implement media-analysis and download controllers/routes in `backend/src/http/controllers/media-controller.ts`, `backend/src/http/controllers/download-controller.ts`, `backend/src/http/routes/media-routes.ts`, and `backend/src/http/routes/download-routes.ts`.
- [X] T051 [US1] Complete and pass authentication, media-analysis, and download HTTP contract tests in `backend/src/http/tests/auth.routes.spec.ts` and `backend/src/http/tests/media-download.routes.spec.ts`.

### Frontend Integration for User Story 1

- [X] T052 [US1] Implement the credentialed typed fetch client in `frontend/lib/api-client.ts`, including safe API error types and `credentials: "include"` without storing session tokens in browser storage.
- [X] T053 [US1] Implement registration and login forms in `frontend/app/(auth)/register/page.tsx` and `frontend/app/(auth)/login/page.tsx` with accessible labels and contract validation bounds: name 1–120 characters, email at most 254 characters, and password 12–128 characters.
- [X] T054 [US1] Implement the protected media-analysis/download dashboard in `frontend/app/(protected)/page.tsx` and `frontend/components/media/media-url-form.tsx`, `frontend/components/media/media-options.tsx`, and `frontend/components/media/download-status.tsx` using only available options and safe error text.

**Checkpoint**: User Story 1 can be demonstrated independently: registration/login, supported URL analysis, option selection, queued status, completed private file, and owner-only history record.

---

## Phase 4: User Story 2 - Consultar histórico e configurar retenção (Priority: P2)

**Goal**: An authenticated user can review and re-download their history, configure retention, delete media or history, and have expired media removed while records remain.

**Independent Test**: Seed/download an owned record, save each allowed retention value, confirm the snapshot applies to later-ready downloads only, delete media while keeping its row, clear history without affecting another owner, re-download an accessible source, and simulate expiry/deletion retry.

### Settings and Retention TDD

- [X] T055 [US2] Define the user-settings repository contract and types in `backend/src/repositories/settings/index.ts` and `backend/src/repositories/settings/types.ts` for `themePreference` `LIGHT|DARK` and `retentionHours` one of `1|8|24|72|168|336|720`, default `1`.
- [X] T056 [US2] Implement the settings update/read use cases in `backend/src/services/settings/get-user-settings-service.ts` and `backend/src/services/settings/update-user-settings-service.ts`, validating only the allowed enum values and applying changes to the authenticated owner.
- [X] T057 [P] [US2] Write failing settings service tests in `backend/src/services/settings/tests/update-user-settings-service.spec.ts` for valid settings, default values, rejected out-of-range retention/theme, and account isolation.
- [X] T058 [US2] Implement an in-memory settings repository in `backend/src/repositories/implementations/in-memory/settings/index.ts`.
- [X] T059 [US2] Complete and pass settings service tests in `backend/src/services/settings/tests/update-user-settings-service.spec.ts` using the in-memory repository.
- [X] T060 [US2] Implement Prisma settings persistence in `backend/src/repositories/implementations/prisma/settings/index.ts`, storing the retention enum and theme preference on the owning Account.
- [X] T061 [P] [US2] Write failing retention expiry service tests in `backend/src/services/downloads/tests/expire-download-media-service.spec.ts` for exact `expiresAt` eligibility, owner-independent system cleanup, denied access after deadline, retryable object deletion failure, and retained history row.
- [X] T062 [US2] Implement expiry processing in `backend/src/services/downloads/expire-download-media-service.ts`; transition `READY` to `EXPIRED` after successful deletion or `DELETE_FAILED` on failure, and never allow reads once `expiresAt <= now`.
- [X] T063 [US2] Add an explicitly started cleanup loop in `backend/src/workers/download-worker.ts` that claims eligible records, retries object deletion idempotently, and leaves user history rows after media expiry.
- [X] T064 [US2] Complete and pass retention expiry tests in `backend/src/services/downloads/tests/expire-download-media-service.spec.ts` using an injected clock and in-memory storage.

### History and Re-Download TDD

- [X] T065 [US2] Define owner-scoped history repository types and contract in `backend/src/repositories/history/types.ts` and `backend/src/repositories/history/index.ts` for listing, source lookup, individual deletion, and account-wide deletion.
- [X] T066 [US2] Implement history use cases in `backend/src/services/history/list-history-service.ts`, `backend/src/services/history/delete-history-service.ts`, and `backend/src/services/history/redownload-from-history-service.ts`; ensure history deletion removes associated retained objects before deleting rows and re-download revalidates the source/options.
- [X] T067 [P] [US2] Write failing history service tests in `backend/src/services/history/tests/history-services.spec.ts` for owner-only pagination, manual media deletion retaining the row, individual/all-history deletion, object-delete failure retry, and re-download from an accessible source.
- [X] T068 [US2] Implement an in-memory history repository in `backend/src/repositories/implementations/in-memory/history/index.ts` with owner scoping and deterministic pagination.
- [X] T069 [US2] Complete and pass history service tests in `backend/src/services/history/tests/history-services.spec.ts` using in-memory repositories and providers.
- [X] T070 [US2] Implement the Prisma history repository in `backend/src/repositories/implementations/prisma/history/index.ts` with `(userId, createdAt)` pagination and ownership filters on every lookup/delete.
- [X] T071 [P] [US2] Write failing HTTP contract tests in `backend/src/http/tests/history-settings.routes.spec.ts` for `GET /history`, individual/all history deletion, media-only deletion, re-download, and settings GET/PATCH using `contracts/openapi.yaml`.
- [X] T072 [US2] Wire settings and history factories in `backend/src/factories/settings/create-user-settings-service-factory.ts` and `backend/src/factories/history/create-history-service-factory.ts` with explicit repository/provider/clock dependencies.
- [X] T073 [US2] Implement owner-authorized settings/history controllers and routes in `backend/src/http/controllers/settings-controller.ts`, `backend/src/http/controllers/history-controller.ts`, `backend/src/http/routes/settings-routes.ts`, and `backend/src/http/routes/history-routes.ts`.
- [X] T074 [US2] Complete and pass history/settings HTTP contract tests in `backend/src/http/tests/history-settings.routes.spec.ts`, including cross-account attempts and safe failure responses.

### Frontend Integration for User Story 2

- [X] T075 [US2] Implement the owner-scoped history page and list in `frontend/app/(protected)/history/page.tsx` and `frontend/components/media/history-list.tsx`, including queued, failed, media-deleted, expired, and ready states.
- [X] T076 [US2] Implement retention settings and history actions in `frontend/app/(protected)/settings/page.tsx` and `frontend/components/media/retention-setting.tsx`; offer exactly `1`, `8`, `24`, `72`, `168`, `336`, `720` hours and explain that a change applies only to downloads becoming ready later.
- [X] T077 [US2] Connect media deletion, single/all-history deletion, and re-download actions in `frontend/components/media/history-list.tsx` to the API client while distinguishing media-only deletion from history-row deletion.

**Checkpoint**: User Story 2 can be demonstrated with owned history, all retention choices, per-download retention snapshots, redownload, separate media/history deletion, and expiry cleanup while preserving expired records.

---

## Phase 5: User Story 3 - Usar a ferramenta em diferentes dispositivos (Priority: P3)

**Goal**: The responsive interface remains usable from narrow mobile to wide desktop and preserves the signed-in user's theme preference.

**Independent Test**: Use 320 px, tablet, and 1920 px viewport widths to complete the primary screens without horizontal page scrolling; switch theme, reload, and confirm the authenticated preference is retained.

- [X] T078 [P] [US3] Implement account-backed theme context in `frontend/components/theme-provider.tsx` and `frontend/app/layout.tsx`, initializing from `/settings`, applying `LIGHT|DARK`, and saving changes through the settings API without introducing an unapproved dependency.
- [X] T079 [US3] Implement an accessible theme toggle in `frontend/components/theme-toggle.tsx` and include it in `frontend/app/(protected)/layout.tsx` with keyboard labels and visible focus treatment.
- [X] T080 [P] [US3] Refine responsive navigation, form, option list, history, and settings layouts in `frontend/app/globals.css`, `frontend/app/(protected)/layout.tsx`, and the media components for 320 px–1920 px viewports without horizontal page overflow.
- [X] T081 [US3] Define keyboard, focus, contrast, reduced-motion, and screen-reader text requirements in `frontend/components/media/media-url-form.tsx`, `frontend/components/media/media-options.tsx`, `frontend/components/media/history-list.tsx`, and `frontend/components/theme-toggle.tsx` while using shadcn components where available.
- [X] T082 [P] [US3] Add dependency-free frontend unit tests for pure API/formatting/theme helpers in `frontend/lib/api-client.test.ts` and a `test` script in `frontend/package.json` using Node's built-in test runner only.

**Checkpoint**: User Story 3 can be demonstrated at the documented viewport range with persistent account theme preference and keyboard-operable controls.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close integration gaps, document operations, and meet per-package quality gates.

- [X] T083 [P] Add security-focused unit tests for URL allowlisting, redirect/private-address rejection, safe error mapping, cookie/Origin policy, and cross-account access in `backend/src/services/downloads/tests/security-boundaries.spec.ts`.
- [X] T084 [P] Add provider integration tests using only approved MySQL/S3-compatible test services in `backend/src/repositories/implementations/prisma/tests/repositories.integration.spec.ts` and `backend/src/providers/implementations/s3/tests/s3-media-storage-provider.integration.spec.ts`.
- [X] T085 Reconcile all request/response/error shapes between `backend/src/http/routes/`, `frontend/lib/api-client.ts`, and `specs/001-download-midias-online/contracts/openapi.yaml`.
- [X] T086 Update operational setup, approved dependency/license inventory, environment variables, migration, worker, and cleanup instructions in `backend/README.md` and `frontend/README.md` without documenting secrets.
- [X] T087 Run backend tests, lint, build, and coverage reporting from `backend/package.json`; add or document a narrowly justified exception for any backend requirement below the constitution's near-100% unit coverage target.
- [X] T088 Run frontend tests, lint, and build from `frontend/package.json` and complete the browser acceptance scenarios in `specs/001-download-midias-online/quickstart.md` against approved MySQL and private object storage.
- [X] T089 Verify that no media, temporary files, private URLs, cookies, object keys, or provider output are exposed through logs, public responses, or public object access; record the requirement-level review in `specs/001-download-midias-online/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001–T005; T001 is a blocking approval gate for dependencies not explicitly authorized by the user.
- **Foundational (Phase 2)**: T006–T012 depend on Setup and block all stories. Prisma/MySQL and shadcn were explicitly requested; do not install the S3 SDK, JOSE library, FFmpeg executable, or other unapproved dependency until T001 is approved.
- **User Story 1 (Phase 3)**: Depends on Foundational; delivers the P1 account, analysis, and download MVP.
- **User Story 2 (Phase 4)**: Depends on User Story 1 because it needs owned download records and media to manage; its service tests can use seeded in-memory records.
- **User Story 3 (Phase 5)**: Depends on authentication from User Story 1 and persisted settings from User Story 2.
- **Polish (Phase 6)**: Depends on all desired stories and approved integration-test services.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no other story dependency.
- **US2 (P2)**: Starts after US1 for integrated history/download lifecycle; isolated service tests may use in-memory fixtures.
- **US3 (P3)**: Starts after US1 and US2 because its theme preference is account-backed settings.

### Within Each Backend Use Case

1. Define repository/provider contracts and types.
2. Implement the service/use case against injected contracts.
3. Write unit tests and confirm they fail for the missing behavior.
4. Add the in-memory repository/provider.
5. Complete the tests and make them pass.
6. Add Prisma/external-provider implementations and integration tests after dependency approval.
7. Wire explicit factories, then HTTP controllers/routes, then frontend integration.

## Parallel Opportunities

- Phase 1 T003 and T004 can run in parallel after T002 because they touch separate package manifests; T005 touches CSS and can also run independently. T002 itself updates both package manifests and therefore must not overlap with T003/T004.
- Phase 2 T008, T010, and T011 are marked `[P]` because they touch separate files; all Phase 2 tasks must still complete before story work.
- Within US1, independent auth, extractor, and download repository test files can be prepared in parallel after their contracts exist; implementation tasks remain ordered behind failing tests.
- Within US2, settings tests and expiry-service tests target separate files; history work follows its own repository contract and can use in-memory records.
- Within US3, T078, T080, and T082 are marked `[P]` after settings and shared UI are available because they primarily touch separate provider, stylesheet, and test/package files; T079 and T081 follow their UI dependencies.
- T083 and T084 in Polish are parallelizable after their respective adapters exist.

## Parallel Example: User Story 1

```text
After T014, prepare independent auth tests in:
  backend/src/services/auth/tests/register-user-service.spec.ts
  backend/src/services/auth/tests/login-user-service.spec.ts

After T025, prepare media validation/analysis tests in:
  backend/src/services/downloads/tests/analyze-media-service.spec.ts

After T033, prepare queue/status tests in:
  backend/src/services/downloads/tests/create-download-service.spec.ts

Do not implement the corresponding in-memory/production behavior until each
test task has demonstrated the intended failing cases.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and resolve T001 approval for every unapproved dependency.
2. Complete Foundational tasks T006–T012.
3. Complete US1 tasks T013–T054 in order, respecting each TDD sequence.
4. Validate the independent US1 criteria in `specs/001-download-midias-online/quickstart.md`.
5. Stop before US2/US3 if the MVP scope is all that is approved for delivery.

### Incremental Delivery

1. Deliver US1 with authentication, analysis, format selection, private download, and initial history row.
2. Add US2 for configurable retention, history ownership/deletion, re-download, and expiry cleanup.
3. Add US3 for account-backed theme preference, responsive layouts, and accessibility requirements.
4. Complete Polish gates for tests, lint, build, coverage, contract consistency, and privacy.

## Notes

- Every task uses `- [ ] T###`, includes a concrete file path, and uses `[US#]` only in story phases.
- `[P]` marks only tasks that edit independent files with no incomplete-task dependency.
- Backend tests are explicit because TDD was requested; use existing Vitest/service-test conventions and maintain near-100% unit coverage for implemented backend requirements.
- Tasks touching dependencies behind T001 are blocked until the dependency and license are approved; do not silently substitute another library or architecture.

## Phase 7: Convergence

- [ ] T090 [US1] Expose original, container-conversion, and dimension choices only from analyzed media options in `frontend/components/media/media-options.tsx`; send selected `targetContainer`/`targetHeight` from `frontend/app/(protected)/page.tsx` through `frontend/lib/api-client.ts`, and test original bypass/conversion paths per FR-006 (partial).
- [ ] T091 [US1] Canonicalize validated source URLs in `backend/src/services/downloads/validate-media-url-service.ts` by removing nonessential tracking parameters while preserving media identity; cover platform URL cases before encryption in `backend/src/services/downloads/tests/validate-media-url-service.spec.ts` per `data-model.md` Download source URL rules (partial).
- [ ] T092 [US2] Align the `/settings` wire contract to the canonical `themePreference` field across `specs/001-download-midias-online/contracts/openapi.yaml`, backend settings DTOs, and `frontend/lib/api-client.ts`; add a contract assertion per the plan's REST/OpenAPI compatibility decision (partial).
- [ ] T093 Define and enforce approved maximum media bytes and per-account queued-job limits in `backend/src/providers/implementations/yt-dlp/yt-dlp-media-extractor.ts` and `backend/src/services/downloads/create-download-service.ts`; document the selected bounds and test over-limit errors per plan Performance Goals/Constraints (partial).
- [ ] T094 Review the unrequested root response in `backend/src/index.ts`; remove the `Hello World!` placeholder or replace it with a documented, intentionally public health response and test its contract per the plan's REST route scope (unrequested).