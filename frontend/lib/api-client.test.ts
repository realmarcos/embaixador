import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiClientError, apiClient } from "./api-client.ts";
import { formatFileSize, formatRetentionHours } from "./formatting.ts";
import { nextTheme } from "./theme.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("sends requests with cookies and serializes JSON bodies", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ account: { id: "user-1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await apiClient.login({ email: "ana@example.com", password: "a-long-test-password" });

  assert.equal(requestUrl, "http://localhost:8080/api/auth/login");
  assert.equal(requestInit?.credentials, "include");
  assert.equal(new Headers(requestInit?.headers).get("content-type"), "application/json");
  assert.equal(requestInit?.body, JSON.stringify({ email: "ana@example.com", password: "a-long-test-password" }));
});

test("parses media presets and creates downloads with the selected preset ID", async () => {
  const preset = {
    id: "video-720p",
    kind: "video",
    label: "Vídeo 720p",
    container: "mp4",
    width: null,
    height: 720,
    isOriginal: false,
  };
  const download = {
    id: "download-1",
    platform: "YOUTUBE",
    title: "Safe title",
    status: "QUEUED",
    selectedPresetId: "video-720p",
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    expiresAt: null,
    failureCode: null,
    createdAt: "2026-10-09T12:00:00.000Z",
  };
  let requestPath = "";
  let requestBody: string | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestPath = String(input);
    requestBody = typeof init?.body === "string" ? init.body : undefined;
    const payload = requestPath.endsWith("/media/analysis")
      ? { platform: "YOUTUBE", title: "Safe title", thumbnailUrl: null, options: [preset] }
      : download;
    return new Response(JSON.stringify(payload), {
      status: requestPath.endsWith("/media/analysis") ? 200 : 202,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const analysis = await apiClient.analyzeMedia("https://youtube.com/watch?v=example");
  assert.deepEqual(analysis.options, [preset]);

  const created = await apiClient.createDownload({
    url: "https://youtube.com/watch?v=example",
    presetId: "video-720p",
  });

  assert.equal(requestPath, "http://localhost:8080/api/downloads");
  assert.equal(requestBody, JSON.stringify({ url: "https://youtube.com/watch?v=example", presetId: "video-720p" }));
  assert.equal(created.selectedPresetId, "video-720p");
});

test("parses the safe API error envelope without exposing unstructured server text", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { code: "INVALID_MEDIA_URL", message: "The media URL is invalid", requestId: "request-123" },
  }), { status: 400, headers: { "content-type": "application/json" } })) as typeof fetch;

  await assert.rejects(apiClient.getCurrentAccount(), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "INVALID_MEDIA_URL");
    assert.equal(error.message, "The media URL is invalid");
    assert.equal(error.requestId, "request-123");
    return true;
  });
});

test("uses a generic safe message when an error response is not structured JSON", async () => {
  globalThis.fetch = (async () => new Response("database password leaked", { status: 500 })) as typeof fetch;

  await assert.rejects(apiClient.getSettings(), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, "REQUEST_FAILED");
    assert.equal(error.message, "Não foi possível concluir a solicitação. Tente novamente.");
    assert.equal(error.message.includes("password"), false);
    return true;
  });
});

test("formats file sizes and retention choices", () => {
  assert.equal(formatFileSize(null), null);
  assert.equal(formatFileSize(512 * 1024), "512 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatRetentionHours(1), "1 hora");
  assert.equal(formatRetentionHours(24), "1 dia");
  assert.equal(formatRetentionHours(720), "30 dias");
});

test("toggles the persisted theme preference", () => {
  assert.equal(nextTheme("LIGHT"), "DARK");
  assert.equal(nextTheme("DARK"), "LIGHT");
});