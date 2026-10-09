import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMediaController } from "../media-controller";
import { createSettingsController } from "../settings-controller";

function context({ userId, body }: { userId?: string; body?: unknown } = {}) {
  const request = { body } as Request;
  const state = { status: 0, body: undefined as unknown };
  const response = {
    locals: userId ? { auth: { userId } } : {},
    status(code: number) { state.status = code; return response; },
    json(value: unknown) { state.body = value; return response; },
  } as unknown as Response;
  return { request, response, state };
}

describe("media controller", () => {
  const analyzeMediaService = { execute: vi.fn() };
  const controller = createMediaController({ analyzeMediaService });

  beforeEach(() => {
    vi.clearAllMocks();
    analyzeMediaService.execute.mockResolvedValue({ platform: "YOUTUBE", options: [] });
  });

  it.each([undefined, {}, { url: "" }, { url: "x".repeat(2049) }])("rejects malformed media request %#", async (body) => {
    const http = context({ body });
    const next = vi.fn();

    await controller.analyze(http.request, http.response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_MEDIA_URL", statusCode: 400 });
    expect(analyzeMediaService.execute).not.toHaveBeenCalled();
  });

  it("returns analysis and forwards service failures", async () => {
    const valid = context({ body: { url: "https://youtube.com/watch?v=x" } });
    await controller.analyze(valid.request, valid.response, vi.fn());
    expect(valid.state.status).toBe(200);
    expect(analyzeMediaService.execute).toHaveBeenCalledWith("https://youtube.com/watch?v=x");

    const error = new Error("service failure");
    analyzeMediaService.execute.mockRejectedValueOnce(error);
    const failed = context({ body: { url: "https://youtube.com/watch?v=x" } });
    const next = vi.fn();
    await controller.analyze(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(error);
  });
});

describe("settings controller", () => {
  const getSettingsService = { execute: vi.fn() };
  const updateSettingsService = { execute: vi.fn() };
  const controller = createSettingsController({ getSettingsService, updateSettingsService });

  beforeEach(() => {
    vi.clearAllMocks();
    getSettingsService.execute.mockResolvedValue({ themePreference: "LIGHT", retentionHours: 1 });
    updateSettingsService.execute.mockResolvedValue({ themePreference: "DARK", retentionHours: 24 });
  });

  it("requires an authenticated owner for get and patch", async () => {
    for (const action of [controller.get, controller.patch]) {
      const http = context({ body: { themePreference: "DARK" } });
      const next = vi.fn();
      await action(http.request, http.response, next);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });
    }
    expect(getSettingsService.execute).not.toHaveBeenCalled();
    expect(updateSettingsService.execute).not.toHaveBeenCalled();
  });

  it("reads and patches the exact authenticated owner and forwards errors", async () => {
    const read = context({ userId: "owner-1" });
    await controller.get(read.request, read.response, vi.fn());
    expect(getSettingsService.execute).toHaveBeenCalledWith("owner-1");
    expect(read.state.status).toBe(200);

    const patch = context({ userId: "owner-1", body: { themePreference: "DARK", retentionHours: 24 } });
    await controller.patch(patch.request, patch.response, vi.fn());
    expect(updateSettingsService.execute).toHaveBeenCalledWith({
      userId: "owner-1",
      settings: { themePreference: "DARK", retentionHours: 24 },
    });
    expect(patch.state.status).toBe(200);

    const error = new Error("settings failure");
    getSettingsService.execute.mockRejectedValueOnce(error);
    const failed = context({ userId: "owner-1" });
    const next = vi.fn();
    await controller.get(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(error);

    updateSettingsService.execute.mockRejectedValueOnce(error);
    const failedPatch = context({ userId: "owner-1", body: { retentionHours: 8 } });
    const patchNext = vi.fn();
    await controller.patch(failedPatch.request, failedPatch.response, patchNext);
    expect(patchNext.mock.calls[0]?.[0]).toBe(error);
  });
});