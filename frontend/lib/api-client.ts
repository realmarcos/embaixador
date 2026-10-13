const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

const errorMessages: Readonly<Record<string, string>> = {
  INVALID_MEDIA_URL: "O link da mídia é inválido ou não é seguro. Confira o endereço e tente novamente.",
  UNSUPPORTED_PLATFORM: "Esta plataforma não é suportada. Use um link do YouTube, Instagram ou Facebook.",
  MEDIA_EXTRACTOR_UNAVAILABLE: "O analisador de mídia não está disponível. Peça ao administrador para verificar a instalação e as permissões do yt-dlp.",
  MEDIA_ANALYSIS_TIMEOUT: "A análise demorou demais. Tente novamente; se o problema persistir, peça ao administrador para verificar o proxy e a conexão.",
  MEDIA_PROXY_AUTHENTICATION_FAILED: "O proxy recusou a autenticação. Peça ao administrador para verificar o usuário e a senha do proxy.",
  MEDIA_PROXY_CONNECTION_FAILED: "Não foi possível conectar pelo proxy de mídia. Peça ao administrador para verificar sua disponibilidade e configuração.",
  MEDIA_AUTHENTICATION_REQUIRED: "A plataforma exige login ou verificação para acessar esta mídia. Use um link público; o aplicativo não permite login na plataforma.",
  MEDIA_RATE_LIMITED: "A plataforma está limitando as solicitações. Aguarde antes de tentar novamente.",
  MEDIA_ACCESS_DENIED: "A plataforma negou o acesso à mídia. Confira se o link é público e está disponível na região do servidor ou do proxy.",
  MEDIA_UNAVAILABLE: "Esta mídia está indisponível ou foi removida. Confira o link ou tente outra mídia pública.",
  MEDIA_TLS_FAILED: "Não foi possível verificar o certificado da conexão. Peça ao administrador para verificar os certificados e o proxy, sem desativar a verificação TLS.",
  MEDIA_CONNECTION_FAILED: "Não foi possível acessar a plataforma. Verifique a conexão do servidor ou do proxy e tente novamente.",
  MEDIA_ANALYSIS_INVALID_RESPONSE: "O analisador retornou uma resposta inválida. Confira o link e peça ao administrador para atualizar o yt-dlp.",
  MEDIA_NO_FORMATS: "Nenhum formato de mídia compatível foi encontrado. Tente outro link público ou peça ao administrador para atualizar o yt-dlp.",
  MEDIA_ANALYSIS_FAILED: "Não foi possível analisar a mídia. Confira se o link é público; peça ao administrador para verificar a conexão e atualizar o yt-dlp.",
  MEDIA_DOWNLOAD_FAILED: "Não foi possível baixar a mídia. Tente novamente; se o problema persistir, peça ao administrador para verificar a conexão e o yt-dlp.",
  MEDIA_CONVERSION_FAILED: "Não foi possível converter a mídia. Tente outro formato ou peça ao administrador para verificar o FFmpeg.",
  MEDIA_DELETE_FAILED: "Não foi possível remover o arquivo agora. Tente novamente.",
  MEDIA_STORAGE_WRITE_FAILED: "Não foi possível armazenar a mídia. Peça ao administrador para verificar o serviço de armazenamento.",
  FORMAT_NOT_AVAILABLE: "O formato selecionado não está disponível. Analise o link novamente e escolha outro formato.",
  DOWNLOAD_NOT_FOUND: "O download não foi encontrado.",
  DOWNLOAD_NOT_READY: "Este download ainda não pode ser removido. Aguarde a conclusão do processamento.",
  DOWNLOAD_CREATION_FAILED: "Não foi possível criar o download. Tente novamente.",
  DOWNLOAD_PROCESSING_FAILED: "Não foi possível processar o download. Tente novamente.",
  HISTORY_NOT_FOUND: "O item do histórico não foi encontrado.",
  SOURCE_UNAVAILABLE: "Não é possível baixar esta mídia novamente. Informe um novo link público.",
  INVALID_HISTORY_QUERY: "Os filtros do histórico são inválidos. Atualize a página e tente novamente.",
  INVALID_SETTINGS: "As configurações informadas são inválidas. Confira os valores e tente novamente.",
  INVALID_REQUEST: "Os dados informados são inválidos. Confira os campos e tente novamente.",
  INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  UNAUTHENTICATED: "Sua sessão expirou ou você não está conectado. Entre novamente.",
  ACCOUNT_NOT_FOUND: "A conta não foi encontrada. Entre novamente.",
  INVALID_NAME: "Informe um nome válido.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  INVALID_PASSWORD: "A senha informada não atende aos requisitos. Confira as orientações do formulário.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail.",
  EMAIL_ALREADY_IN_USE: "Este e-mail já está em uso.",
  INTERNAL_SERVER_ERROR: "Ocorreu um erro interno no servidor. Tente novamente; se persistir, entre em contato com o suporte.",
};

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
    const message = Object.hasOwn(errorMessages, code)
      ? errorMessages[code]
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