# Data Model: Opções Padrão de Formato para Download

## Media Capability

The backend-only analysis of one provider format or stream combination.

| Attribute | Type | Rules |
|---|---|---|
| `sourceFormatId` | string | Provider selector used internally for download; bounded and validated using existing yt-dlp rules. Never used as the public preset identity. |
| `container` | string | Normalized provider container/extension. |
| `width`, `height` | integer or null | Positive dimensions within the existing 1–8640 bound; unknown dimensions remain null. |
| `hasAudio`, `hasVideo` | boolean | Derived from provider audio/video codec metadata; unknown metadata must not be treated as confirmed capability. |
| `audioCodec`, `videoCodec` | string or null | Internal analyzed metadata used to choose source streams; do not expose raw provider output. |

## Download Preset

An API-facing, stable option derived from the current analysis. The response includes only presets the source can produce.

| Attribute | Type | Rules |
|---|---|---|
| `id` | string | Stable catalog ID such as `original`, `audio-mp3`, `audio-mp4`, `video-720p`, or `video-2k-dci`; selection is revalidated against a fresh catalog. |
| `kind` | enum | `original`, `audio`, or `video`. |
| `label` | string | User-facing name, including the standard resolution label where applicable. |
| `container` | enum/string | Original container, `mp3`, or `mp4`, as appropriate. |
| `width`, `height` | integer or null | Output frame dimensions for video presets; DCI 2K is exactly 2048×1080. Audio and original options may have null target dimensions. |
| `sourceFormatId` | string, internal | Compatible provider format/stream selector chosen from analyzed capabilities; never accepted directly from the browser in place of a preset. |
| `audioOnly` | boolean, internal conversion setting | True for audio MP3/MP4 and false for video/original. Audio outputs must contain no video stream. |
| `isOriginal` | boolean | True only for source output that bypasses conversion. |

### Availability Rules

- Audio presets require analyzed audio capability and an output path supported by the configured FFmpeg build or an already compatible source.
- Video presets require analyzed video capability and source height at least equal to the requested preset height; a lower source is never upscaled. A 720p source may expose only 240p, 360p, 480p, and 720p among the listed video presets.
- DCI 2K requires a source image that can fit the 2048×1080 frame without enlarging source pixels. The picture is centered and padded with black bars as needed; sources below 1080p are not offered this preset.
- Original is available only when the selected provider source can be downloaded without conversion while preserving its original container and available characteristics.

## Download Selection

The request-time selection that becomes an owned download record.

| Attribute | Type | Rules |
|---|---|---|
| `selectedPresetId` | string | Persisted stable output identity; used for history and to distinguish audio MP4 from video MP4. |
| `selectedFormatId` | string | Existing internal provider source selector field. |
| `targetContainer` | string or null | Existing output container field; null for original. |
| `targetHeight` | integer or null | Existing output height field; also 1080 for DCI 2K. |
| `targetWidth` | integer or null | Additive target width needed for exact 2048×1080 DCI output. |
| `targetAudioOnly` | boolean | Additive conversion intent; true for MP3/MP4 audio presets and false otherwise. |

The source URL remains encrypted using the existing ciphertext/IV/tag/key-version fields. Preset data must not include the source URL, credentials, or raw provider diagnostics.

## State and Lifecycle

1. Analysis maps provider stream metadata into internal capabilities and derives the currently available presets.
2. The user submits one preset ID with the source URL.
3. The backend revalidates the URL and rebuilds the catalog. An unavailable or stale preset is rejected before the job is queued.
4. The queued record stores the internal provider selector and output selection needed by the worker.
5. Original downloads bypass conversion. Other selected outputs use FFmpeg when source media is not already compatible.
6. The completed record exposes the chosen preset label/identity without exposing internal source selectors or the encrypted source URL.