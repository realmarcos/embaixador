# Quickstart: Opções Padrão de Formato para Download

## Prerequisites

- Node.js 24 and the existing backend/frontend dependencies are installed.
- Backend environment is configured without exposing credentials in logs or command output.
- MySQL and the private object-storage service are available for an end-to-end download.
- The configured yt-dlp and FFmpeg executables are available. FFmpeg must include an MP3 encoder and an MP4-compatible audio encoder.
- Use media URLs the signed-in test account is authorized to download; do not use private URLs in reports.

## Automated Checks

From the repository root:

```sh
cd backend
npm test -- --run
npm run lint
npm run build
```

Then run frontend checks:

```sh
cd ../frontend
yarn test
yarn lint
yarn build
```

After a Prisma schema migration is implemented, generate the client and apply migrations using the project's existing commands and a disposable development database:

```sh
cd ../backend
npm run db:generate
npm run db:migrate:dev
```

## Media Scenarios

1. Analyze an authorized source whose maximum video is 720p. Expect video presets at 240p, 360p, 480p, and 720p only; expect audio MP3/MP4 only if audio is present; expect original only if a no-conversion source is available.
2. Analyze sources below 720p and verify that no higher video preset is returned, with no duplicate options for alternate provider encodings.
3. Select audio MP3 and audio MP4 from a source with audio/video. Confirm the resulting files contain an audio stream and no video stream; confirm MIME types are `audio/mpeg` and `audio/mp4` respectively.
4. Select a lower video preset and confirm MP4 output, preserved picture aspect ratio, and dimensions no larger than the source or selected limit.
5. Select DCI 2K from a sufficiently large 16:9 source. Confirm 2048×1080 output, centered picture, black side bars, and no stretching/cropping/upscaling.
6. Select original. Confirm output container is preserved and the FFmpeg conversion path is bypassed.
7. Submit a preset ID that is absent from a fresh analysis. Expect a safe unavailable-format response before the job is queued.
8. Inspect the owned history record after completion. Confirm its selected preset identity matches the delivered file and that no source URL or provider diagnostics are exposed.

For stream-level checks when available, use `ffprobe` from the installed FFmpeg distribution to inspect output stream types and dimensions. Do not print source URLs, credentials, or raw yt-dlp/FFmpeg diagnostics into shared logs.