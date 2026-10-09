# Tasks: Opções Padrão de Formato para Download

**Input**: Design documents from `/specs/002-formatos-padrao-download/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/media-format-presets.openapi.yaml](contracts/media-format-presets.openapi.yaml)

**Tests**: Backend tests are included because the plan and project constitution require unit coverage for implemented backend requirements. No test framework dependency is added.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel because files differ and dependencies are complete.
- **[Story]**: User story label; required only for user-story phase tasks.
- Every task names the exact file path(s) to change.

## Phase 1: Setup

**Purpose**: Project initialization and basic structure.

The backend and frontend packages, toolchain, and media executables are already established. No project initialization or dependency installation is required for this feature.

---

## Phase 2: Foundational

**Purpose**: Define the shared API and persistence shape required by the media-format user story.

- [ ] T001 [P] Update `specs/002-formatos-padrao-download/contracts/media-format-presets.openapi.yaml` with the `MediaPreset` response fields and `presetId` request field; retain `id` maximum length 64, dimension range 1-8640, and distinguish original, audio, and video kinds.
- [ ] T002 [P] Add `selectedPresetId`, nullable `targetWidth`, and `targetAudioOnly` to `backend/prisma/schema.prisma`; preserve existing rows through an additive migration in `backend/prisma/migrations/` and constrain preset IDs to the contract maximum length 64 and target dimensions to the existing 1-8640 range.
- [ ] T003 Extend `backend/src/repositories/downloads/types.ts` and `backend/src/repositories/implementations/prisma/downloads/index.ts` to create and return the selected preset identity, target width, and audio-only intent while preserving the existing encrypted-source fields.

**Checkpoint**: Contract and persistence can represent all new output selections without changing existing source URL confidentiality boundaries.

---

## Phase 3: User Story 1 - Escolher um formato padrão compatível (Priority: P1)

**Goal**: Return only producible standard presets for an analyzed media source, accept a valid preset selection, and deliver a matching original, audio, or MP4 video file.

**Independent Test**: Analyze authorized media with audio/video capabilities at 720p, below 720p, and without audio. Confirm only supported presets are returned; queue one audio preset, one reduced-resolution preset, DCI 2K from a sufficiently large 16:9 source, and original; confirm output characteristics and history selection match each preset.

### Tests for User Story 1

- [ ] T004 [P] [US1] Add yt-dlp mapping tests for audio/video codec metadata, missing codec values, and unknown capabilities in `backend/src/providers/implementations/yt-dlp/tests/yt-dlp-media-extractor.spec.ts`.
- [ ] T005 [P] [US1] Add catalog tests for the standard resolution set, 720p and lower source limits, no upscaling, DCI 2048×1080 padding eligibility, audio-only eligibility, unsupported metadata, and duplicate provider formats in `backend/src/services/downloads/tests/media-format-catalog.spec.ts`.
- [ ] T006 [P] [US1] Add fresh-analysis preset selection, stale/unknown preset rejection, and persistence assertions in `backend/src/services/downloads/tests/create-download-service.spec.ts`.
- [ ] T007 [P] [US1] Add conversion tests for MP3 and audio MP4 without video streams, audio MIME types, proportional downscale, exact DCI fit-and-pad output, no source-pixel upscaling, and conversion bypass for original in `backend/src/providers/implementations/ffmpeg/tests/ffmpeg-media-converter.spec.ts` and `backend/src/services/downloads/tests/process-download-job-service.spec.ts`.
- [ ] T008 [P] [US1] Add repository adapter assertions for `selectedPresetId`, `targetWidth`, and `targetAudioOnly` persistence in `backend/src/repositories/implementations/prisma/tests/prisma-adapters.spec.ts` and `backend/src/repositories/implementations/prisma/tests/repositories.integration.spec.ts`.
- [ ] T009 [P] [US1] Update API client tests to assert download creation sends `presetId` and parses preset response fields in `frontend/lib/api-client.test.ts`.

### Implementation for User Story 1

- [ ] T010 [US1] Extend internal media capability types and map yt-dlp `acodec`/`vcodec` in `backend/src/providers/media-extractor/types.ts` and `backend/src/providers/implementations/yt-dlp/yt-dlp-media-extractor.ts` without exposing raw codec diagnostics in public responses.
- [ ] T011 [US1] Implement stable preset derivation and integrate it into analysis so audio MP3/MP4, MP4 video at 240p/360p/480p/720p/1080p/1440p/DCI 2K/4K, and original appear only when supported in `backend/src/services/downloads/media-format-catalog.ts` and `backend/src/services/downloads/analyze-media-service.ts`.
- [ ] T012 [US1] Resolve submitted `presetId` against a fresh analysis, reject unavailable selections with the existing safe `FORMAT_NOT_AVAILABLE` error, and persist its internal source selector and output settings in `backend/src/services/downloads/create-download-service.ts`.
- [ ] T013 [P] [US1] Extend `MediaConversionInput` and `FfmpegMediaConverter` to support nullable target width/height and audio-only output; emit MP3/MP4 audio with no video stream, preserve proportional scaling, and fit/pad DCI output to exactly 2048×1080 with centered black bars in `backend/src/providers/media-converter/index.ts` and `backend/src/providers/implementations/ffmpeg/ffmpeg-media-converter.ts`.
- [ ] T014 [US1] Pass persisted output settings into conversion and bypass FFmpeg for original selections in `backend/src/services/downloads/process-download-job-service.ts`; ensure completed MP4 audio uses `audio/mp4` and video MP4 uses `video/mp4` in `backend/src/providers/implementations/ffmpeg/ffmpeg-media-converter.ts`.
- [ ] T015 [US1] Change the create-download HTTP request to accept `presetId`, include the selected preset identity in the owned download response, and preserve safe validation/error behavior in `backend/src/http/controllers/download-controller.ts` and `backend/src/http/tests/media-download.routes.spec.ts`.
- [ ] T016 [US1] Replace raw `MediaOption` client shapes with the public `MediaPreset` type and send `presetId` in `frontend/lib/api-client.ts`.
- [ ] T017 [US1] Render the returned preset label, media kind, container, and resolution without exposing provider format IDs in `frontend/components/media/media-options.tsx`.
- [ ] T018 [US1] Wire the selected preset through analysis, default selection, and download submission in `frontend/app/(protected)/page.tsx`.
- [ ] T019 [US1] Show the selected preset/output identity in the completed download status and history presentation in `frontend/components/media/download-status.tsx` and `frontend/lib/api-client.ts`.

**Checkpoint**: User Story 1 is independently usable from analysis through completed output and matching history metadata.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Verify cross-package compatibility and document the runnable acceptance scenarios.

- [ ] T020 [P] Update `specs/002-formatos-padrao-download/quickstart.md` to match the final preset contract, media fixtures/scenarios, migration prerequisites, and safe handling of private test URLs and provider diagnostics.
- [ ] T021 Run backend tests, lint, build, Prisma migration checks, and frontend tests/lint/build using `backend/package.json`, `frontend/package.json`, and `specs/002-formatos-padrao-download/contracts/media-format-presets.openapi.yaml`; record any unavailable encoder or migration prerequisite without weakening preset eligibility.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Existing project initialization is already complete; no setup tasks block implementation.
- **Foundational (Phase 2)**: T001 and T002 may run in parallel; T003 depends on the persistence shape from T002. All Phase 2 tasks block User Story 1.
- **User Story 1 (Phase 3)**: Test tasks T004-T009 can run in parallel after the shared API and persistence shapes are agreed. Implementations follow their corresponding tests; T010 precedes T011, T011 precedes T012, and T012/T013 precede T014. T015 depends on T012. T016 depends on T001; T017 depends on T016; T018 depends on T016 and T017; T019 depends on T015 and T018.
- **Polish (Phase 4)**: T020 and T021 depend on completion of User Story 1; final package checks run after all edits.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2. It is the only user story and can be delivered as the feature MVP.

### Parallel Opportunities

- T001 and T002 touch independent contract/schema files.
- T004-T009 touch distinct test files and can be prepared in parallel after Phase 2.
- T013 can proceed in parallel with catalog and API work after its conversion tests are in place.
- T020 documentation can proceed alongside final code review, but T021 requires all implementation edits to be complete.

## Parallel Example: User Story 1

```text
After Phase 2:
- T004 yt-dlp capability mapping tests
- T005 preset catalog eligibility tests
- T006 preset selection validation tests
- T007 FFmpeg conversion and original-bypass tests
- T008 persistence adapter tests
- T009 frontend API contract tests

After the tests are in place:
- T010 capability metadata mapping
- T013 FFmpeg output modes
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2 shared contract and persistence prerequisites.
2. Add and pass the focused tests for User Story 1.
3. Implement catalog derivation, selection validation, FFmpeg output modes, persistence, and frontend selection.
4. Validate the end-to-end scenarios in `specs/002-formatos-padrao-download/quickstart.md`.

### Incremental Delivery

1. Deliver capability-filtered presets and original selection first within User Story 1.
2. Add audio-only MP3/MP4 and standard MP4 downscales.
3. Add exact DCI 2K fit-and-pad output and selected-preset history details.
4. Run all backend and frontend package quality gates.

## Notes

- Every task uses the required unchecked checkbox, sequential ID, valid parallel/story labels, and explicit file paths.
- `[P]` marks independent file work only; story-specific tasks all carry `[US1]`.
- Backend tests are included to meet the project constitution; no new test or runtime dependency is proposed.
- Existing migration compatibility and media confidentiality must be preserved.
