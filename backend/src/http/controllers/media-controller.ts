import type { RequestHandler } from "express";
import { AppError } from "../../errors/app-errors";
import { AnalyzeMediaService } from "../../services/downloads/analyze-media-service";

interface CreateMediaControllerInput {
  analyzeMediaService: Pick<AnalyzeMediaService, "execute">;
}

function createMediaController({ analyzeMediaService }: CreateMediaControllerInput) {
  const analyze: RequestHandler = async (request, response, next) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (typeof body?.url !== "string" || body.url.length === 0 || body.url.length > 2048) {
      next(new AppError({ message: "A valid media URL is required", code: "INVALID_MEDIA_URL", statusCode: 400 }));
      return;
    }

    try {
      response.status(200).json(await analyzeMediaService.execute(body.url));
    } catch (error) {
      next(error);
    }
  };

  return { analyze };
}

export { createMediaController };