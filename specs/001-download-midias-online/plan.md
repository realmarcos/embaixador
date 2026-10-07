# Implementation Plan: Download de Mídias Online

**Branch**: `001-download-midias-online` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification for authenticated media downloads, format selection,
history, configurable retention, and responsive light/dark UI.

## Summary

Preserve the existing monorepo and backend repository/service conventions. Add
MySQL persistence through Prisma, private S3-compatible object storage, and an
injected media-extractor/converter provider. Persist download jobs and history in
one lifecycle record, process jobs asynchronously from MySQL, and keep media
private by streaming it only after authenticated ownership checks. Use shadcn/ui
components in the existing Next.js App Router and keep the frontend as a separate
package.

The user confirmed private S3-compatible storage and signed JWS authentication in
a Secure, HttpOnly cookie. Design details and alternatives are recorded in
[research.md](./research.md); data and state rules are in
[data-model.md](./data-model.md); HTTP behavior is specified in
[contracts/openapi.yaml](./contracts/openapi.yaml).

## Technical Context

**Language/Version**: TypeScript 6 in backend; TypeScript 5 in frontend; Node.js 24 LTS is the proposed runtime baseline and must be pinned in runtime/deployment configuration before rollout.

**Primary Dependencies**: Existing Express 5, Next.js 16, React 19, Tailwind CSS 4, Vitest 5; user-authorized Prisma ORM with MySQL, shadcn/ui, and a media downloader. Candidate integrations are yt-dlp and FFmpeg; S3-compatible storage needs an SDK; JWS needs a maintained JOSE library.

**Storage**: MySQL via Prisma for accounts, settings, jobs, and history; private S3-compatible object storage for media. Do not store media bytes in MySQL.

**Testing**: Vitest for backend unit tests and provider fakes; contract/integration checks against configured MySQL and S3-compatible storage. Frontend uses Node's built-in test runner for dependency-free pure logic plus the browser acceptance scenarios in [quickstart.md](./quickstart.md); any UI test library requires approval before installation.

**Target Platform**: Browser on responsive mobile/desktop viewports; Linux server with a supported Node.js LTS, MySQL, private S3-compatible storage, and the approved downloader/converter executables.

**Project Type**: Web application in a two-package monorepo (`backend/`, `frontend/`).

**Performance Goals**: Return a queued job response within 1 second at p95 under the initial single-worker scope; target metadata analysis within 10 seconds at p95 when the source is responsive. Media completion time is provider-dependent and is reported as job progress, not request latency. Establish file-size, concurrency, and job-duration limits before production rollout.

**Constraints**: Process only allowlisted platform URLs and content users are authorized to download; do not bypass access controls. Private objects, authenticated history, ownership checks, safe error mapping, user-selected retention, and reliable expiry cleanup are mandatory. Do not expose media URLs, cookies, provider output, or secrets in logs/responses.

**Scale/Scope**: Initial scope is three platforms and one backend worker instance with MySQL-backed job records; no user-volume or concurrency target was provided. Keep provider interfaces replaceable without introducing a message broker in this phase.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

- **Monorepo compatibility**: PASS. Keep backend and frontend packages separate; publish and validate a REST contract between them.
- **Third-party dependencies**: PASS WITH APPROVAL GATE. Prisma/MySQL, shadcn/ui, and a downloader are explicit user choices. A JOSE library, S3 SDK, FFmpeg, and any frontend testing library must be listed and approved before being added if not covered by those choices.
- **Architecture authorization**: PASS FOR PLANNING. Use the user's repository/service/factory/http layering and existing in-memory pattern; this plan does not implement those changes.
- **Simplicity and explicit dependencies**: PASS. Inject repositories/providers into services and construct them in explicit factories/composition; no import-time clients or global mutable state.
- **Testing and quality**: PASS. Backend service tests follow existing Vitest conventions and TDD; each touched package must pass its tests, lint, and build.
- **Privacy/security**: PASS. Use an encrypted-at-rest source URL field, private bucket, authenticated owner checks, non-sensitive errors, and bounded cleanup retries.
- **Documentation**: PASS. Design artifacts and API contract accompany the feature plan.

### Post-Design Gate

- **Layering**: PASS. Repository contracts/types precede services and tests; in-memory implementations support isolated tests; Prisma/providers, factories, HTTP, and frontend integration follow.
- **Compatibility**: PASS. OpenAPI describes the REST boundary and the frontend uses the same response/error shapes.
- **Retention**: PASS. The download snapshots the account's retention preference when media becomes ready; later preference changes affect only future downloads.
- **Privacy**: PASS. Media is not public and is streamed only after ownership validation; deleting history also removes associated retained media.
- **Dependency approval**: CONDITIONAL GATE BEFORE IMPLEMENTATION. Do not install a candidate dependency until its necessity and license are recorded and approval is in scope.

## Project Structure

### Documentation (this feature)

```text
specs/001-download-midias-online/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md                 # Created by /speckit-tasks, not this command
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   └── schema.prisma
└── src/
    ├── repositories/
    │   ├── downloads/
    │   ├── settings/
    │   └── implementations/
    │       ├── in-memory/
    │       └── prisma/
    ├── services/
    │   ├── auth/
    │   ├── downloads/
    │   ├── history/
    │   └── settings/
    ├── providers/
    │   ├── media-extractor/
    │   ├── media-storage/
    │   └── implementations/
    │       ├── yt-dlp/
    │       ├── ffmpeg/
    │       └── s3/
    ├── factories/
    │   ├── auth/
    │   ├── downloads/
    │   └── settings/
    └── http/
        ├── controllers/
        ├── middlewares/
        └── routes/

frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (protected)/
│   │   ├── page.tsx
│   │   ├── history/
│   │   └── settings/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                  # Only shadcn components used by this feature
│   └── media/
└── lib/
    └── api-client.ts
```

**Structure Decision**: Extend the existing `backend/src/repositories/users`,
`backend/src/services/users`, and in-memory implementation style. Add only the
requested feature slices and the explicitly requested provider/factory/HTTP
boundaries. Keep the existing `frontend/app` App Router layout; do not introduce
a workspace-wide UI package or move either package.

## Implementation Order

Follow the requested TDD sequence for each backend use case:

1. Define repository contracts and types.
2. Implement the service/use case against injected contracts.
3. Write unit tests and observe expected failures.
4. Implement the in-memory repository/provider.
5. Complete tests until they pass.
6. Add Prisma or external-provider implementations and their integration tests.
7. Add explicit factories/composition wiring.
8. Add HTTP controller, middleware, routes, and contract tests.
9. Integrate the frontend against the OpenAPI contract and validate responsive flows.

Do not begin implementation until the dependency approval gate above is met.

## Complexity Tracking

No constitution violations or additional project/workspace layers are proposed.
