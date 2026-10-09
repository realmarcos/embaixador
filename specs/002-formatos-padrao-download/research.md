# Research: Opções Padrão de Formato para Download

**Date**: 2026-10-09
**Scope**: Existing media analysis, format selection, conversion, and history behavior for feature 002.

## Current State

- `YtDlpMediaExtractor` returns provider formats as separate options using `format_id`, `ext`, width, height, and quality text. Audio/video codec metadata is not currently mapped into the public media type.
- `AnalyzeMediaService` validates and sanitizes each provider option but does not build or filter a standard catalog.
- The media-options UI renders every returned option. The download request sends `formatId` and optionally `targetContainer`/`targetHeight`.
- `CreateDownloadService` analyzes the URL again and checks that the selected provider option remains available before queueing. It currently compares target container/height against that provider option, so it cannot represent an independently derived preset.
- `ProcessDownloadJobService` downloads the persisted provider format and invokes FFmpeg only if a target container or height is present.
- `FfmpegMediaConverter` already isolates the process, bounds execution time/output, strips metadata, supports MP3 and MP4 containers, and scales by target height while preserving aspect ratio. It does not currently express audio-only mapping or a two-dimensional fit-and-pad target. Its MP4 MIME mapping currently reports `video/mp4` for every MP4 output.
- Download history persists source format ID, target container, and target height. It does not persist a user-facing preset identity or target width.

## Decisions

### Derive a Stable Catalog from Analyzed Capabilities

**Decision**: Build a fixed catalog projection from the analyzed provider formats and their audio/video codec metadata. Return a stable preset ID for original, audio MP3, audio MP4, and each supported video resolution; omit unsupported entries and duplicate provider encodings.

**Rationale**: This delivers predictable choices while preserving analysis as the source of truth. Keeping the provider's raw format list in the API would continue exposing duplicate and non-standard choices.

**Alternatives considered**: Filtering only by height would still misclassify audio-only/video-only entries and could expose a target that is not convertible. Returning provider options unchanged does not satisfy the feature.

### Revalidate and Resolve Presets on the Backend

**Decision**: The frontend submits a preset identity, not FFmpeg arguments or provider stream IDs. The backend reanalyzes the URL, rebuilds the same catalog, rejects stale/unavailable preset IDs, then resolves the preset to a provider source selector and conversion settings for the queued job.

**Rationale**: The current creation path already reanalyzes before queueing, but only validates raw provider IDs. A server-owned mapping prevents clients from inventing unsupported dimensions or container settings.

**Alternatives considered**: Sending arbitrary `targetContainer`/`targetHeight`/`targetWidth` from the browser would expand the request surface and duplicate eligibility logic in the client.

### Reuse FFmpeg with Explicit Audio-Only and DCI Handling

**Decision**: Reuse the configured FFmpeg executable and converter. Audio presets explicitly disable video streams and use MP3 or MP4 audio output. Standard video presets use proportional downscaling. DCI 2K emits an exact 2048×1080 frame by fitting and centering the source picture over black side bars; it must not upscale the picture. Original bypasses FFmpeg.

**Rationale**: The repository already owns process isolation, temporary-file boundaries, error sanitization, container validation, and conversion lifecycle. The user confirmed side bars for 16:9 DCI output.

**Alternatives considered**: A new conversion dependency is unnecessary. Cropping would alter source framing; stretching would distort aspect ratio; omitting DCI for all 16:9 sources would defeat the requested preset when the source has enough resolution.

### Persist the Output Choice

**Decision**: Persist a stable selected preset identity in addition to the provider source format and conversion parameters. Add only the fields needed to represent width-dependent DCI output/audio-only mode, using an additive migration.

**Rationale**: Existing history cannot identify the selected output resolution and the worker needs enough information to reproduce the queued choice after the HTTP request ends.

**Alternatives considered**: Inferring the selection from a source format ID loses the requested output; reconstructing it from the file name is ambiguous and does not reliably distinguish audio MP4 from video MP4.

## Resolved Unknowns

- **2K geometry**: User selected DCI 2048×1080; for 16:9 content, use centered black side bars to fit the exact frame while preserving picture aspect ratio.
- **Conversion dependency**: FFmpeg is already configured and integrated; no new dependency is needed.
- **Unsupported outputs**: Omit presets that analysis cannot substantiate or that would require upscaling. Revalidate on the server when a download is requested.
- **Audio-only output**: Explicitly disable video mapping and return audio MIME metadata for audio MP3/MP4.

## Remaining Implementation Validation

- Confirm the yt-dlp source selector can represent the compatible audio/video stream combination selected by the catalog, including providers that expose separate streams.
- Confirm the deployed FFmpeg build has an MP3 encoder and MP4-compatible audio encoder; fail safely and do not advertise an output that the configured build cannot produce.
- Verify additive Prisma migration behavior for existing queued/history rows; legacy rows must continue to use their existing fields and processing behavior.