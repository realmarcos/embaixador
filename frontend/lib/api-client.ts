const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

export interface ApiErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface Account {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface MediaPreset {
  id: string;
  kind: "original" | "audio" | "video";
  label: string;
  container: string;
  width: number | null;
  height: number | null;
  isOriginal: boolean;
}

export interface MediaAnalysis {
  platform: "YOUTUBE" | "INSTAGRAM" | "FACEBOOK";
  title: string | null;
  thumbnailUrl: string | null;
  options: MediaPreset[];
}

export interface DownloadRecord {
  id: string;
  platform: MediaAnalysis["platform"];
  title: string | null;
  status: "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "MEDIA_DELETED" | "EXPIRED" | "DELETE_FAILED";
  selectedPresetId: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  expiresAt: string | null;
  failureCode: string | null;
  createdAt: string;
}

export interface HistoryPage {
  items: DownloadRecord[];
  nextCursor: string | null;
}

export interface UserSettings {
  themePreference: "LIGHT" | "DARK";
  retentionHours: 1 | 8 | 24 | 72 | 168 | 336 | 720;
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  const hasBody = body !== undefined;
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers,
      credentials: "include",
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "Não foi possível conectar ao servidor. Tente novamente.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
    const code = typeof error?.code === "string" ? error.code : "REQUEST_FAILED";
    const message = typeof error?.message === "string"
      ? error.message
      : "Não foi possível concluir a solicitação. Tente novamente.";
    const requestId = typeof error?.requestId === "string" ? error.requestId : undefined;
    throw new ApiClientError(response.status, code, message, requestId);
  }

  return payload as T;
}

export const apiClient = {
  register(input: { name: string; email: string; password: string }): Promise<Account> {
    return request<Account>("/auth/register", { method: "POST", body: input });
  },
  login(input: { email: string; password: string }): Promise<{ account: Account }> {
    return request<{ account: Account }>("/auth/login", { method: "POST", body: input });
  },
  logout(): Promise<void> {
    return request<void>("/auth/logout", { method: "POST" });
  },
  getCurrentAccount(): Promise<Account> {
    return request<Account>("/auth/me");
  },
  analyzeMedia(url: string): Promise<MediaAnalysis> {
    return request<MediaAnalysis>("/media/analysis", { method: "POST", body: { url } });
  },
  createDownload(input: {
    url: string;
    presetId: string;
  }): Promise<DownloadRecord> {
    return request<DownloadRecord>("/downloads", { method: "POST", body: input });
  },
  getDownload(id: string): Promise<DownloadRecord> {
    return request<DownloadRecord>(`/downloads/${encodeURIComponent(id)}`);
  },
  getDownloadFileUrl(id: string): string {
    return `${apiBaseUrl}/downloads/${encodeURIComponent(id)}/file`;
  },
  getHistory(input: { cursor?: string; limit?: number } = {}): Promise<HistoryPage> {
    const query = new URLSearchParams();
    if (input.cursor) query.set("cursor", input.cursor);
    if (input.limit !== undefined) query.set("limit", String(input.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return request<HistoryPage>(`/history${suffix}`);
  },
  deleteHistoryItem(id: string): Promise<void> {
    return request<void>(`/history/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  deleteAllHistory(): Promise<void> {
    return request<void>("/history", { method: "DELETE" });
  },
  deleteHistoryMedia(id: string): Promise<void> {
    return request<void>(`/history/${encodeURIComponent(id)}/media`, { method: "DELETE" });
  },
  redownloadHistoryItem(id: string): Promise<DownloadRecord> {
    return request<DownloadRecord>(`/history/${encodeURIComponent(id)}/redownload`, { method: "POST" });
  },
  getSettings(): Promise<UserSettings> {
    return request<UserSettings>("/settings");
  },
  updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    return request<UserSettings>("/settings", { method: "PATCH", body: settings });
  },
};