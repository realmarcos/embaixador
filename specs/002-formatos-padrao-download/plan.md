# Implementation Plan: Opções Padrão de Formato para Download

**Branch**: `002-formatos-padrao-download` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Specification for a capability-filtered standard media-format catalog with original-download and FFmpeg conversion options.

## Summary

Replace the raw yt-dlp format list with a stable catalog of original, audio-only MP3/MP4, and MP4 video presets. Build only presets supported by analyzed audio/video streams and dimensions, prevent upscaling, and use the existing FFmpeg converter for requested transformations. The DCI 2K preset is an exact 2048×1080 output; for non-DCI aspect ratios, scale the picture to fit and center it over black side bars. Original selections bypass conversion.

## Technical Context

**Language/Version**: TypeScript 6; Node.js 24 (backend and frontend packages require Node >=24 <25)

**Primary Dependencies**: Express 5, Prisma 6.12, Next.js 16, React 19; existing yt-dlp and FFmpeg executables configured through backend environment settings. No new package dependency planned.

**Storage**: MySQL through Prisma; private object storage for completed media. Persist the selected public preset alongside the internal source format and conversion parameters so history can identify the output.

**Testing**: Backend Vitest unit and route/contract tests, frontend Node test runner, package lint/build. Add focused tests for preset derivation, stale selections, audio-only output parameters, dimensions/padding, and original bypass.

**Target Platform**: Linux server and modern web browsers.

**Project Type**: Web application with separate backend and frontend packages.

**Performance Goals**: No new latency target is specified. Preserve existing provider and conversion timeouts; catalog generation must be bounded by the already analyzed format list.

**Constraints**: Do not offer unsupported or upscaled outputs. Audio presets must produce no video stream. Preserve picture aspect ratio. DCI 2K must be exactly 2048×1080, centered with black side bars when needed. Keep provider IDs and source URLs out of new user-facing errors; source URLs remain encrypted at rest.

**Scale/Scope**: One media-analysis/download workflow across backend, frontend, API contract, and download history. No per-user presets, new storage service, or provider support expansion.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Result | Evidence |
|---|---|---|
| Monorepo boundaries and shared contract compatibility | PASS | Backend owns media analysis, selection validation, persistence, and conversion; frontend consumes the same preset contract. Contract changes are delivered with both packages. |
| Third-party dependencies | PASS | Reuse existing yt-dlp, FFmpeg, TypeScript, and project dependencies; no package addition or update is planned. |
| Authorized scope and architecture | PASS | The requested catalog and conditional FFmpeg conversion are in scope. The design extends existing analysis/conversion paths rather than adding a new service or provider. |
| Backend unit coverage | PASS | Each backend rule will receive focused unit coverage, including media-track classification, resolution eligibility, stale preset rejection, conversion arguments, and original bypass. |
| Security and media confidentiality | PASS | Reuse URL validation/encryption, process isolation, sanitized errors, and private storage; do not expose provider diagnostics or private source URLs. |
| Documentation and package quality | PASS | Update the OpenAPI contract and feature guide; run tests, lint, and build for each changed package. |

## Project Structure

### Documentation (this feature)

```text
specs/002-formatos-padrao-download/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/media-format-presets.openapi.yaml
└── tasks.md (generated later by /speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/http/controllers/ and src/http/tests/
├── src/providers/implementations/yt-dlp/ and src/providers/implementations/ffmpeg/
├── src/services/downloads/ and src/services/downloads/tests/
├── src/workers/
└── prisma/schema.prisma and prisma/migrations/

frontend/
├── app/(protected)/
├── components/media/
└── lib/api-client.ts and lib/api-client.test.ts
```

**Structure Decision**: Keep changes within the existing backend, frontend, Prisma, and feature-documentation boundaries. The backend derives and validates presets from provider analysis; the frontend displays the returned presets and submits a preset selection. The worker uses the persisted source format and output parameters with the existing FFmpeg provider. No cross-package shared code package is introduced.

## Complexity Tracking

No constitution violations require justification.

## Design Decisions

- Return one stable preset per output class/resolution rather than exposing provider-specific formats or duplicate encodings.
- Keep provider format/stream selectors internal. A download request identifies the selected preset; the backend recomputes the catalog from fresh analysis before queueing and rejects a preset that is no longer available.
- Classify audio/video capabilities from provider codec metadata. Video presets require a source video dimension at least as large as the requested output; audio presets require an audio stream.
- Use the existing FFmpeg converter for MP3, audio-only MP4, and video MP4 conversions. Add explicit audio-only mapping (`-vn`) and correct audio MIME metadata. Original output bypasses conversion.
- Preserve existing proportional scaling for height presets. For DCI 2K, use a fit-and-pad filter to emit 2048×1080 without stretching or cropping; center the picture and use black side bars.
- Persist the selected preset identity and the conversion details needed by the worker/history. Use an additive Prisma migration; do not store provider stderr or plaintext source URLs.

## Post-Design Constitution Check

| Gate | Result | Evidence |
|---|---|---|
| Separation and contract compatibility | PASS | Preset contract is documented for coordinated backend/frontend changes. |
| Dependencies and simplicity | PASS | Existing packages/providers are reused; the preset catalog is a focused domain transformation. |
| Test and package quality | PASS | Backend rules have unit-test coverage requirements; frontend and backend quality gates remain package-local. |
| Confidentiality and safe failures | PASS | Preset IDs do not expose source URLs; provider diagnostics remain sanitized; existing encrypted-source and private-storage boundaries are preserved. |
| Documentation | PASS | Contract, data model, and runnable validation guide are included in this plan. |
